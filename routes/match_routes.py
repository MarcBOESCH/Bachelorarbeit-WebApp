from flask import Blueprint, jsonify, redirect, render_template, request, url_for

from models.team import Team
from services.game_service import (
    BUTTON_VALUES,
    add_manual_points,
    add_points,
    get_game_state,
    has_active_match,
    lock_saved_match,
    reset_game,
    start_new_game,
    undo_last_action,
)
from services.match_service import create_match, get_all_matches


match_page_bp = Blueprint("matches", __name__)


def build_match_history_payload(match):
    return {
        "id": match.id,
        "score_team_a": match.score_team_a,
        "score_team_b": match.score_team_b,
        "point_diff": match.point_diff,
        "winner_team": match.winner_team,
        "played_at": match.played_at.isoformat(),
        "team_a_players": [
            {"name": match.team_a.player1.name, "team_slot": 1},
            {"name": match.team_a.player2.name, "team_slot": 2},
        ],
        "team_b_players": [
            {"name": match.team_b.player1.name, "team_slot": 1},
            {"name": match.team_b.player2.name, "team_slot": 2},
        ],
    }


def validate_selected_teams(team_a_id, team_b_id):
    if not team_a_id or not team_b_id:
        return None, None, jsonify({"error": "Beide Teams müssen ausgewählt sein."}), 400

    team_a = Team.query.get(team_a_id)
    team_b = Team.query.get(team_b_id)

    if not team_a or not team_b:
        return None, None, jsonify({"error": "Ein ausgewähltes Team existiert nicht in der Datenbank."}), 400

    players_a = {team_a.player1_id, team_a.player2_id}
    players_b = {team_b.player1_id, team_b.player2_id}

    if players_a.intersection(players_b):
        return None, None, jsonify({"error": "Ein Spieler darf nicht in beiden Teams sein."}), 400

    return team_a, team_b, None, None


@match_page_bp.route("/player-selection")
def player_selection_page():
    return render_template("player_selection.html")


@match_page_bp.route("/match")
def match_page():
    game = get_game_state()

    if not has_active_match(game):
        return redirect(url_for("matches.player_selection_page"))

    return render_template("match.html", game=game)


@match_page_bp.route("/api/match/start", methods=["POST"])
def start_match_route():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    team_a_id = data.get("team_a_id")
    team_b_id = data.get("team_b_id")

    team_a, team_b, error_response, status_code = validate_selected_teams(team_a_id, team_b_id)

    if error_response:
        return error_response, status_code

    game = start_new_game(team_a.name, team_b.name, team_a.id, team_b.id)

    return jsonify({
        "message": "Match erfolgreich gestartet.",
        "game": game,
    }), 201


@match_page_bp.route("/api/matches", methods=["GET"])
def get_matches_route():
    matches = get_all_matches()
    result = [build_match_history_payload(match) for match in matches]
    return jsonify(result), 200


@match_page_bp.route("/api/matches", methods=["POST"])
def create_match_route():
    game = get_game_state()

    if not has_active_match(game):
        return jsonify({"error": "Es ist aktuell kein aktives Match gestartet."}), 400

    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    score_team_a = data.get("score_team_a")
    score_team_b = data.get("score_team_b")
    team_a_id = game.get("team_a_id")
    team_b_id = game.get("team_b_id")

    success, error, match = create_match(score_team_a, score_team_b, team_a_id, team_b_id)

    if not success:
        return jsonify({"error": error}), 400

    lock_saved_match(game)

    return jsonify({
        "message": "Match erfolgreich gespeichert.",
        "match_id": match.id,
    }), 201


@match_page_bp.route("/action", methods=["POST"])
def action_route():
    game = get_game_state()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    action = data.get("action")
    team = data.get("team")

    if action == "new_game":
        reset_game()
        return jsonify({
            "redirect_url": url_for("matches.player_selection_page")
        }), 200

    if not has_active_match(game):
        return jsonify({"error": "Es ist aktuell kein aktives Match gestartet."}), 400

    if action == "undo":
        success, error = undo_last_action(game)
        if not success:
            return jsonify({"error": error}), 400
        return jsonify(game), 200

    if action == "manual_input":
        value = data.get("value")

        try:
            value = int(value)
        except (TypeError, ValueError):
            return jsonify({"error": "Ungültiger Zahlenwert."}), 400

        success, error = add_manual_points(game, team, value)
        if not success:
            return jsonify({"error": error}), 400

        return jsonify(game), 200

    if action in BUTTON_VALUES:
        success, error = add_points(game, team, action)
        if not success:
            return jsonify({"error": error}), 400

        return jsonify(game), 200

    return jsonify({"error": "Unbekannte Aktion."}), 400