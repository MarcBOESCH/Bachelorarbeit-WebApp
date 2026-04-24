from __future__ import annotations

import math
import random
import csv
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class SimulatedPlayer:
    player_id: int
    name: str
    true_skill: float


@dataclass
class SimulatedMatch:
    match_index: int
    played_at: datetime
    team_a_player1_id: int
    team_a_player2_id: int
    team_b_player1_id: int
    team_b_player2_id: int
    team_a_true_strength: float
    team_b_true_strength: float
    win_probability_a: float
    winner_team: str
    score_team_a: int
    score_team_b: int
    point_diff: int


@dataclass
class SimulationScenario:
    name: str
    num_players: int
    num_matches: int
    probability_scale: float
    base_margin: float
    margin_scale: float
    margin_noise_std: float
    minutes_between_matches: int = 10
    player_skill_mean: float = 0.0
    player_skill_std_dev: float = 1.0


def _get_rng(seed: Optional[int] = None) -> random.Random:
    return random.Random(seed)


SIMULATION_SCENARIOS: dict[str, SimulationScenario] = {
    "standard": SimulationScenario(
        name="standard",
        num_players=12,
        num_matches=300,
        probability_scale=1.0,
        base_margin=80.0,
        margin_scale=60.0,
        margin_noise_std=35.0,
        minutes_between_matches=10,
        player_skill_mean=0.0,
        player_skill_std_dev=1.0,
    ),
    "low_data": SimulationScenario(
        name="low_data",
        num_players=12,
        num_matches=60,
        probability_scale=1.0,
        base_margin=80.0,
        margin_scale=60.0,
        margin_noise_std=35.0,
        minutes_between_matches=10,
        player_skill_mean=0.0,
        player_skill_std_dev=1.0,
    ),
    "high_rotation": SimulationScenario(
        name="high_rotation",
        num_players=20,
        num_matches=300,
        probability_scale=1.0,
        base_margin=80.0,
        margin_scale=60.0,
        margin_noise_std=35.0,
        minutes_between_matches=10,
        player_skill_mean=0.0,
        player_skill_std_dev=1.0,
    ),
    "high_noise": SimulationScenario(
        name="high_noise",
        num_players=12,
        num_matches=300,
        probability_scale=1.5,
        base_margin=80.0,
        margin_scale=45.0,
        margin_noise_std=70.0,
        minutes_between_matches=10,
        player_skill_mean=0.0,
        player_skill_std_dev=1.0,
    ),
}


def generate_simulated_players(
    num_players: int,
    seed: Optional[int] = None,
    mean: float = 0.0,
    std_dev: float = 1.0,
) -> list[SimulatedPlayer]:
    if num_players < 4:
        raise ValueError("Es müssen mindestens 4 Spieler simuliert werden.")

    if std_dev <= 0:
        raise ValueError("std_dev muss größer als 0 sein.")

    rng = _get_rng(seed)
    players: list[SimulatedPlayer] = []

    for player_id in range(1, num_players + 1):
        true_skill = rng.gauss(mean, std_dev)
        players.append(
            SimulatedPlayer(
                player_id=player_id,
                name=f"Player {player_id}",
                true_skill=true_skill,
            )
        )

    return players


def sample_match_players(
    players: list[SimulatedPlayer],
    rng: random.Random,
) -> list[SimulatedPlayer]:
    if len(players) < 4:
        raise ValueError("Für ein Match werden mindestens 4 Spieler benötigt.")

    return rng.sample(players, 4)


def build_teams(
    sampled_players: list[SimulatedPlayer],
    rng: random.Random,
) -> tuple[list[SimulatedPlayer], list[SimulatedPlayer]]:
    if len(sampled_players) != 4:
        raise ValueError("Es müssen genau 4 Spieler für die Teambildung vorliegen.")

    shuffled = sampled_players[:]
    rng.shuffle(shuffled)

    team_a = [shuffled[0], shuffled[1]]
    team_b = [shuffled[2], shuffled[3]]
    return team_a, team_b


def compute_team_strength(team: list[SimulatedPlayer]) -> float:
    if len(team) != 2:
        raise ValueError("Ein Team muss aus genau 2 Spielern bestehen.")

    return sum(player.true_skill for player in team)


def compute_win_probability(
    team_a_strength: float,
    team_b_strength: float,
    scale: float = 1.0,
) -> float:
    if scale <= 0:
        raise ValueError("scale muss größer als 0 sein.")

    diff = team_a_strength - team_b_strength
    return 1.0 / (1.0 + math.exp(-(diff / scale)))


def sample_match_outcome(
    win_probability_a: float,
    rng: random.Random,
) -> str:
    if not 0.0 <= win_probability_a <= 1.0:
        raise ValueError("win_probability_a muss zwischen 0 und 1 liegen.")

    return "A" if rng.random() < win_probability_a else "B"


