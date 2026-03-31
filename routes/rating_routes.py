from flask import Blueprint, jsonify

from services.rating_service import process_all_unprocessed_elo_matches

rating_bp = Blueprint("ratings", __name__)


@rating_bp.route("/ratings/process/elo", methods=["POST"])
def process_elo_ratings():
    results = process_all_unprocessed_elo_matches()

    return jsonify({
        "message": "Elo-Ratings erfolgreich verarbeitet.",
        "processed_matches": len(results),
        "results": results
    })