from dataclasses import replace
from datetime import datetime, timedelta
import csv
import math

import pytest

from services.rating_utils import (
    calculate_elo_expected_score, calculate_glicko2_win_probability as predict,
    calculate_trueskill_win_probability,
)
from services.rating_model_comparison import (
    ComparisonMatch, ComparisonPlayer, compare_rating_models,
    load_export_history, score_predictions,
)
from services.simulation_pipeline_service import (
    evaluate_elo_on_simulation, evaluate_glicko2_on_simulation,
    evaluate_trueskill_on_simulation,
)


def state(rating, rd):
    return dict(rating=rating, rd=rd)


def test_glickman_published_prediction_example():
    # The Glicko system, p. 5: 1400/RD80 vs 1500/RD150 => 0.376.
    assert predict(state(1400, 80), state(1500, 150)) == pytest.approx(.376, abs=.0005)


def test_prediction_uses_both_uncertainties_and_complements():
    a, b = state(1700, 30), state(1500, 50)
    p = predict(a, b)
    assert .5 < predict(state(1700, 350), b) < p
    assert .5 < predict(a, state(1500, 350)) < p
    assert predict(b, a) == pytest.approx(1-p, abs=1e-15)
    assert predict(state(1500, 350), state(1500, 30)) == .5
    assert predict(state(1700, 0), state(1500, 0)) == pytest.approx(
        calculate_elo_expected_score(1700, 1500), abs=1e-8)


@pytest.mark.parametrize('a,b', [(1e6, -1e6), (-1e6, 1e6), (1500, 1500)])
def test_prediction_extremes_are_finite(a, b):
    p = predict(state(a, 350), state(b, 350))
    assert math.isfinite(p) and 0 <= p <= 1


@pytest.mark.parametrize('bad', [state(1500, -1), state(float('nan'), 350),
                                 state(1500, float('inf'))])
def test_prediction_rejects_invalid_state(bad):
    with pytest.raises(ValueError):
        predict(bad, state(1500, 350))


def test_trueskill_prediction_is_neutral_for_equal_means():
    a, b = dict(mu=50, sigma=2), dict(mu=50, sigma=12)
    assert calculate_trueskill_win_probability(a, b) == .5
    b['mu'] = 60
    assert calculate_trueskill_win_probability(a, b) == pytest.approx(
        1-calculate_trueskill_win_probability(b, a), abs=1e-15)


