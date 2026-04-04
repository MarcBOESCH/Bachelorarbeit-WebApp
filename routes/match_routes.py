from flask import Blueprint, jsonify, redirect, render_template, request, url_for

from services.game_service import (
    BUTTON_VALUES,
    add_manual_points,
    add_points,
    get_game_state,
    has_active_match,
    reset_game,
    start_new_game,
    undo_last_action,
)

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
    """
    Startet ein neues aktives Match auf Basis der Spielerauswahl.
    """
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    team_name_a = (data.get("team_name_a") or "").strip()
    team_name_b = (data.get("team_name_b") or "").strip()
    players = data.get("players")

    if not isinstance(players, list) or len(players) != 4:
        return jsonify({"error": "Es müssen genau 4 Spieler übergeben werden."}), 400

    player_ids = []
    seen_slots = set()
    team_a_count = 0
    team_b_count = 0

    for entry in players:
        if not isinstance(entry, dict):
            return jsonify({"error": "Ungültiger Spieler-Eintrag."}), 400

        player_id = entry.get("player_id")
        team = entry.get("team")
        team_slot = entry.get("team_slot")

        if not isinstance(player_id, int):
            return jsonify({"error": "Ungültige player_id."}), 400

        if team not in {"A", "B"}:
            return jsonify({"error": "Team muss 'A' oder 'B' sein."}), 400

        if team_slot not in {1, 2}:
            return jsonify({"error": "team_slot muss 1 oder 2 sein."}), 400

        if team == "A":
            team_a_count += 1
        else:
            team_b_count += 1

        slot_key = (team, team_slot)
        if slot_key in seen_slots:
            return jsonify({"error": "Jeder Team-Slot darf nur einmal vorkommen."}), 400

        seen_slots.add(slot_key)
        player_ids.append(player_id)

    if team_a_count != 2 or team_b_count != 2:
        return jsonify({"error": "Es müssen genau 2 Spieler in Team A und 2 Spieler in Team B sein."}), 400

    if len(set(player_ids)) != 4:
        return jsonify({"error": "Ein Spieler darf nicht mehrfach im selben Match vorkommen."}), 400

    game = start_new_game(team_name_a, team_name_b, players)

    return jsonify({
        "message": "Match erfolgreich gestartet.",
        "game": game
    }), 201


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