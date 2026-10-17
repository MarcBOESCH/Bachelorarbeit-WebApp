import os
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask import Flask
from services.rating_utils import Glicko2Player as GlickoPlayer

from extensions import db
from models.player import Player
from models.team import Team
from models.match import Match
from models.rating import PlayerRating
from models.match_rating_status import MatchRatingStatus
from services import rating_service as ratings
from services.player_stats_service import get_player_stats
from services.team_stats_service import get_team_stats
from services.match_service import create_match
from services.rating_cli import register_rating_commands
from services.placement_demo_cli import register_demo_commands, DEMO_PLAYERS, DEMO_TEAMS
from routes.statistic_routes import statistics_api_bp


@pytest.fixture
def app():
    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI=os.environ.get('GLICKO_TEST_DATABASE_URL', 'sqlite://'), TESTING=True,
                      RATING_PLACEMENT_MATCHES=10)
    db.init_app(app)
    app.register_blueprint(statistics_api_bp)
    register_rating_commands(app)
    register_demo_commands(app)
    with app.app_context():
        db.create_all()
        db.session.add_all([Player(id=i, name=f'Player {i}') for i in range(1, 7)])
        db.session.add_all([Team(id=1, name='A', player1_id=1, player2_id=2),
                            Team(id=2, name='B', player1_id=3, player2_id=4),
                            Team(id=3, name='C', player1_id=5, player2_id=6)])
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


def match(i, *, day=None, winner='A', mode=False, team_b=2, four_twenty_win=False):
    assert not four_twenty_win or mode
    score_a, score_b = (1000, 800) if winner == 'A' else (800, 1000)
    if four_twenty_win:
        score_a, score_b = (420, 200) if winner == 'A' else (200, 420)
    m = Match(id=i, played_at=datetime(2026, 1, 1) + timedelta(days=i if day is None else day),
              team_a_id=1, team_b_id=team_b,
              score_team_a=score_a,
              score_team_b=score_b,
              point_diff=abs(score_a - score_b), winner_team=winner, four_twenty_mode=mode)
    db.session.add(m)
    db.session.commit()
    return m


def snapshot(system='glicko2'):
    return [(r.player_id, r.rating, r.rating_deviation, r.volatility, r.matches_played)
            for r in PlayerRating.query.filter_by(system_name=system).order_by(PlayerRating.player_id)]


def test_reference_example():
    p = GlickoPlayer(rating=1500, rd=200, vol=.06)
    p._tau = .5
    p.update_player([1400, 1550, 1700], [30, 100, 300], [1, 0, 0])
    assert p.rating == pytest.approx(1464.06, abs=.01)
    assert p.rd == pytest.approx(151.52, abs=.01)
    assert p.vol == pytest.approx(.059996, abs=.000001)


def test_replay_order_idempotence_and_elo_preserved(app):
    later = match(2, day=0, winner='B')
    first = match(1, day=0)
    match(3, mode=True, four_twenty_win=True)
    ratings.process_elo_match(first)
    elo = snapshot('elo')
    results = ratings.rebuild_glicko2_ratings()
    assert [r['match_id'] for r in results] == [1, 2]
    expected = snapshot()
    assert all(r[-1] == 2 for r in expected)
    assert len(MatchRatingStatus.query.filter_by(system_name='glicko2').all()) == 2
    ratings.process_match_for_system(later, 'glicko2')
    assert snapshot() == expected
    assert snapshot('elo') == elo
    ratings.process_all_unprocessed_matches_for_system('glicko2')
    assert snapshot() == expected


def test_backdated_insert_correction_and_removal(app):
    match(2, winner='B')
    ratings.rebuild_glicko2_ratings()
    match(1)
    ratings.rebuild_glicko2_ratings()
    with_insert = snapshot()
    ratings.rebuild_glicko2_ratings()
    assert snapshot() == with_insert
    m = db.session.get(Match, 1)
    m.winner_team = 'B'
    m.score_team_a, m.score_team_b = 800, 1000
    db.session.commit()
    ratings.rebuild_glicko2_ratings()
    assert snapshot() != with_insert
    db.session.delete(m)
    db.session.commit()
    ratings.rebuild_glicko2_ratings()
    assert all(r[-1] == 1 for r in snapshot())


