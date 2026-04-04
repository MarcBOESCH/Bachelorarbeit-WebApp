from flask import session

BUTTON_VALUES = {
    "score_20": 20,
    "score_50": 50,
    "score_100": 100,
    "score_150": 150,
    "score_200": 200,
}

VALID_TEAMS = {"A", "B"}


def create_new_game_state():
    """
    Erzeugt den Standardzustand für ein neues Spiel.

    players:
    - enthält die vier ausgewählten Spieler des aktiven Matches
    - wird beim Starten über /api/match/start gesetzt
    """
    return {
        "team_name_a": "Team A",
        "team_name_b": "Team B",
        "score_a": 0,
        "score_b": 0,
        "max_points": 1000,
        "history": [],
        "undo_a": [],
        "undo_b": [],
        "winner": None,
        "match_saved": False,
        "players": []
    }


def get_game_state():
    """
    Gibt den aktuellen Spielzustand aus der Session zurück.
    Existiert noch kein Spiel, wird ein Standardzustand erzeugt.
    """
    if "game" not in session:
        session["game"] = create_new_game_state()

    return session["game"]


def save_game_state(game):
    """
    Aktualisiert Gewinnerstatus und speichert den Spielzustand
    zurück in die Session.
    """
    update_winner(game)
    session["game"] = game
    session.modified = True


def update_winner(game):
    """
    Setzt den Gewinner, sobald ein Team die Maximalpunktzahl
    erreicht und gleichzeitig vorne liegt.
    """
    if game["score_a"] >= game["max_points"] and game["score_a"] > game["score_b"]:
        game["winner"] = game["team_name_a"]
    elif game["score_b"] >= game["max_points"] and game["score_b"] > game["score_a"]:
        game["winner"] = game["team_name_b"]
    else:
        game["winner"] = None


def reset_game():
    """
    Setzt das Spiel vollständig auf den Standardzustand zurück.
    Wird verwendet, wenn ein neues Match vorbereitet werden soll.
    """
    game = create_new_game_state()
    save_game_state(game)
    return game


def start_new_game(team_name_a, team_name_b, players):
    """
    Startet ein neues aktives Match mit den ausgewählten Teams und Spielern.

    team_name_a / team_name_b:
    - optionale Teamnamen aus dem Setup
    - leere Werte werden automatisch ersetzt

    players:
    - Liste mit genau vier Spielerobjekten
    """
    game = create_new_game_state()
    game["team_name_a"] = team_name_a.strip() if team_name_a and team_name_a.strip() else "Team A"
    game["team_name_b"] = team_name_b.strip() if team_name_b and team_name_b.strip() else "Team B"
    game["players"] = players

    save_game_state(game)
    return game


def has_active_match(game):
    """
    Ein aktives Match liegt vor, wenn vier Spieler im aktuellen Spielzustand
    hinterlegt sind.
    """
    if not game:
        return False

    players = game.get("players", [])
    return isinstance(players, list) and len(players) == 4


def add_points(game, team, action):
    """
    Fügt Punkte über die Schnellwahl-Buttons hinzu.
    """
    if is_match_locked(game):
        return False, "Das Match wurde bereits gespeichert und kann nicht weiter verändert werden."

    if team not in VALID_TEAMS:
        return False, "Ungültiges Team"

    if action not in BUTTON_VALUES:
        return False, "Ungültige Aktion"

    points = BUTTON_VALUES[action]

    if team == "A":
        game["undo_a"].append(game["score_a"])
        game["history"].append("A")
        game["score_a"] += points
    else:
        game["undo_b"].append(game["score_b"])
        game["history"].append("B")
        game["score_b"] += points

    save_game_state(game)
    return True, None


def add_manual_points(game, team, value):
    """
    Regeln:
    - 257: Spezialfall, nur gewähltes Team erhält 257 Punkte
    - 1 bis 157: gewähltes Team erhält value,
      anderes Team erhält 157 - value
    """
    if is_match_locked(game):
        return False, "Das Match wurde bereits gespeichert und kann nicht weiter verändert werden."

    if team not in VALID_TEAMS:
        return False, "Ungültiges Team"

    if not isinstance(value, int):
        return False, "Punktewert muss eine Ganzzahl sein"

    if value <= 0 or (value > 157 and value != 257):
        return False, "Ungültiger Punktewert"

    game["undo_a"].append(game["score_a"])
    game["undo_b"].append(game["score_b"])
    game["history"].append("AB")

    if value == 257:
        if team == "A":
            game["score_a"] += 257
        else:
            game["score_b"] += 257

        save_game_state(game)
        return True, None

    if team == "A":
        game["score_a"] += value
        game["score_b"] += 157 - value
    else:
        game["score_b"] += value
        game["score_a"] += 157 - value

    save_game_state(game)
    return True, None


def undo_last_action(game):
    """
    Macht die zuletzt ausgeführte Spielaktion rückgängig.
    """
    if is_match_locked(game):
        return False, "Ein bereits gespeichertes Match kann nicht mehr rückgängig gemacht werden."

    if not game["history"]:
        return False, "Keine Aktion zum Rückgängig machen"

    last_action = game["history"].pop()

    if last_action == "A":
        if not game["undo_a"]:
            return False, "Keine Undo-Daten für Team A"
        game["score_a"] = game["undo_a"].pop()

    elif last_action == "B":
        if not game["undo_b"]:
            return False, "Keine Undo-Daten für Team B"
        game["score_b"] = game["undo_b"].pop()

    elif last_action == "AB":
        if not game["undo_a"] or not game["undo_b"]:
            return False, "Keine Undo-Daten für manuelle Eingabe"
        game["score_a"] = game["undo_a"].pop()
        game["score_b"] = game["undo_b"].pop()

    else:
        return False, "Ungültiger History-Eintrag"

    save_game_state(game)
    return True, None


def is_match_locked(game):
    """
    Gespeicherte Matches dürfen nicht mehr weiter verändert werden.
    """
    return game.get("match_saved", False)


def lock_saved_match(game):
    """
    Sperrt ein Match nach erfolgreichem Speichern in der Datenbank.
    """
    game["match_saved"] = True
    save_game_state(game)