"""Integration tests for one-tap Quickplay and non-rated 3v3."""
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


def test_quickplay_tap_starts_scoring_without_setup_or_database(client):
    with client.application.app_context():
        response = client.get("/quickplay")
        assert response.status_code == 302
        assert response.location.endswith("/match")
        with client.session_transaction() as s:
            game = s["game"]
            assert game["mode"] == "quickplay"
            assert game["team_name_a"] == "Team A"
            assert game["team_name_b"] == "Team B"
            assert game["players"] == []  # No invented roster; also works for 3v3.
            assert game["score_a"] == 0 and game["score_b"] == 0
            assert game["four_twenty_mode"] is False
            assert has_active_match(game)

        scoring = client.get("/match")
        assert scoring.status_code == 200
        assert b'Quickplay' in scoring.data
        assert b'quickplay-420-toggle' in scoring.data
        assert b'2 vs 2, 3 vs 3' in scoring.data
        assert_no_rated_records()


def test_quickplay_revisit_preserves_score_and_never_resets(client):
    with client.application.app_context():
        client.get("/quickplay")
        assert client.post("/action", json={"action": "score_100", "team": "A"}).json["score_a"] == 100
        assert client.get("/quickplay").location.endswith("/match")
        with client.session_transaction() as s:
            assert s["game"]["score_a"] == 100
        assert_no_rated_records()


def test_quickplay_420_toggle_only_before_scoring(client):
    with client.application.app_context():
        client.get("/quickplay")
        assert client.post("/action", json={
            "action": "set_four_twenty_mode", "enabled": "yes"
        }).status_code == 400
        toggled = client.post("/action", json={
            "action": "set_four_twenty_mode", "enabled": True
        })
        assert toggled.status_code == 200
        assert toggled.json["four_twenty_mode"] is True

        for action in ("score_200", "score_200", "score_20"):
            response = client.post("/action", json={"action": action, "team": "A"})
            assert response.status_code == 200
        assert response.json["winner"] == "Team A"
        assert client.post("/action", json={
            "action": "set_four_twenty_mode", "enabled": False
        }).status_code == 409

        result = client.post("/api/matches", json={})
        assert result.status_code == 200
        assert result.json["saved"] is False
        assert_no_rated_records()


def test_quickplay_mode_toggle_after_regular_points_forbidden(client):
    with client.application.app_context():
        client.get("/quickplay")
        score = client.post("/action", json={"action": "score_20", "team": "B"})
        assert score.status_code == 200
        toggle = client.post("/action", json={
            "action": "set_four_twenty_mode", "enabled": True
        })
        assert toggle.status_code == 409
        with client.session_transaction() as s:
            assert s["game"]["four_twenty_mode"] is False
        assert_no_rated_records()


def test_quickplay_no_POST_setup_or_team_names(client):
    with client.application.app_context():
        assert client.post("/quickplay", data={"team_a_name": "Nord"}).status_code == 405
        assert_no_rated_records()


def test_quickplay_authentication(client):
    with client.application.app_context():
        with client.session_transaction() as s:
            s.pop("role")
        assert client.get("/quickplay").status_code == 401
        assert_no_rated_records()


def test_six_player_form_is_still_available_directly(client):
    with client.application.app_context():
        response = client.get("/six-player")
        assert response.status_code == 200
        html = response.data.decode("utf-8")
        for side in ("a", "b"):
            for pos in range(1, 4):
                assert f'id="team-{side}-player-{pos}"' in html
                assert f'name="player_{side}_{pos}_id"' in html
        assert 'id="btn-selection-mode-teams"' not in html
        assert 'id="match-preview-card"' in html
        assert 'id="four-twenty-mode-toggle"' in html
        assert_no_rated_records()


def test_six_player_rejects_invalid_players(client):
    with client.application.app_context():
        add_six_players()
        ids = six_ids()
        for bad in ({}, {**ids, "player_a_3_id": ""}, {**ids, "player_a_3_id": "2"},
                    {**ids, "player_b_3_id": "999"}):
            assert client.post("/six-player", data=bad).status_code == 400
        assert_no_rated_records(players=6)