def test_atomic_failure_and_dry_run(app):
    match(1)
    ratings.rebuild_glicko2_ratings()
    before = snapshot()
    match(2, winner='B')
    original = ratings._apply_glicko2_match
    def failing(m, **kw):
        if m.id == 2:
            raise RuntimeError('injected failure after first match')
        return original(m, **kw)
    with patch.object(ratings, '_apply_glicko2_match', side_effect=failing):
        with pytest.raises(RuntimeError):
            ratings.rebuild_glicko2_ratings()
    assert snapshot() == before
    assert MatchRatingStatus.query.filter_by(system_name='glicko2').count() == 1
    ratings.rebuild_glicko2_ratings(dry_run=True)
    assert snapshot() == before
    assert all(not p['ranking_eligible'] and p['rating_pending'] for p in get_player_stats())


def test_placement_boundary_config_rd_and_teams(app):
    for i in range(1, 10):
        match(i, winner='B' if i % 2 else 'A')
    match(99, mode=True, four_twenty_win=True)
    ratings.rebuild_glicko2_ratings()
    assert all(not p['ranking_eligible'] for p in get_player_stats())
    match(10)
    ratings.rebuild_glicko2_ratings()
    stats = get_player_stats()
    placed = [p for p in stats if p['ranking_eligible']]
    assert len(placed) == 4
    assert {p['rating_rank'] for p in placed} == {1, 2, 3, 4}
    assert all(p['rated_matches'] == 10 for p in placed)
    assert all(p['matches_played'] == 11 for p in placed)
    assert all(p['rating_deviation'] is not None for p in placed)
    assert [t['ranking_eligible'] for t in get_team_stats()] == [True, True, False]
    app.config['RATING_PLACEMENT_MATCHES'] = 11
    assert all(not p['ranking_eligible'] for p in get_player_stats())
    app.config['RATING_PLACEMENT_MATCHES'] = 1
    r = PlayerRating.query.filter_by(player_id=1, system_name='glicko2').one()
    r.rating_deviation = 350
    db.session.commit()
    assert next(p for p in get_player_stats() if p['id'] == 1)['ranking_eligible']


def test_live_matches_and_mode_exclusion(app):
    ok, _, first = create_match(1000, 700, 1, 2)
    assert ok
    assert all(r[-1] == 1 for r in snapshot())
    before = snapshot()
    assert create_match(420, 200, 1, 2, four_twenty_mode=True)[0]
    assert snapshot() == before
    # With 420 mode enabled, a regular 1000-point victory is still rated.
    assert create_match(1000, 700, 1, 2, four_twenty_mode=True)[0]
    assert all(r[-1] == 2 for r in snapshot())
    assert all(r[-1] == 2 for r in snapshot('elo'))
    assert create_match(800, 1000, 1, 2)[0]
    assert all(r[-1] == 3 for r in snapshot())
    expected = snapshot()
    ratings.rebuild_glicko2_ratings()
    assert snapshot() == expected


def test_420_mode_only_excludes_actual_420_point_victories(app):
    match(1, mode=True, winner='A')  # regular victory with 420 mode enabled
    match(2, mode=True, four_twenty_win=True, winner='A')
    match(3, mode=True, winner='B')  # regular defeat with 420 mode enabled
    match(4, mode=True, four_twenty_win=True, winner='B')
    match(5, mode=False)

    eligible = Match.query.filter(Match.rating_eligible).order_by(Match.id).all()
    assert [m.id for m in eligible] == [1, 3, 5]
    assert [m.rating_eligible for m in Match.query.order_by(Match.id).all()] == [
        True, False, True, False, True
    ]

    results = ratings.rebuild_glicko2_ratings()
    assert [r['match_id'] for r in results] == [1, 3, 5]
    assert all(r[-1] == 3 for r in snapshot())
    assert all(p['rated_matches'] == 3 and p['placement_remaining'] == 7
               for p in get_player_stats() if p['id'] <= 4)
    assert MatchRatingStatus.query.filter_by(system_name='glicko2').count() == 3
    assert [m.id for m in ratings.get_unprocessed_matches_for_system('elo')] == [1, 3, 5]
    from services.ranking_service import public_rating_lookup
    assert public_rating_lookup()[1] is True
    with pytest.raises(ValueError, match='420'):
        ratings.process_match_for_system(db.session.get(Match, 2), 'elo')