def history():
    return [ComparisonMatch(i, datetime(2026, 1, 1) + timedelta(days=i//2),
                            1, 2 if i % 3 else 5, 3, 4,
                            'A' if i % 3 else 'B', 200) for i in range(1, 16)]


PLAYERS = [ComparisonPlayer(i) for i in range(1, 6)]
EVALUATORS = [evaluate_elo_on_simulation, evaluate_glicko2_on_simulation,
              evaluate_trueskill_on_simulation]


@pytest.mark.parametrize('evaluate', EVALUATORS)
def test_forecast_does_not_use_current_or_future_results(evaluate):
    matches = history()
    before = evaluate(matches, PLAYERS)['details']
    changed = matches[:]
    changed[7] = replace(changed[7], winner_team='B' if changed[7].winner_team=='A' else 'A')
    after = evaluate(changed, PLAYERS)['details']
    assert [r['probability_a'] for r in before[:8]] == [r['probability_a'] for r in after[:8]]
    assert any(a['probability_a'] != b['probability_a'] for a,b in zip(before[8:], after[8:]))
    prefix = evaluate(matches[:8], PLAYERS)['details']
    assert prefix == before[:8]
    assert evaluate(matches[::-1], PLAYERS)['details'] == before


def test_report_is_deterministic_and_neutral_about_team_labels():
    matches = history()
    report = compare_rating_models(matches, PLAYERS)
    assert report == compare_rating_models(matches[::-1], PLAYERS)
    swapped = [replace(m, team_a_player1_id=m.team_b_player1_id,
                       team_a_player2_id=m.team_b_player2_id,
                       team_b_player1_id=m.team_a_player1_id,
                       team_b_player2_id=m.team_a_player2_id,
                       winner_team='B' if m.winner_team=='A' else 'A') for m in matches]
    other = compare_rating_models(swapped, PLAYERS)
    for name in report['metrics']:
        assert report['metrics'][name]['all'] == pytest.approx(other['metrics'][name]['all'], abs=1e-10)
        for a,b in zip(report['predictions'][name], other['predictions'][name]):
            assert a['p_a'] == pytest.approx(1-b['p_a'], abs=1e-10)


def test_scores_and_placement_subsets_have_no_lookahead():
    matches = [replace(m, team_a_player2_id=2) for m in history()]
    report = compare_rating_models(matches, PLAYERS)
    assert [r['all_players_placed'] for r in report['predictions']['elo']] == [False]*10 + [True]*5
    coin = report['metrics']['coin_flip']['all']
    assert coin['brier_score'] == .25
    assert coin['log_loss'] == pytest.approx(math.log(2))
    assert coin['accuracy_percent'] == 50 and coin['ties'] == 15
    assert score_predictions([])['brier_score'] is None
    assert compare_rating_models([], PLAYERS)['metrics']['elo']['all']['matches'] == 0


def write_exports(path, *, duplicate=False, mode='true', missing_team=False):
    rows = {
        'players': [dict(id=i) for i in range(1,5)],
        'teams': [dict(id=1,player1_id=1,player2_id=2),dict(id=2,player1_id=3,player2_id=4)],
        'matches': [dict(id=1,played_at='2026-01-01 12:00:00',team_a_id=1,
                         team_b_id=99 if missing_team else 2,score_team_a=420,
                         score_team_b=200,winner_team='A',four_twenty_mode=mode,point_diff=220),
                    dict(id=2,played_at='2026-01-01T13:00:00+01:00',team_a_id=1,
                         team_b_id=2,score_team_a=1000,score_team_b=700,
                         winner_team='A',four_twenty_mode='true',point_diff=300)],
    }
    if duplicate:
        rows['matches'].append(rows['matches'][0])
    for name, values in rows.items():
        with (path/(name+'.csv')).open('w', newline='') as f:
            writer=csv.DictWriter(f, fieldnames=list(values[0]))
            writer.writeheader();writer.writerows(values)


def test_export_loader_filters_only_actual_420_wins_and_normalizes_time(tmp_path):
    write_exports(tmp_path)
    matches, players, source = load_export_history(tmp_path)
    assert [m.match_index for m in matches] == [2]
    assert matches[0].played_at == datetime(2026, 1, 1, 12)
    assert len(players) == 4
    assert source['exported_matches'] == 2 and source['excluded_420_match_ids'] == [1]
    assert set(source['source_sha256']) == {'players.csv','teams.csv','matches.csv'}


@pytest.mark.parametrize('kwargs', [dict(duplicate=True),dict(mode='bad'),dict(missing_team=True)])
def test_bad_exports_are_rejected(tmp_path, kwargs):
    write_exports(tmp_path, **kwargs)
    with pytest.raises(ValueError):
        load_export_history(tmp_path)


def test_offline_cli_does_not_connect_to_database(tmp_path):
    import json
    import os
    from pathlib import Path
    import subprocess
    import sys
    write_exports(tmp_path)
    result = subprocess.run([sys.executable, 'compare_rating_models.py', str(tmp_path)],
                            cwd=Path(__file__).resolve().parents[1], capture_output=True,
                            text=True, check=True, env=dict(os.environ,
                            DATABASE_URL='invalid://must-not-connect',
                            NEON_DATABASE_URL='invalid://must-not-connect'))
    report = json.loads(result.stdout)
    assert all(m['all']['matches'] == 1 for m in report['metrics'].values())
    assert report['provenance']['excluded_420_match_ids'] == [1]
