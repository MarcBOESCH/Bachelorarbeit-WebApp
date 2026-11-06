import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from flask import Flask
from services.rating_utils import Glicko2Player as GlickoPlayer

from extensions import db
from time_utils import utc_now_naive
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


def test_utc_timestamps_keep_existing_naive_utc_convention(app):
    # PostgreSQL columns are TIMESTAMP WITHOUT TIME ZONE; no schema change.
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    generated = utc_now_naive()
    after = datetime.now(timezone.utc).replace(tzinfo=None)
    assert generated.tzinfo is None
    assert before <= generated <= after

    direct = Match(team_a_id=1, team_b_id=2,
                   score_team_a=1000, score_team_b=700,
                   point_diff=300, winner_team="A", four_twenty_mode=False)
    db.session.add(direct)
    db.session.commit()
    assert direct.played_at.tzinfo is None
    assert before <= direct.played_at <= datetime.now(timezone.utc).replace(tzinfo=None)

    ratings.rebuild_glicko2_ratings()
    status = MatchRatingStatus.query.filter_by(
        match_id=direct.id, system_name='glicko2'
    ).one()
    assert status.processed_at is not None and status.processed_at.tzinfo is None


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


def test_420_wins_are_reported_separately_for_players_and_teams(app):
    # Actual 420-point wins for both teams count toward the normal win rate,
    # but do not count as rated wins. Regular wins in 420 mode are not 420 wins.
    match(1, mode=True, four_twenty_win=True, winner='A')
    match(2, mode=True, winner='A')
    match(3, mode=True, four_twenty_win=True, winner='B')
    match(4, winner='B')

    players = {p['id']: p for p in get_player_stats()}
    assert all(players[i]['wins'] == 2 and players[i]['four_twenty_wins'] == 1
               and players[i]['matches_played'] == 4 for i in (1, 2, 3, 4))
    assert all(players[i]['four_twenty_wins'] == 0 for i in (5, 6))
    teams = {t['id']: t for t in get_team_stats()}
    assert teams[1]['four_twenty_wins'] == 1
    assert teams[2]['four_twenty_wins'] == 1
    assert teams[3]['four_twenty_wins'] == 0

    ratings.rebuild_glicko2_ratings()
    assert all(p['rated_matches'] == 2 and p['four_twenty_wins'] == 1
               for p in get_player_stats() if p['id'] in (1, 2, 3, 4))

    player_response = app.test_client().get('/api/player-stats')
    team_response = app.test_client().get('/api/team-stats')
    assert player_response.status_code == 200
    assert team_response.status_code == 200
    assert next(p for p in player_response.json if p['id'] == 1)['four_twenty_wins'] == 1
    assert next(t for t in team_response.json if t['id'] == 2)['four_twenty_wins'] == 1


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
    assert {p['four_twenty_wins'] for p in demo_stats if p['name'] in DEMO_PLAYERS[:2]} == {1}
    assert {p['four_twenty_wins'] for p in demo_stats if p['name'] in DEMO_PLAYERS[2:]} == {0}
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


def test_persisted_team_states_equal_calculated_targets(app):
    from services.rating_utils import aggregate_glicko2_team_state
    m = match(1)
    a, b = ratings.split_match_ratings_by_team(m, 'glicko2')
    a[0]['rating_entry'].rating_deviation = 45
    a[0]['rating_entry'].volatility = .02
    a[1]['rating_entry'].volatility = .09
    expected = ratings.calculate_glicko2_team_update(
        aggregate_glicko2_team_state(a), aggregate_glicko2_team_state(b), 'A')
    ratings._apply_glicko2_match(m)
    db.session.commit()
    db.session.expire_all()
    for entries, key in zip(ratings.split_match_ratings_by_team(m, 'glicko2'),
                            ('team_a_after', 'team_b_after')):
        assert aggregate_glicko2_team_state(entries) == pytest.approx(expected[key], abs=1e-10)