def sample_point_diff(
    team_a_strength: float,
    team_b_strength: float,
    winner_team: str,
    rng: random.Random,
    base_margin: float = 80.0,
    margin_scale: float = 60.0,
    margin_noise_std: float = 35.0,
    max_margin: int = 500,
) -> int:
    if winner_team not in {"A", "B"}:
        raise ValueError("winner_team muss 'A' oder 'B' sein.")

    if margin_noise_std < 0:
        raise ValueError("margin_noise_std darf nicht negativ sein.")

    strength_gap = abs(team_a_strength - team_b_strength)
    expected_margin = base_margin + margin_scale * strength_gap
    noisy_margin = rng.gauss(expected_margin, margin_noise_std)

    point_diff = max(1, round(noisy_margin))
    point_diff = min(point_diff, max_margin)
    return point_diff


def build_scores_from_winner(
    winner_team: str,
    point_diff: int,
    winning_score: int = 1000,
) -> tuple[int, int]:
    if winner_team not in {"A", "B"}:
        raise ValueError("winner_team muss 'A' oder 'B' sein.")

    if point_diff <= 0:
        raise ValueError("point_diff muss größer als 0 sein.")

    losing_score = max(0, winning_score - point_diff)

    if winner_team == "A":
        return winning_score, losing_score

    return losing_score, winning_score


def build_simulated_match(
    match_index: int,
    team_a: list[SimulatedPlayer],
    team_b: list[SimulatedPlayer],
    played_at: datetime,
    rng: random.Random,
    probability_scale: float = 1.0,
    base_margin: float = 80.0,
    margin_scale: float = 60.0,
    margin_noise_std: float = 35.0,
    winning_score: int = 1000,
) -> SimulatedMatch:
    team_a_strength = compute_team_strength(team_a)
    team_b_strength = compute_team_strength(team_b)

    win_probability_a = compute_win_probability(
        team_a_strength=team_a_strength,
        team_b_strength=team_b_strength,
        scale=probability_scale,
    )

    winner_team = sample_match_outcome(
        win_probability_a=win_probability_a,
        rng=rng,
    )

    point_diff = sample_point_diff(
        team_a_strength=team_a_strength,
        team_b_strength=team_b_strength,
        winner_team=winner_team,
        rng=rng,
        base_margin=base_margin,
        margin_scale=margin_scale,
        margin_noise_std=margin_noise_std,
    )

    score_team_a, score_team_b = build_scores_from_winner(
        winner_team=winner_team,
        point_diff=point_diff,
        winning_score=winning_score,
    )

    return SimulatedMatch(
        match_index=match_index,
        played_at=played_at,
        team_a_player1_id=team_a[0].player_id,
        team_a_player2_id=team_a[1].player_id,
        team_b_player1_id=team_b[0].player_id,
        team_b_player2_id=team_b[1].player_id,
        team_a_true_strength=team_a_strength,
        team_b_true_strength=team_b_strength,
        win_probability_a=win_probability_a,
        winner_team=winner_team,
        score_team_a=score_team_a,
        score_team_b=score_team_b,
        point_diff=point_diff,
    )


def generate_simulated_matches(
    players: list[SimulatedPlayer],
    num_matches: int,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
    minutes_between_matches: int = 10,
    probability_scale: float = 1.0,
    base_margin: float = 80.0,
    margin_scale: float = 60.0,
    margin_noise_std: float = 35.0,
    winning_score: int = 1000,
) -> list[SimulatedMatch]:
    if num_matches <= 0:
        raise ValueError("num_matches muss größer als 0 sein.")

    if minutes_between_matches <= 0:
        raise ValueError("minutes_between_matches muss größer als 0 sein.")

    rng = _get_rng(seed)
    start = start_time or datetime(2025, 1, 1, 18, 0, 0)

    matches: list[SimulatedMatch] = []

    for match_index in range(1, num_matches + 1):
        sampled_players = sample_match_players(players, rng)
        team_a, team_b = build_teams(sampled_players, rng)

        played_at = start + timedelta(minutes=(match_index - 1) * minutes_between_matches)

        match = build_simulated_match(
            match_index=match_index,
            team_a=team_a,
            team_b=team_b,
            played_at=played_at,
            rng=rng,
            probability_scale=probability_scale,
            base_margin=base_margin,
            margin_scale=margin_scale,
            margin_noise_std=margin_noise_std,
            winning_score=winning_score,
        )
        matches.append(match)

    return matches


def players_to_dicts(players: list[SimulatedPlayer]) -> list[dict]:
    return [asdict(player) for player in players]


def matches_to_dicts(matches: list[SimulatedMatch]) -> list[dict]:
    result: list[dict] = []

    for match in matches:
        match_dict = asdict(match)
        match_dict["played_at"] = match.played_at.isoformat()
        result.append(match_dict)

    return result


