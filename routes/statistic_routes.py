from flask import Blueprint, jsonify, request

from services.player_stats_service import get_player_stats

stats_bp = Blueprint("stats", __name__)


@stats_bp.route("/player-stats", methods=["GET"])
def get_player_stats_route():
    stats = get_player_stats()
    return jsonify(stats)
