from flask import Blueprint, jsonify

from services.evaluation_service import evaluate_predictions_for_system

evaluation_bp = Blueprint("evaluation", __name__)

@evaluation_bp.route("/evaluation/<system_name>", methods=["GET"])
def evaluate_system(system_name):
    try:
        result = evaluate_predictions_for_system(system_name)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except Exception:
        return jsonify({
            "error": "Bei der Evaluation ist ein unerwarteter Fehler aufgetreten."
        }), 500

    return jsonify(result)