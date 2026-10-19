"""Regression tests for the mode selector, 3v3 player selection and free games."""
import pytest
from flask import Flask, url_for

from extensions import db
from models.match import Match
from models.player import Player
from models.team import Team
from models.rating import PlayerRating
from routes import register_blueprints
from services.game_service import has_active_match


@pytest.fixture
def client():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")
    app.config.update(
        SECRET_KEY="session-only-integration-test",
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite://",
        RATING_PLACEMENT_MATCHES=10,
    )
    db.init_app(app)
    register_blueprints(app)

    @app.route("/home")
    def home():
        return "Choose a game"

    @app.route("/logout")
    def logout():
        return "Logged out"

    @app.context_processor
    def static_url_helper():
        return {"static_url": lambda path: url_for("static", filename=path)}

    with app.app_context():
        db.create_all()
        test_client = app.test_client()
        with test_client.session_transaction() as s:
            s["role"] = "user"
        yield test_client
        db.session.remove()
        db.drop_all()


def add_six_players():
    db.session.add_all([Player(id=i, name=f"Spieler {i}") for i in range(1, 7)])
    db.session.commit()


def six_ids():
    return {
        f"player_{side}_{position}_id": str(index)
        for index, (side, position) in enumerate(
            [(side, p) for side in ("a", "b") for p in range(1, 4)], start=1
        )
    }


def assert_no_rated_records(*, players=0, teams=0):
    assert Match.query.count() == 0
    assert Player.query.count() == players
    assert Team.query.count() == teams
    assert PlayerRating.query.count() == 0


def test_quickplay_can_start_without_registered_players(client):
    with client.application.app_context():
        response = client.get("/quickplay")
        assert response.status_code == 200
        assert b"Spiel starten" in response.data
        response = client.post("/quickplay", data={
            "team_a_name": "Nord", "team_b_name": "Sued", "four_twenty_mode": "on"
        })
        assert response.status_code == 302
        assert response.location.endswith("/match")
        with client.session_transaction() as s:
            game = s["game"]
            assert game["mode"] == "quickplay"
            assert len(game["players"]) == 4
            assert game["four_twenty_mode"] is True
            assert has_active_match(game)
        assert client.get("/match").status_code == 200
        assert_no_rated_records()


def test_six_player_form_uses_only_player_selection(client):
    with client.application.app_context():
        response = client.get("/six-player")
        assert response.status_code == 200
        html = response.data.decode("utf-8")
        for side in ("a", "b"):
            for pos in range(1, 4):
                assert f'id="team-{side}-player-{pos}"' in html
                assert f'name="player_{side}_{pos}_id"' in html
        assert 'id="btn-selection-mode-teams"' not in html
        assert 'id="team-a-select"' not in html
        assert 'id="match-preview-card"' in html
        assert 'id="four-twenty-mode-toggle"' in html
        assert 'id="six-player-error"' not in html
        assert "/js/pages/six_player_selection.js" in html
        assert_no_rated_records()


def test_six_player_uses_registered_players_but_creates_no_rated_match(client):
    with client.application.app_context():
        add_six_players()
        r = client.post("/six-player", data={
            **six_ids(),
            "team_a_name": "Norden",
            "team_b_name": "Sueden",
            "four_twenty_mode": "on",
        })
        assert r.status_code == 302
        assert r.location.endswith("/match")
        with client.session_transaction() as s:
            game = s["game"]
            assert game["mode"] == "six_player"
            assert game["team_name_a"] == "Norden"
            assert game["four_twenty_mode"] is True
            assert len(game["players"]) == 6
            assert [p["player_name"] for p in game["players"]] == [
                f"Spieler {i}" for i in range(1, 7)
            ]
        assert_no_rated_records(players=6)


def test_six_player_rejects_invalid_ids_and_duplicates(client):
    with client.application.app_context():
        add_six_players()
        ids = six_ids()
        for bad in (
            {},
            {**ids, "player_a_3_id": ""},
            {**ids, "player_a_3_id": "2"},
            {**ids, "player_b_3_id": "999"},
            {**ids, "player_b_3_id": "abc"},
        ):
            assert client.post("/six-player", data=bad).status_code == 400
        assert_no_rated_records(players=6)


@pytest.mark.parametrize("mode", ["quickplay", "six_player"])
def test_free_mode_undo_finish_return_and_new_game(client, mode):
    with client.application.app_context():
        if mode == "six_player":
            add_six_players()
            payload = six_ids()
        else:
            payload = {}
        endpoint = "/" + ("quickplay" if mode == "quickplay" else "six-player")
        assert client.post(endpoint, data=payload).status_code == 302

        # Navigating to another setup while active does not replace the game.
        assert client.get("/player-selection").location.endswith("/match")
        assert client.get("/quickplay").location.endswith("/match")
        assert client.get("/six-player").location.endswith("/match")
        assert client.post("/api/match/start", json={"team_a_id": 1}).status_code == 409

        for _ in range(3):
            step = client.post("/action", json={"action": "score_257", "team": "A"})
            assert step.status_code == 200
        assert step.json["score_a"] == 771
        assert step.json["winner"] is None

        undo = client.post("/action", json={"action": "undo"})
        assert undo.status_code == 200
        assert undo.json["score_a"] == 514

        for _ in range(2):
            final = client.post("/action", json={"action": "score_257", "team": "A"})
        assert final.status_code == 200
        assert final.json["score_a"] == 1028
        assert final.json["winner"] == "Team A"

        response = client.post("/api/matches", json={})
        assert response.status_code == 200
        assert response.json["saved"] is False
        assert client.post("/api/matches", json={}).status_code == 409
        assert client.post("/action", json={"action": "score_20", "team": "A"}).status_code == 400
        assert client.get("/match").status_code == 200
        assert_no_rated_records(players=6 if mode == "six_player" else 0)

        reset = client.post("/action", json={"action": "new_game"})
        assert reset.status_code == 200
        assert reset.json["redirect_url"] == "/home"
        with client.session_transaction() as s:
            assert not has_active_match(s["game"])
        assert client.get("/match").location.endswith("/home")
        assert client.get("/six-player").status_code == 200
        assert_no_rated_records(players=6 if mode == "six_player" else 0)


def test_quickplay_420_win_without_rating(client):
    with client.application.app_context():
        client.post("/quickplay", data={"four_twenty_mode": "on"})
        for action in ("score_200", "score_200", "score_20"):
            result = client.post("/action", json={"action": action, "team": "A"})
        assert result.json["winner"] == "Team A"
        assert client.post("/api/matches", json={}).json["saved"] is False
        assert_no_rated_records()


def test_free_finish_requires_winner(client):
    with client.application.app_context():
        client.post("/quickplay", data={})
        assert client.post("/api/matches", json={}).status_code == 400
        assert_no_rated_records()


def test_free_start_requires_login_and_limits_names(client):
    with client.application.app_context():
        with client.session_transaction() as s:
            s.pop("role")
        assert client.post("/quickplay", data={}).status_code == 401
        with client.session_transaction() as s:
            s["role"] = "user"
        assert client.post("/quickplay", data={"team_a_name": "x"*41}).status_code == 400
        assert_no_rated_records()


def test_existing_2v2_teams_are_untouched_by_3v3_game(client):
    with client.application.app_context():
        add_six_players()
        db.session.add_all([
            Team(name="Duo A", player1_id=1, player2_id=2),
            Team(name="Duo B", player1_id=4, player2_id=5),
        ])
        db.session.commit()
        assert client.post("/six-player", data=six_ids()).status_code == 302
        assert_no_rated_records(players=6, teams=2)
