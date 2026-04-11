from flask import session
from models.team import Team


BUTTON_VALUES = {
    "score_20": 20,
    "score_50": 50,
    "score_100": 100,
    "score_150": 150,
    "score_200": 200,
    "score_257": 257,
}

VALID_TEAMS = {"A", "B"}
MAX_ROUND_POINTS = 157
MATCH_POINTS = 257


def create_new_game_state():
    return {
        "team_name_a": "Team A",
        "team_name_b": "Team B",
        "team_a_id": None,
        "team_b_id": None,
        "players": [],
        "score_a": 0,
        "score_b": 0,
        "max_points": 1000,
        "history": [],
        "undo_a": [],
        "undo_b": [],
        "winner": None,
        "match_saved": False,
    }


def get_game_state():
    """Gibt den aktuellen Spielzustand aus der Session zurück."""
    if "game" not in session:
        session["game"] = create_new_game_state()

    return session["game"]


def update_winner(game):
    """Setzt den Gewinner, sobald ein Team die Zielpunktzahl erreicht und vorne liegt."""
    if game["score_a"] >= game["max_points"] and game["score_a"] > game["score_b"]:
        game["winner"] = game["team_name_a"]
    elif game["score_b"] >= game["max_points"] and game["score_b"] > game["score_a"]:
        game["winner"] = game["team_name_b"]
    else:
        game["winner"] = None


def save_game_state(game):
    """Aktualisiert den Gewinnerstatus und speichert den Spielzustand in der Session."""
    update_winner(game)
    session["game"] = game
    session.modified = True


def reset_game():
    """Setzt das Spiel vollständig auf den Standardzustand zurück."""
    game = create_new_game_state()
    save_game_state(game)
    return game


def build_players_payload(team_a, team_b):
    players = []

    if team_a:
        players.extend([
            {
                "team": "A",
                "team_slot": 1,
                "player_id": team_a.player1.id,
                "player_name": team_a.player1.name,
            },
            {
                "team": "A",
                "team_slot": 2,
                "player_id": team_a.player2.id,
                "player_name": team_a.player2.name,
            },
        ])

    if team_b:
        players.extend([
            {
                "team": "B",
                "team_slot": 1,
                "player_id": team_b.player1.id,
                "player_name": team_b.player1.name,
            },
            {
                "team": "B",
                "team_slot": 2,
                "player_id": team_b.player2.id,
                "player_name": team_b.player2.name,
            },
        ])

    return players


def start_new_game(team_name_a, team_name_b, team_a_id, team_b_id):
    game = create_new_game_state()
    game["team_name_a"] = team_name_a
    game["team_name_b"] = team_name_b
    game["team_a_id"] = team_a_id
    game["team_b_id"] = team_b_id

    team_a = Team.query.get(team_a_id)
    team_b = Team.query.get(team_b_id)
    game["players"] = build_players_payload(team_a, team_b)

    save_game_state(game)
    return game


def has_active_match(game):
    if not game:
        return False

    return bool(game.get("team_a_id") and game.get("team_b_id"))


def is_match_locked(game):
    return bool(game.get("match_saved"))


def lock_saved_match(game):
    game["match_saved"] = True
    save_game_state(game)


def add_points(game, team, action):
    """Fügt Punkte über die Schnellwahl-Buttons hinzu."""
    if is_match_locked(game):
        return False, "Das Match wurde bereits gespeichert und kann nicht weiter verändert werden."

    if team not in VALID_TEAMS:
        return False, "Ungültiges Team."

    if action not in BUTTON_VALUES:
        return False, "Ungültige Aktion."

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
    - 257: gewähltes Team erhält 257 Punkte
    - 0: gewähltes Team erhält 0 Punkte, anderes Team erhält 257 Punkte
    - 1 bis 157: gewähltes Team erhält value, anderes Team erhält 157 - value
    """
    if is_match_locked(game):
        return False, "Das Match wurde bereits gespeichert und kann nicht weiter verändert werden."

    if team not in VALID_TEAMS:
        return False, "Ungültiges Team."

    if not isinstance(value, int):
        return False, "Punktewert muss eine Ganzzahl sein."

    if value < 0 or (value > MAX_ROUND_POINTS and value != MATCH_POINTS):
        return False, "Ungültiger Punktewert."

    if team == "A":
        game["undo_a"].append(game["score_a"])
        game["undo_b"].append(game["score_b"])
        game["history"].append("manual")
    else:
        game["undo_b"].append(game["score_b"])
        game["undo_a"].append(game["score_a"])
        game["history"].append("manual")

    if value == MATCH_POINTS:
        if team == "A":
            game["score_a"] += MATCH_POINTS
        else:
            game["score_b"] += MATCH_POINTS

        save_game_state(game)
        return True, None

    if value == 0:
        if team == "A":
            game["score_b"] += MATCH_POINTS
        else:
            game["score_a"] += MATCH_POINTS

        save_game_state(game)
        return True, None

    other_value = MAX_ROUND_POINTS - value

    if team == "A":
        game["score_a"] += value
        game["score_b"] += other_value
    else:
        game["score_b"] += value
        game["score_a"] += other_value

    save_game_state(game)
    return True, None


def undo_last_action(game):
    """Macht die letzte Punkteaktion rückgängig."""
    if is_match_locked(game):
        return False, "Das Match wurde bereits gespeichert und kann nicht mehr verändert werden."

    if not game["history"]:
        return False, "Keine Aktion zum Rückgängigmachen vorhanden."

    last_action = game["history"].pop()

    if last_action == "A":
        if not game["undo_a"]:
            return False, "Keine Aktion für Team A zum Rückgängigmachen vorhanden."
        game["score_a"] = game["undo_a"].pop()

    elif last_action == "B":
        if not game["undo_b"]:
            return False, "Keine Aktion für Team B zum Rückgängigmachen vorhanden."
        game["score_b"] = game["undo_b"].pop()

    elif last_action == "manual":
        if not game["undo_a"] or not game["undo_b"]:
            return False, "Keine manuelle Aktion zum Rückgängigmachen vorhanden."
        game["score_a"] = game["undo_a"].pop()
        game["score_b"] = game["undo_b"].pop()

    else:
        return False, "Unbekannte Historienaktion."

    save_game_state(game)
    return True, None