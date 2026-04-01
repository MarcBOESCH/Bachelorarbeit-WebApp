from flask import Blueprint, jsonify, request

from services.match_service import create_match, get_all_matches
from services.game_service import get_game_state, lock_saved_match

match_page_bp = Blueprint("matches", __name__)


@match_page_bp.route("/api/matches", methods=["POST"])
def create_match_route():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    score_team_a = data.get("score_team_a")
    score_team_b = data.get("score_team_b")
    players = data.get("players")

    success, error, match = create_match(score_team_a, score_team_b, players)

    if not success:
        return jsonify({"error": error}), 400

    game = get_game_state()
    lock_saved_match(game)

    return jsonify({
        "message": "Match erfolgreich gespeichert.",
        "match": {
            "id": match.id,
            "score_team_a": match.score_team_a,
            "score_team_b": match.score_team_b,
            "point_diff": match.point_diff,
            "winner_team": match.winner_team
        }
    }), 201

@match_page_bp.route("/api/matches", methods=["GET"])
def get_matches():
    matches = get_all_matches()

    result = []

    for match in matches:
        team_a_players = []
        team_b_players = []

        sorted_players = sorted(match.players, key=lambda p_entry: (p_entry.team, p_entry.team_slot))

        for entry in sorted_players:
            player_data = {
                "id": entry.player.id,
                "name": entry.player.name,
                "team_slot": entry.team_slot
            }

            if entry.team == "A":
                team_a_players.append(player_data)
            elif entry.team == "B":
                team_b_players.append(player_data)

        result.append({
            "id": match.id,
            "played_at": match.played_at.isoformat(),
            "score_team_a": match.score_team_a,
            "score_team_b": match.score_team_b,
            "point_diff": match.point_diff,
            "winner_team": match.winner_team,
            "team_a_players": team_a_players,
            "team_b_players": team_b_players
        })

    return jsonify(result)

