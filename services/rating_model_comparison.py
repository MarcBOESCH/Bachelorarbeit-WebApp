"""Offline, prequential model comparison: no app, ORM or stored rating input."""
import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import math
from pathlib import Path
import random
from statistics import fmean
from zoneinfo import ZoneInfo

from services.rating_utils import calculate_log_loss
from services.simulation_pipeline_service import (
    evaluate_elo_on_simulation, evaluate_glicko2_on_simulation,
    evaluate_trueskill_on_simulation,
)


@dataclass(frozen=True)
class ComparisonPlayer:
    player_id: int


@dataclass(frozen=True)
class ComparisonMatch:
    match_index: int
    played_at: datetime
    team_a_player1_id: int
    team_a_player2_id: int
    team_b_player1_id: int
    team_b_player2_id: int
    winner_team: str
    point_diff: int

    @property
    def player_ids(self):
        return (self.team_a_player1_id, self.team_a_player2_id,
                self.team_b_player1_id, self.team_b_player2_id)


def load_export_history(directory):
    """Validate a consistent matches/teams/players CSV export before replay."""
    directory = Path(directory)
    tables, hashes = {}, {}
    required = {
        "players": {"id"},
        "teams": {"id", "player1_id", "player2_id"},
        "matches": {"id", "played_at", "team_a_id", "team_b_id", "winner_team",
                    "score_team_a", "score_team_b", "four_twenty_mode", "point_diff"},
    }
    for table, columns in required.items():
        path = directory / (table + ".csv")
        hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if not columns.issubset(reader.fieldnames or []):
                raise ValueError(f"{path.name}: missing required columns")
            rows = list(reader)
        tables[table] = {int(r["id"]): r for r in rows}
        if len(tables[table]) != len(rows):
            raise ValueError(f"{path.name}: duplicate IDs")
    teams = {}
    for tid, row in tables["teams"].items():
        pair = (int(row["player1_id"]), int(row["player2_id"]))
        if len(set(pair)) != 2 or any(pid not in tables["players"] for pid in pair):
            raise ValueError(f"Team {tid}: invalid players")
        teams[tid] = pair
    history, excluded = [], []
    for mid, row in tables["matches"].items():
        a, b = int(row["score_team_a"]), int(row["score_team_b"])
        winner, mode = row["winner_team"], row["four_twenty_mode"].lower()
        if (winner not in {"A", "B"} or mode not in {"true", "false"}
                or min(a, b) < 0 or a == b or int(row["point_diff"]) != abs(a-b)):
            raise ValueError(f"Match {mid}: invalid result")
        try:
            ids = teams[int(row["team_a_id"])] + teams[int(row["team_b_id"])]
        except KeyError as exc:
            raise ValueError(f"Match {mid}: missing team") from exc
        if len(set(ids)) != 4:
            raise ValueError(f"Match {mid}: duplicate players")
        timestamp = datetime.fromisoformat(row["played_at"])
        # Database timestamps without timezone are UTC (see time_utils.py).
        if timestamp.tzinfo is not None:
            timestamp = timestamp.astimezone(timezone.utc).replace(tzinfo=None)
        if mode == "true" and (a if winner == "A" else b) == 420:
            excluded.append(mid)
            continue
        if (a > b) != (winner == "A"):
            raise ValueError(f"Match {mid}: winner contradicts score")
        history.append(ComparisonMatch(mid, timestamp, *ids, winner, abs(a-b)))
    history.sort(key=lambda m: (m.played_at, m.match_index))
    return history, [ComparisonPlayer(pid) for pid in sorted(tables["players"])], {
        "source_sha256": hashes, "exported_matches": len(tables["matches"]),
        "excluded_420_match_ids": sorted(excluded),
    }


def score_predictions(rows):
    """Proper scores use unrounded p; 50:50 gets half credit for accuracy.

    Public evaluation payloads retain their existing A-on-tie accuracy for
    backwards compatibility. This comparison never uses that biased metric.
    """
    if not rows:
        return {"matches": 0, "brier_score": None, "log_loss": None,
                "accuracy_percent": None, "ties": 0}
    for r in rows:
        if not math.isfinite(r["p_a"]) or not 0 <= r["p_a"] <= 1 or r["y"] not in (0, 1):
            raise ValueError("Invalid probability or outcome")
    def is_tie(p):
        # Numerical update noise must not choose a winner for a neutral game.
        return math.isclose(p, .5, rel_tol=0, abs_tol=1e-12)

    return {
        "matches": len(rows),
        "brier_score": fmean((r["p_a"] - r["y"]) ** 2 for r in rows),
        "log_loss": fmean(calculate_log_loss(r["p_a"], r["y"]) for r in rows),
        "accuracy_percent": 100 * fmean(
            .5 if is_tie(r["p_a"]) else float((r["p_a"] > .5) == bool(r["y"])) for r in rows),
        "ties": sum(is_tie(r["p_a"]) for r in rows),
    }


