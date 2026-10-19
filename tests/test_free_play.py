"""Integration tests: friendly modes are session-only and never touch ratings."""
import pytest
from flask import Flask, session, url_for

from extensions import db
from models.match import Match
from models.player import Player
from models.team import Team
from models.rating import PlayerRating
from routes import register_blueprints
from services.game_service import has_active_match


@pytest.fixture
def client():
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
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


def assert_no_rated_records():
    assert Match.query.count() == 0
    assert Player.query.count() == 0
    assert Team.query.count() == 0
    assert PlayerRating.query.count() == 0


@pytest.mark.parametrize(
    ("route", "count", "mode"),
    [("/quickplay", 2, "quickplay"), ("/six-player", 3, "six_player")],
)
def test_start_free_game_without_registered_players(client, route, count, mode):
    with client.application.app_context():
        response = client.get(route)
        assert response.status_code == 200
        assert b"Spiel starten" in response.data

        response = client.post(route, data={
            "team_a_name": "Team Nord",
            "team_b_name": "Team Sued",
            "four_twenty_mode": "on",
            **{f"player_a_{i}": f"Nord {i}" for i in range(1, count + 1)},
            **{f"player_b_{i}": f"Sued {i}" for i in range(1, count + 1)},
        })
        assert response.status_code == 302
        assert response.location.endswith("/match")

        with client.session_transaction() as s:
            game = s["game"]
            assert game["mode"] == mode
            assert game["team_name_a"] == "Team Nord"
            assert game["four_twenty_mode"] is True
            assert len(game["players"]) == 2 * count
            assert game["team_a_id"] is None
            assert game["team_b_id"] is None
            assert has_active_match(game)

        assert client.get("/match").status_code == 200
        assert_no_rated_records()


@pytest.mark.parametrize("route", ["/quickplay", "/six-player"])
def test_free_game_scores_undo_and_finish_do_not_write_to_database(client, route):
    with client.application.app_context():
        response = client.post(route, data={})
        assert response.status_code == 302

        for _ in range(3):
            step = client.post("/action", json={
                "action": "score_257", "team": "A", "double_points": False,
            })
            assert step.status_code == 200
        assert step.json["score_a"] == 771
        assert step.json["winner"] is None

        undo = client.post("/action", json={"action": "undo"})
        assert undo.status_code == 200
        assert undo.json["score_a"] == 514

        for _ in range(2):
            final = client.post("/action", json={
                "action": "score_257", "team": "A",
            })
        assert final.status_code == 200
        assert final.json["score_a"] == 1028
        assert final.json["winner"] == "Team A"

        saved = client.post("/api/matches", json={"score_team_a": 1028, "score_team_b": 0})
        assert saved.status_code == 200
        assert saved.json["saved"] is False
        assert client.post("/api/matches", json={}).status_code == 409
        assert client.post("/action", json={"action": "score_20", "team": "A"}).status_code == 400

        with client.session_transaction() as s:
            assert s["game"]["match_saved"] is True
        assert client.get("/match").status_code == 200
        assert_no_rated_records()

        reset = client.post("/action", json={"action": "new_game"})
        assert reset.status_code == 200
        assert reset.json["redirect_url"] == "/home"
        with client.session_transaction() as s:
            assert s["game"]["mode"] == "ranked"
            assert not has_active_match(s["game"])
        assert_no_rated_records()


def test_420_quickplay_win_is_local_and_not_rated(client):
    with client.application.app_context():
        client.post("/quickplay", data={"four_twenty_mode": "on"})
        for action in ("score_200", "score_200", "score_20"):
            result = client.post("/action", json={"action": action, "team": "A"})
        assert result.status_code == 200
        assert result.json["winner"] == "Team A"
        assert client.post("/api/matches", json={}).json["saved"] is False
        assert_no_rated_records()


def test_free_game_rejects_finish_without_a_winner(client):
    with client.application.app_context():
        client.post("/quickplay", data={})
        r = client.post("/api/matches", json={})
        assert r.status_code == 400
        assert_no_rated_records()


def test_free_start_requires_authentication_and_limits_input(client):
    with client.application.app_context():
        with client.session_transaction() as s:
            s.pop("role")
        assert client.post("/quickplay", data={}).status_code == 401

        with client.session_transaction() as s:
            s["role"] = "user"
        assert client.post("/quickplay", data={"team_a_name": "x" * 41}).status_code == 400
        assert_no_rated_records()
