from flask import Flask, render_template, session, jsonify, request
from livereload import Server


app = Flask(__name__)
app.secret_key = "dev-secret-key"

app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

BUTTON_VALUES = {
    "score_20": 20,
    "score_50": 50,
    "score_100": 100,
    "score_150": 150,
    "score_200": 200,
}

VALID_TEAMS = {"A", "B"}


def create_new_game_state():
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
    }


def get_game_state():
    if "game" not in session:
        session["game"] = create_new_game_state()
    return session["game"]


def save_game_state(game):
    update_winner(game)
    session["game"] = game
    session.modified = True


def reset_game():
    game = create_new_game_state()
    save_game_state(game)
    return game


def update_winner(game):
    if game["score_a"] >= game["max_points"] and game["score_a"] > game["score_b"]:
        game["winner"] = game["team_name_a"]
    elif game["score_b"] >= game["max_points"] and game["score_b"] > game["score_a"]:
        game["winner"] = game["team_name_b"]
    else:
        game["winner"] = None


def add_points(game, team, action):
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
    - 257: Spezialfall, nur das gewählte Team erhält 257 Punkte
    - 1 bis 157: gewähltes Team erhält value, anderes Team erhält 157 - value
    """

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


@app.route("/")
def index():
    game = get_game_state()
    update_winner(game)
    save_game_state(game)
    return render_template("index.html", game=game)


@app.route("/action", methods=["POST"])
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


if __name__ == "__main__":
    server = Server(app.wsgi_app)

    server.watch("templates/*.html")
    server.watch("static/css/*.css")
    server.watch("static/js/*.js")

    server.serve(
        port=5000,
        host="127.0.0.1",
        debug=False
    )