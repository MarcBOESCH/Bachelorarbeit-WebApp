from flask import Blueprint, jsonify, render_template

from services.rating_service import (
    SUPPORTED_SYSTEMS,
    get_player_ratings_for_system,
    process_all_unprocessed_matches_for_system,
)


rating_page_bp = Blueprint("ratings", __name__)


@rating_page_bp.route("/ratings", methods=["GET"])
def ratings_page():
    return render_template("ratings.html")


@rating_page_bp.route("/ratings/process/<system_name>", methods=["POST"])
def process_ratings_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        return jsonify({
            "error": f"Unbekanntes Rating-System: {system_name}"
        }), 400

    try:
        results = process_all_unprocessed_matches_for_system(system_name)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({
            "error": "Bei der Rating-Verarbeitung ist ein unerwarteter Fehler aufgetreten."
        }), 500

    return jsonify({
        "message": f"{system_name}-Ratings erfolgreich verarbeitet.",
        "system_name": system_name,
        "processed_matches": len(results),
        "results": results
    }), 200


@rating_page_bp.route("/ratings/<system_name>", methods=["GET"])
def get_ratings_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        return jsonify({
            "error": f"Unbekanntes Rating-System: {system_name}"
        }), 400

    try:
        ratings = get_player_ratings_for_system(system_name)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({
            "error": "Beim Laden der Ratings ist ein unerwarteter Fehler aufgetreten."
        }), 500

    return jsonify({
        "system_name": system_name,
        "ratings": ratings
    }), 200