def get_simulation_scenario(name: str) -> SimulationScenario:
    if name not in SIMULATION_SCENARIOS:
        available = ", ".join(sorted(SIMULATION_SCENARIOS.keys()))
        raise ValueError(f"Unbekanntes Simulationsszenario: {name}. Verfügbar: {available}")

    return SIMULATION_SCENARIOS[name]


def list_simulation_scenarios() -> list[str]:
    return sorted(SIMULATION_SCENARIOS.keys())


def generate_simulation_scenario(
    scenario_name: str,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
) -> dict:
    scenario = get_simulation_scenario(scenario_name)

    players = generate_simulated_players(
        num_players=scenario.num_players,
        seed=seed,
        mean=scenario.player_skill_mean,
        std_dev=scenario.player_skill_std_dev,
    )

    matches = generate_simulated_matches(
        players=players,
        num_matches=scenario.num_matches,
        seed=seed,
        start_time=start_time,
        minutes_between_matches=scenario.minutes_between_matches,
        probability_scale=scenario.probability_scale,
        base_margin=scenario.base_margin,
        margin_scale=scenario.margin_scale,
        margin_noise_std=scenario.margin_noise_std,
    )

    return {
        "scenario": asdict(scenario),
        "players": players,
        "matches": matches,
    }


def generate_simulation_scenario_dicts(
    scenario_name: str,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
) -> dict:
    result = generate_simulation_scenario(
        scenario_name=scenario_name,
        seed=seed,
        start_time=start_time,
    )

    return {
        "scenario": result["scenario"],
        "players": players_to_dicts(result["players"]),
        "matches": matches_to_dicts(result["matches"]),
    }


def export_simulation_to_json(
    output_path: str | Path,
    scenario_name: str,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
) -> Path:
    output_path = Path(output_path)

    data = generate_simulation_scenario_dicts(
        scenario_name=scenario_name,
        seed=seed,
        start_time=start_time,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return output_path


def export_simulation_players_to_csv(
    output_path: str | Path,
    players: list[SimulatedPlayer],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = ["player_id", "name", "true_skill"]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for player in players:
            writer.writerow({
                "player_id": player.player_id,
                "name": player.name,
                "true_skill": round(player.true_skill, 6),
            })

    return output_path


def export_simulation_matches_to_csv(
    output_path: str | Path,
    matches: list[SimulatedMatch],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "match_index",
        "played_at",
        "team_a_player1_id",
        "team_a_player2_id",
        "team_b_player1_id",
        "team_b_player2_id",
        "team_a_true_strength",
        "team_b_true_strength",
        "win_probability_a",
        "winner_team",
        "score_team_a",
        "score_team_b",
        "point_diff",
    ]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for match in matches:
            writer.writerow({
                "match_index": match.match_index,
                "played_at": match.played_at.isoformat(),
                "team_a_player1_id": match.team_a_player1_id,
                "team_a_player2_id": match.team_a_player2_id,
                "team_b_player1_id": match.team_b_player1_id,
                "team_b_player2_id": match.team_b_player2_id,
                "team_a_true_strength": round(match.team_a_true_strength, 6),
                "team_b_true_strength": round(match.team_b_true_strength, 6),
                "win_probability_a": round(match.win_probability_a, 6),
                "winner_team": match.winner_team,
                "score_team_a": match.score_team_a,
                "score_team_b": match.score_team_b,
                "point_diff": match.point_diff,
            })

    return output_path


def export_simulation_scenario_to_csv(
    output_dir: str | Path,
    scenario_name: str,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
) -> dict[str, Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result = generate_simulation_scenario(
        scenario_name=scenario_name,
        seed=seed,
        start_time=start_time,
    )

    players_path = output_dir / f"{scenario_name}_players.csv"
    matches_path = output_dir / f"{scenario_name}_matches.csv"
    metadata_path = output_dir / f"{scenario_name}_metadata.json"

    export_simulation_players_to_csv(players_path, result["players"])
    export_simulation_matches_to_csv(matches_path, result["matches"])

    with metadata_path.open("w", encoding="utf-8") as f:
        json.dump(result["scenario"], f, ensure_ascii=False, indent=2)

    return {
        "players_csv": players_path,
        "matches_csv": matches_path,
        "metadata_json": metadata_path,
    }


def export_simulation_bundle(
    output_dir: str | Path,
    scenario_name: str,
    seed: Optional[int] = None,
    start_time: Optional[datetime] = None,
) -> dict[str, Path]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / f"{scenario_name}_bundle.json"
    csv_paths = export_simulation_scenario_to_csv(
        output_dir=output_dir,
        scenario_name=scenario_name,
        seed=seed,
        start_time=start_time,
    )
    export_simulation_to_json(
        output_path=json_path,
        scenario_name=scenario_name,
        seed=seed,
        start_time=start_time,
    )

    return {
        "bundle_json": json_path,
        **csv_paths,
    }