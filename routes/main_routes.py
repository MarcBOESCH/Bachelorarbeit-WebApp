from flask import Blueprint, jsonify, render_template, request

from services.player_service import create_player

from services.game_service import (
    BUTTON_VALUES,
    add_manual_points,
    add_points,
    get_game_state,
    reset_game,
    undo_last_action,
)

# Blueprint für die Hauptseiten und Spielaktionen
main_bp = Blueprint("main", __name__)


# Startseite mit aktuellem Spielstand
@main_bp.route("/")
def index():
    game = get_game_state()
    return render_template("index.html", game=game)


# Zentrale API-Route für alle Spielaktionen aus dem Frontend
@main_bp.route("/action", methods=["POST"])
def handle_action():
    game = get_game_state()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten"}), 400

    action = data.get("action")
    team = data.get("team")

    if action == "new_game":
        game = reset_game()
        return jsonify(game)

    if action == "undo":
        success, error = undo_last_action(game)
        if not success:
            return jsonify({"error": error}), 400
        return jsonify(game)

    if action == "manual_input":
        value = data.get("value")

        try:
            value = int(value)
        except (TypeError, ValueError):
            return jsonify({"error": "Ungültiger Zahlenwert"}), 400

        success, error = add_manual_points(game, team, value)
        if not success:
            return jsonify({"error": error}), 400

        return jsonify(game)

    if action in BUTTON_VALUES:
        success, error = add_points(game, team, action)
        if not success:
            return jsonify({"error": error}), 400
        return jsonify(game)

    return jsonify({"error": "Unbekannte Aktion"}), 400