@pytest.mark.parametrize("mode", ["quickplay", "six_player"])
def test_free_modes_keep_matches_in_session_not_rating(client, mode):
    with client.application.app_context():
        if mode == "six_player":
            add_six_players()
            entry = client.post("/six-player", data=six_ids())
        else:
            entry = client.get("/quickplay")
        assert entry.status_code == 302
        assert entry.location.endswith("/match")

        for path in ("/player-selection", "/quickplay", "/six-player"):
            assert client.get(path).location.endswith("/match")
        assert client.post("/api/match/start", json={"team_a_id": 1}).status_code == 409

        for _ in range(3):
            response = client.post("/action", json={"action": "score_257", "team": "A"})
            assert response.status_code == 200
        assert response.json["score_a"] == 771
        assert response.json["winner"] is None

        undo = client.post("/action", json={"action": "undo"})
        assert undo.status_code == 200 and undo.json["score_a"] == 514

        for _ in range(2):
            result = client.post("/action", json={"action": "score_257", "team": "A"})
        assert result.status_code == 200
        assert result.json["winner"] == "Team A"

        saved = client.post("/api/matches", json={})
        assert saved.status_code == 200 and saved.json["saved"] is False
        assert client.post("/api/matches", json={}).status_code == 409
        assert client.post("/action", json={"action": "score_20", "team": "A"}).status_code == 400
        assert client.get("/match").status_code == 200
        assert_no_rated_records(players=6 if mode == "six_player" else 0)

        restart = client.post("/action", json={"action": "new_game"})
        assert restart.status_code == 200 and restart.json["redirect_url"] == "/home"
        with client.session_transaction() as s:
            assert not has_active_match(s["game"])
        assert client.get("/match").location.endswith("/home")
        assert_no_rated_records(players=6 if mode == "six_player" else 0)


def test_only_quickplay_420_can_be_toggled(client):
    with client.application.app_context():
        add_six_players()
        client.post("/six-player", data=six_ids())
        assert client.post("/action", json={
            "action": "set_four_twenty_mode", "enabled": True
        }).status_code == 403
        assert_no_rated_records(players=6)


def test_quickplay_rename_team_names_in_session_and_keep_scores(client):
    with client.application.app_context():
        client.get("/quickplay")
        assert client.post("/action", json={"action": "rename_team", "team": "A",
                                            "name": "  Freunde  "}).status_code == 200
        assert client.post("/action", json={"action": "score_150", "team": "A"}).status_code == 200
        response = client.post("/action", json={
            "action": "rename_team", "team": "B", "name": "Gegner"
        })
        assert response.status_code == 200
        assert response.json["team_name_a"] == "Freunde"
        assert response.json["team_name_b"] == "Gegner"
        assert response.json["score_a"] == 150
        assert "Freunde" in client.get("/match").data.decode("utf-8")
        with client.session_transaction() as s:
            assert s["game"]["team_name_a"] == "Freunde"
            assert s["game"]["team_name_b"] == "Gegner"
        assert_no_rated_records()


def test_quickplay_rejects_invalid_or_duplicate_names(client):
    with client.application.app_context():
        client.get("/quickplay")
        for data in (
            {"team": "A", "name": ""},
            {"team": "A", "name": "x" * 41},
            {"team": "A", "name": "team b"},
            {"team": "X", "name": "Test"},
            {"team": "A", "name": 123},
        ):
            result = client.post("/action", json={"action": "rename_team", **data})
            assert result.status_code == 400
        with client.session_transaction() as s:
            assert s["game"]["team_name_a"] == "Team A"
            assert s["game"]["team_name_b"] == "Team B"
        assert_no_rated_records()


def test_quickplay_rematch_preserves_settings_but_resets_every_score(client):
    with client.application.app_context():
        client.get("/quickplay")
        client.post("/action", json={"action": "rename_team", "team": "A", "name": "Nord"})
        client.post("/action", json={"action": "rename_team", "team": "B", "name": "Süd"})
        client.post("/action", json={"action": "set_four_twenty_mode", "enabled": True})
        score = client.post("/action", json={"action": "score_50", "team": "A"})
        assert score.json["score_a"] == 50
        again = client.post("/action", json={"action": "rematch"})
        assert again.status_code == 200
        assert again.json["redirect_url"] == "/match"
        game = again.json["game"]
        assert game["mode"] == "quickplay"
        assert game["team_name_a"] == "Nord"
        assert game["team_name_b"] == "Süd"
        assert game["four_twenty_mode"] is True
        assert game["players"] == []
        assert game["score_a"] == game["score_b"] == 0
        assert game["history"] == game["undo_a"] == game["undo_b"] == []
        assert game["winner"] is None and game["match_saved"] is False
        assert client.get("/match").status_code == 200
        assert_no_rated_records()