def test_comparison_is_read_only_and_matches_real_replay(app):
    import json
    from sqlalchemy import event
    from services.glicko2_comparison import compare_glicko2_history
    for i in range(1, 13):
        match(i, day=i // 2, winner='B' if i % 3 == 0 else 'A', team_b=3 if i > 10 else 2)
    match(20, mode=True, four_twenty_win=True)
    ratings.rebuild_glicko2_ratings()
    before = snapshot()
    statuses = [(s.id, s.match_id, s.processed, s.processed_at)
                for s in MatchRatingStatus.query.order_by(MatchRatingStatus.id)]
    statements = []
    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)
    event.listen(db.engine, 'before_cursor_execute', record)
    try:
        result = app.test_cli_runner().invoke(args=['compare-glicko2'])
        assert result.exit_code == 0, result.output
    finally:
        event.remove(db.engine, 'before_cursor_execute', record)
    assert statements and all(s.lstrip().upper().startswith('SELECT') for s in statements)
    report = json.loads(result.output)
    assert report['rated_matches'] == 12 and report['excluded_matches'] == 1
    assert snapshot() == before
    assert statuses == [(s.id, s.match_id, s.processed, s.processed_at)
                        for s in MatchRatingStatus.query.order_by(MatchRatingStatus.id)]
    assert report == compare_glicko2_history(list(reversed(Match.query.all())))
    public = {p['id']: p for p in get_player_stats()}
    for p in report['players']:
        saved = next(s for s in before if s[0] == p['player_id'])
        assert [p['after'][k] for k in ('rating', 'rd', 'vol', 'rated_matches')] == pytest.approx(saved[1:])
        assert p['after']['rank'] == public[p['player_id']]['rating_rank']
        assert p['before']['rated_matches'] == p['after']['rated_matches']
    assert any(abs(p['delta']['rating']) > 1 for p in report['players'])


def test_comparison_rejects_invalid_history_and_handles_empty(app):
    from services.glicko2_comparison import compare_glicko2_history
    assert compare_glicko2_history([])['players'] == []
    m = match(1)
    with pytest.raises(ValueError, match='Duplicate'):
        compare_glicko2_history([m, m])
    m.winner_team = 'X'
    with pytest.raises(ValueError):
        compare_glicko2_history([m])
    assert snapshot() == []


def test_simulation_evaluation_and_database_replay_agree(app):
    from types import SimpleNamespace
    from services.simulation_pipeline_service import evaluate_glicko2_on_simulation
    from services.evaluation_service import evaluate_glicko2_predictions
    for i in range(1, 16):
        match(i, winner='B' if i % 3 == 0 else 'A', team_b=3 if i % 4 == 0 else 2)
    match(20, mode=True, four_twenty_win=True)
    history = Match.query.filter(Match.rating_eligible).order_by(Match.played_at, Match.id).all()
    simulated = [SimpleNamespace(
        match_index=m.id, played_at=m.played_at,
        team_a_player1_id=m.team_a.player1_id, team_a_player2_id=m.team_a.player2_id,
        team_b_player1_id=m.team_b.player1_id, team_b_player2_id=m.team_b.player2_id,
        winner_team=m.winner_team, point_diff=m.point_diff) for m in history]
    simulation = evaluate_glicko2_on_simulation(
        simulated, [SimpleNamespace(player_id=i) for i in range(1, 7)])
    evaluation = evaluate_glicko2_predictions()
    for key in ('total_predictions', 'correct_predictions', 'accuracy', 'brier_score', 'log_loss'):
        assert simulation[key] == evaluation[key]
    ratings.rebuild_glicko2_ratings()
    for pid, rating, rd, vol, count in snapshot():
        assert simulation['final_states'][pid] == pytest.approx(dict(rating=rating, rd=rd, vol=vol))


def test_offline_comparison_needs_no_database(app, tmp_path):
    import json
    import subprocess
    import sys
    from pathlib import Path
    rows = [dict(id=1, played_at='2026-01-01T12:00:00', team_a=[1, 2], team_b=[3, 4],
                 score_team_a=1000, score_team_b=700, winner_team='A', four_twenty_mode=False)]
    source = tmp_path / 'history.json'
    source.write_text(json.dumps(rows))
    env = dict(os.environ, DATABASE_URL='invalid://must-not-connect', NEON_DATABASE_URL='invalid://must-not-connect')
    result = subprocess.run([sys.executable, 'compare_glicko2.py', str(source)],
                            cwd=Path(__file__).resolve().parents[1], env=env,
                            capture_output=True, text=True, check=True)
    report = json.loads(result.stdout)
    assert report['rated_matches'] == 1
    assert all(p['after']['rank'] is None for p in report['players'])