def _paired_day_bootstrap(left, right, *, samples=2000, seed=420):
    """Descriptive paired cluster interval, not proof of independent sessions.

    Resample whole local calendar days with replacement. Repeated players
    across days remain dependent; interpret this interval cautiously.
    """
    groups = {}
    for a, b in zip(left, right):
        if a["match_id"] != b["match_id"]:
            raise ValueError("Model predictions are not aligned")
        groups.setdefault(a["day"], []).append((a["p_a"]-a["y"])**2 - (b["p_a"]-b["y"])**2)
    blocks = list(groups.values())
    if len(blocks) < 2:
        return {"days": len(blocks), "brier_difference_95pct_interval": None}
    rng = random.Random(seed)
    means = []
    for _ in range(samples):
        draw = rng.choices(blocks, k=len(blocks))
        means.append(sum(sum(block) for block in draw) / sum(len(block) for block in draw))
    means.sort()
    return {"days": len(blocks), "samples": samples, "seed": seed,
            "brier_difference_95pct_interval": [means[int(.025*samples)], means[int(.975*samples)]]}


def compare_rating_models(history, players):
    history = sorted(history, key=lambda m: (m.played_at, m.match_index))
    if len({m.match_index for m in history}) != len(history):
        raise ValueError("Duplicate match IDs")
    metadata, counts = [], {}
    for m in history:
        metadata.append(dict(match_id=m.match_index,
            played_at=m.played_at.isoformat(),
            day=m.played_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Europe/Vienna")).date().isoformat(),
            y=int(m.winner_team == "A"),
            all_players_placed=all(counts.get(pid, 0) >= 10 for pid in m.player_ids)))
        for pid in m.player_ids:
            counts[pid] = counts.get(pid, 0) + 1
    evaluators = {"elo": evaluate_elo_on_simulation,
                  "glicko2_corrected": evaluate_glicko2_on_simulation,
                  "trueskill": evaluate_trueskill_on_simulation}
    predictions = {"coin_flip": [dict(m, p_a=.5) for m in metadata]}
    for name, evaluate in evaluators.items():
        details = evaluate(history, players)["details"]
        if [d["match_index"] for d in details] != [m["match_id"] for m in metadata]:
            raise ValueError("Evaluator changed history ordering")
        predictions[name] = [dict(m, p_a=d["probability_a"]) for m, d in zip(metadata, details)]
    metrics = {}
    for name, rows in predictions.items():
        metrics[name] = {
            "all": score_predictions(rows),
            "second_half": score_predictions(rows[len(rows)//2:]),
            "all_players_placed_before_match": score_predictions([r for r in rows if r["all_players_placed"]]),
            "with_unplaced_players": score_predictions([r for r in rows if not r["all_players_placed"]]),
        }
    paired = {}
    for name in ("glicko2_corrected", "trueskill"):
        paired[name + "_minus_elo"] = _paired_day_bootstrap(predictions[name], predictions["elo"])
        paired[name + "_minus_elo"]["brier_difference"] = (
            metrics[name]["all"]["brier_score"] - metrics["elo"]["all"]["brier_score"]
            if history else None)
    return {"method": "Chronological predict-before-update; no parameter fitting; (played_at, id) order",
            "parameters": {"elo_k": 32, "glicko_start": [1500, 350, .06], "glicko_tau": .5,
                           "trueskill": {"mu": 25, "sigma": 8.333, "beta": 4.167, "tau": .083, "draw_probability": 0}},
            "metrics": metrics, "paired_day_bootstrap": paired, "predictions": predictions,
            "limitations": ["Small, previously inspected convenience sample; no untouched test set.",
                            "Second half is descriptive sequential evaluation, not a tuned holdout.",
                            "Day clusters do not remove dependence between repeated players.",
                            "Placement subsets depend only on counts before each match.",
                            "A ranking uncertainty penalty is not evaluated or applied."]}