def test_rematch_requires_current_game_and_finalized_win(client):
    with client.application.app_context():
        assert client.post("/action", json={"action": "rematch"}).status_code == 400
        client.get("/quickplay")
        for _ in range(4):
            client.post("/action", json={"action": "score_257", "team": "A"})
        # Winner exists; server rejects rematch until the current result is finalized.
        assert client.post("/action", json={"action": "rematch"}).status_code == 409
        assert client.post("/api/matches", json={}).json["saved"] is False
        again = client.post("/action", json={"action": "rematch"})
        assert again.status_code == 200
        assert again.json["game"]["score_a"] == 0
        assert_no_rated_records()


def test_renaming_finished_free_match_is_blocked(client):
    with client.application.app_context():
        client.get("/quickplay")
        for _ in range(4):
            client.post("/action", json={"action": "score_257", "team": "A"})
        assert client.post("/action", json={
            "action": "rename_team", "team": "A", "name": "Winners"
        }).status_code == 400
        client.post("/api/matches", json={})
        assert client.post("/action", json={
            "action": "rename_team", "team": "B", "name": "Losers"
        }).status_code == 400
        assert_no_rated_records()


def test_hidden_six_player_rematch_retains_roster_and_420_mode(client):
    with client.application.app_context():
        add_six_players()
        initial = client.post("/six-player", data={
            **six_ids(), "team_a_name": "Trio Nord", "team_b_name": "Trio Süd",
            "four_twenty_mode": "on",
        })
        assert initial.status_code == 302
        with client.session_transaction() as s:
            players = s["game"]["players"]
        client.post("/action", json={"action": "score_100", "team": "B"})
        rematch = client.post("/action", json={"action": "rematch"})
        assert rematch.status_code == 200
        game = rematch.json["game"]
        assert game["mode"] == "six_player"
        assert game["players"] == players
        assert game["team_name_a"] == "Trio Nord"
        assert game["team_name_b"] == "Trio Süd"
        assert game["four_twenty_mode"] is True
        assert game["score_a"] == game["score_b"] == 0
        assert_no_rated_records(players=6)


def test_ranked_rematch_reuses_registered_teams_without_new_ratings(client):
    with client.application.app_context():
        add_six_players()
        first = Team(name="Team Rot", player1_id=1, player2_id=2)
        second = Team(name="Team Blau", player1_id=3, player2_id=4)
        db.session.add_all([first, second])
        db.session.commit()
        begin = client.post("/api/match/start", json={
            "team_a_id": first.id, "team_b_id": second.id, "four_twenty_mode": True
        })
        assert begin.status_code == 201
        original = begin.json["game"]
        client.post("/action", json={"action": "score_100", "team": "B"})

        rematch = client.post("/action", json={"action": "rematch"})
        assert rematch.status_code == 200
        again = rematch.json["game"]
        assert again["mode"] == "ranked"
        assert again["team_a_id"] == first.id and again["team_b_id"] == second.id
        assert again["players"] == original["players"]
        assert again["team_name_a"] == original["team_name_a"]
        assert again["team_name_b"] == original["team_name_b"]
        assert again["four_twenty_mode"] is True
        assert again["score_a"] == again["score_b"] == 0
        assert again["history"] == []
        assert client.post("/action", json={
            "action": "rename_team", "team": "A", "name": "Neue"
        }).status_code == 400
        assert_no_rated_records(players=6, teams=2)


def test_rename_and_rematch_controls_present_only_where_expected(client):
    with client.application.app_context():
        client.get("/quickplay")
        html = client.get("/match").data.decode("utf-8")
        assert 'id="rematch-btn"' in html and 'id="reset-btn"' in html
        assert 'id="team-name-a"' in html and 'id="team-name-b"' in html
        assert 'id="team-name-input-a"' in html and 'id="team-name-input-b"' in html
        assert 'id="quickplay-420-toggle"' in html
        css = open("static/css/style.css", encoding="utf-8").read()
        assert "flex-direction: column" in css

        client.post("/action", json={"action": "new_game"})
        add_six_players()
        first = Team(name="A-Team", player1_id=1, player2_id=2)
        second = Team(name="B-Team", player1_id=3, player2_id=4)
        db.session.add_all([first, second])
        db.session.commit()
        client.post("/api/match/start", json={"team_a_id": first.id, "team_b_id": second.id})
        ranked = client.get("/match").data.decode("utf-8")
        assert 'id="rematch-btn"' in ranked
        assert 'id="team-name-a"' not in ranked
        assert_no_rated_records(players=6, teams=2)
