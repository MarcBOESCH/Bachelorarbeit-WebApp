"""Offline comparison: python compare_glicko2.py history.json > comparison.json.

Input is a JSON array: id, played_at (ISO timestamp), team_a/team_b (two
player IDs each), winner_team, score_team_a, score_team_b, four_twenty_mode.
No app configuration is loaded and no database connection is opened.
"""
import argparse
from datetime import datetime
import json

from models.match import Match
from models.team import Team
from services.glicko2_comparison import compare_glicko2_history


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("history")
    parser.add_argument("--placement-matches", type=int, default=10)
    args = parser.parse_args()
    with open(args.history, encoding="utf-8") as source:
        rows = json.load(source)
    matches = []
    for row in rows:
        if any(len(row[t]) != 2 for t in ("team_a", "team_b")):
            raise ValueError("Each team must contain exactly two player IDs")
        if not isinstance(row["four_twenty_mode"], bool):
            raise ValueError("four_twenty_mode must be a JSON boolean")
        matches.append(Match(
            id=row["id"], played_at=datetime.fromisoformat(row["played_at"]),
            team_a=Team(player1_id=row["team_a"][0], player2_id=row["team_a"][1]),
            team_b=Team(player1_id=row["team_b"][0], player2_id=row["team_b"][1]),
            winner_team=row["winner_team"], score_team_a=row["score_team_a"],
            score_team_b=row["score_team_b"], four_twenty_mode=row["four_twenty_mode"]))
    print(json.dumps(compare_glicko2_history(
        matches, placement_matches=args.placement_matches), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
