from flask import Blueprint, jsonify, request

from services.player_service import create_player, get_all_players
from services.player_stats_service import get_player_stats

player_bp = Blueprint("players", __name__)


@player_bp.route("/players", methods=["POST"])
def create_player_route():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten"}), 400

    name = data.get("name")

    success, error, player = create_player(name)

    if not success:
        return jsonify({"error": error}), 400

    return jsonify({
        "message": "Spieler erfolgreich erstellt",
        "player": {
            "id": player.id,
            "name": player.name
        }
    }), 201


@player_bp.route("/players", methods=["GET"])
def get_players():
    players = get_all_players()

    return jsonify([
        {
            "id": player.id,
            "name": player.name
        }
        for player in players
    ])

@player_bp.route("/player-stats", methods=["GET"])
def get_player_stats_route():
    stats = get_player_stats()
    return jsonify(stats)