from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass
class LoadedSimulatedPlayer:
    player_id: int
    name: str
    true_skill: float


@dataclass
class LoadedSimulatedMatch:
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


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def load_simulation_players_from_csv(path: str | Path) -> list[LoadedSimulatedPlayer]:
    path = Path(path)

    players: list[LoadedSimulatedPlayer] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            players.append(
                LoadedSimulatedPlayer(
                    player_id=int(row["player_id"]),
                    name=row["name"],
                    true_skill=float(row["true_skill"]),
                )
            )

    return players


def load_simulation_matches_from_csv(path: str | Path) -> list[LoadedSimulatedMatch]:
    path = Path(path)

    matches: list[LoadedSimulatedMatch] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            matches.append(
                LoadedSimulatedMatch(
                    match_index=int(row["match_index"]),
                    played_at=_parse_datetime(row["played_at"]),
                    team_a_player1_id=int(row["team_a_player1_id"]),
                    team_a_player2_id=int(row["team_a_player2_id"]),
                    team_b_player1_id=int(row["team_b_player1_id"]),
                    team_b_player2_id=int(row["team_b_player2_id"]),
                    team_a_true_strength=float(row["team_a_true_strength"]),
                    team_b_true_strength=float(row["team_b_true_strength"]),
                    win_probability_a=float(row["win_probability_a"]),
                    winner_team=row["winner_team"],
                    score_team_a=int(row["score_team_a"]),
                    score_team_b=int(row["score_team_b"]),
                    point_diff=int(row["point_diff"]),
                )
            )

    return matches


def load_simulation_bundle_from_json(path: str | Path) -> dict[str, Any]:
    path = Path(path)

    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    players = [
        LoadedSimulatedPlayer(
            player_id=int(player["player_id"]),
            name=player["name"],
            true_skill=float(player["true_skill"]),
        )
        for player in raw["players"]
    ]

    matches = [
        LoadedSimulatedMatch(
            match_index=int(match["match_index"]),
            played_at=_parse_datetime(match["played_at"]),
            team_a_player1_id=int(match["team_a_player1_id"]),
            team_a_player2_id=int(match["team_a_player2_id"]),
            team_b_player1_id=int(match["team_b_player1_id"]),
            team_b_player2_id=int(match["team_b_player2_id"]),
            team_a_true_strength=float(match["team_a_true_strength"]),
            team_b_true_strength=float(match["team_b_true_strength"]),
            win_probability_a=float(match["win_probability_a"]),
            winner_team=match["winner_team"],
            score_team_a=int(match["score_team_a"]),
            score_team_b=int(match["score_team_b"]),
            point_diff=int(match["point_diff"]),
        )
        for match in raw["matches"]
    ]

    return {
        "scenario": raw["scenario"],
        "players": players,
        "matches": matches,
    }