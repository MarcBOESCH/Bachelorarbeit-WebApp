from flask import Blueprint, jsonify, request

from services.match_service import create_match

match_bp = Blueprint("matches", __name__)


@match_bp.route("/matches", methods=["POST"])
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