def test_pending_when_new_regular_win_in_420_mode_is_not_replayed(app):
    match(1)
    ratings.rebuild_glicko2_ratings()
    assert all(not p['rating_pending'] for p in get_player_stats())
    match(2, mode=True)
    assert all(p['rating_pending'] for p in get_player_stats())
    ratings.rebuild_glicko2_ratings()
    assert all(not p['rating_pending'] for p in get_player_stats())


def test_api_and_cli(app):
    match(1)
    result = app.test_cli_runner().invoke(args=['rebuild-glicko2', '--dry-run'])
    assert result.exit_code == 0, result.output
    assert snapshot() == []
    result = app.test_cli_runner().invoke(args=['rebuild-glicko2'])
    assert result.exit_code == 0, result.output
    response = app.test_client().get('/api/player-stats')
    assert response.status_code == 200
    assert all('elo' in p and 'rating_rank' in p for p in response.json)


def test_invalid_history_rolls_back(app):
    m = match(1)
    ratings.rebuild_glicko2_ratings()
    before = snapshot()
    m.winner_team = 'X'
    db.session.commit()
    with pytest.raises(ValueError):
        ratings.rebuild_glicko2_ratings()
    assert snapshot() == before


def test_empty_history_clears_only_glicko(app):
    ratings.get_or_create_player_rating(1, 'glicko2')
    ratings.get_or_create_player_rating(1, 'elo')
    db.session.commit()
    ratings.rebuild_glicko2_ratings()
    assert snapshot() == []
    assert len(snapshot('elo')) == 1


def test_postgres_concurrent_replays(app):
    if db.engine.dialect.name != 'postgresql':
        pytest.skip('Requires isolated PostgreSQL test database')
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    for i in range(1, 6):
        match(i, winner='B' if i % 2 else 'A')
    ratings.rebuild_glicko2_ratings()
    expected = snapshot()
    db.session.remove()
    barrier = Barrier(2)
    def replay():
        with app.app_context():
            barrier.wait(timeout=5)
            result = ratings.rebuild_glicko2_ratings()
            db.session.remove()
            return len(result)
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(replay) for _ in range(2)]
        assert [job.result(timeout=15) for job in jobs] == [5, 5]
    assert snapshot() == expected
    assert MatchRatingStatus.query.filter_by(system_name='glicko2').count() == 5


def test_demo_placement_seed_is_reversible_and_idempotent(app):
    match(1)
    ratings.rebuild_glicko2_ratings()
    original = snapshot()

    result = app.test_cli_runner().invoke(args=['seed-placement-demo'])
    assert result.exit_code == 0, result.output
    assert '10 gewertet' in result.output
    assert Match.query.count() == 12
    assert Player.query.filter(Player.name.in_(DEMO_PLAYERS)).count() == 4
    assert Team.query.filter(Team.name.in_(DEMO_TEAMS)).count() == 2

    demo_stats = [p for p in get_player_stats() if p['name'] in DEMO_PLAYERS]
    assert len(demo_stats) == 4
    assert all(p['matches_played'] == 11 and p['rated_matches'] == 10
               and p['ranking_eligible'] and p['glicko2'] is not None for p in demo_stats)
    assert MatchRatingStatus.query.filter_by(system_name='glicko2').count() == 11

    repeated = app.test_cli_runner().invoke(args=['seed-placement-demo'])
    assert repeated.exit_code != 0
    assert Match.query.count() == 12

    cleared = app.test_cli_runner().invoke(args=['clear-placement-demo'])
    assert cleared.exit_code == 0, cleared.output
    assert Player.query.filter(Player.name.in_(DEMO_PLAYERS)).count() == 0
    assert Team.query.filter(Team.name.in_(DEMO_TEAMS)).count() == 0
    assert Match.query.count() == 1
    assert snapshot() == original
    assert MatchRatingStatus.query.filter_by(system_name='glicko2').count() == 1


def test_demo_commands_reject_nonlocal_or_non_demo_database(app):
    app.config['TESTING'] = False  # SQLite is allowed only for in-memory tests
    result = app.test_cli_runner().invoke(args=['seed-placement-demo'])
    assert result.exit_code != 0
    assert 'lokale PostgreSQL-Testdatenbank' in result.output
    assert Match.query.count() == 0
