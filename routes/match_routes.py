from flask import Blueprint, jsonify, redirect, render_template, request, url_for
from models.team import Team

from services.game_service import (
    BUTTON_VALUES,
    add_manual_points,
    add_points,
    get_game_state,
    has_active_match,
    reset_game,
    start_new_game,
    undo_last_action,
    lock_saved_match
)
from services.match_service import create_match, get_all_matches

match_page_bp = Blueprint("matches", __name__)


@match_page_bp.route("/player-selection")
def player_selection_page():
    """
    Setup-Seite für Teamnamen und Spielerauswahl.
    """
    return render_template("player_selection.html")


@match_page_bp.route("/match")
def match_page():
    """
    Seite für das aktive Match.
    Wenn noch kein Match aktiv ist, zurück zur Spielerauswahl.
    """
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

    if not team_a_id or not team_b_id:
        return jsonify({"error": "Beide Teams müssen ausgewählt sein."}), 400

    team_a = Team.query.get(team_a_id)
    team_b = Team.query.get(team_b_id)

    if not team_a or not team_b:
        return jsonify({"error": "Ein ausgewähltes Team existiert nicht in der Datenbank."}), 400

    # Überschneidung prüfen
    players_a = {team_a.player1_id, team_a.player2_id}
    players_b = {team_b.player1_id, team_b.player2_id}
    if players_a.intersection(players_b):
        return jsonify({"error": "Ein Spieler darf nicht in beiden Teams sein."}), 400

    # Startet das Spiel mit den festen Teamnamen
    game = start_new_game(team_a.name, team_b.name, team_a.id, team_b.id)

    return jsonify({
        "message": "Match erfolgreich gestartet.",
        "game": game
    }), 201


@match_page_bp.route("/api/matches", methods=["GET", "POST"])
def api_matches():
    if request.method == "POST":
        game = get_game_state()
        if not has_active_match(game):
            return jsonify({"error": "Es ist aktuell kein aktives Match gestartet."}), 400

        data = request.get_json()
        score_team_a = data.get("score_team_a")
        score_team_b = data.get("score_team_b")
        team_a_id = game.get("team_a_id")
        team_b_id = game.get("team_b_id")

        success, error, match = create_match(score_team_a, score_team_b, team_a_id, team_b_id)

        if not success:
            return jsonify({"error": error}), 400

        lock_saved_match(game)
        return jsonify({"message": "Match erfolgreich gespeichert.", "match_id": match.id}), 201

    elif request.method == "GET":
        matches = get_all_matches()
        result = []
        for m in matches:
            # Wir formatieren die Daten so, dass deine bestehende history.js ohne Änderung funktioniert!
            result.append({
                "id": m.id,
                "played_at": m.played_at.isoformat(),
                "score_team_a": m.score_team_a,
                "score_team_b": m.score_team_b,
                "point_diff": m.point_diff,
                "winner_team": m.winner_team,
                "team_a_players": [{"name": m.team_a.player1.name, "team_slot": 1}, {"name": m.team_a.player2.name, "team_slot": 2}],
                "team_b_players": [{"name": m.team_b.player1.name, "team_slot": 1}, {"name": m.team_b.player2.name, "team_slot": 2}]
            })
        return jsonify(result), 200


@match_page_bp.route("/action", methods=["POST"])
def handle_action():
    """
    Zentrale API-Route für alle Aktionen des aktiven Matches:
    - Schnellwahlpunkte
    - manuelle Punkte
    - Undo
    - neues Spiel
    """
    game = get_game_state()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten"}), 400

    action = data.get("action")
    team = data.get("team")

    if action == "new_game":
        reset_game()
        return jsonify({
            "redirect_url": url_for("matches.player_selection_page")
        })

    if not has_active_match(game):
        return jsonify({"error": "Es ist aktuell kein aktives Match gestartet."}), 400

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
