from flask import Blueprint, jsonify, render_template

from services.player_stats_service import get_player_stats

statistics_page_bp = Blueprint("statistics", __name__)
statistics_api_bp = Blueprint("statistics_api", __name__)


@statistics_page_bp.route("/statistics")
def statistics_page():
    return render_template("statistics.html")


@statistics_api_bp.route("/api/player-stats", methods=["GET"])
def player_stats():
    stats = get_player_stats()
    return jsonify(stats), 200