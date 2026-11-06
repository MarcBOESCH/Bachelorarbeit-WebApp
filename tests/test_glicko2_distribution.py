import math
import random
from types import SimpleNamespace

import pytest

from services.rating_utils import (
    aggregate_glicko2_team_state as aggregate,
    calculate_glicko2_team_update as update,
    distribute_team_delta_by_rd as distribute,
)


def team(rds=(200, 200), vols=(.06, .06), ratings=(1500, 1700)):
    return [dict(player_id=i, rating_entry=SimpleNamespace(
        rating=r, rating_deviation=rd, volatility=v))
        for i, (r, rd, v) in enumerate(zip(ratings, rds, vols))]


def apply(entries, deltas):
    for e, d in zip(entries, deltas):
        e['rating_entry'].rating += d['rating']
        e['rating_entry'].rating_deviation += d['rd']
        e['rating_entry'].volatility += d['vol']


def test_equal_rd_minus_thirty_regression():
    entries = team()
    before = aggregate(entries)
    deltas = distribute(entries, dict(rating=10, rd=-30, vol=-.003))
    assert [d['rd'] for d in deltas] == pytest.approx([-30 * math.sqrt(2)] * 2)
    assert [d['vol'] for d in deltas] == pytest.approx([-.003 * math.sqrt(2)] * 2)
    assert [d['rating'] for d in deltas] == [10, 10]
    apply(entries, deltas)
    assert aggregate(entries) == pytest.approx(
        dict(rating=before['rating'] + 10, rd=before['rd'] - 30, vol=before['vol'] - .003))


@pytest.mark.parametrize('rd_factor,vol_factor', [(.5, .9), (1.2, 1.3), (1, 1)])
def test_unequal_uncertainties_preserve_aggregates_and_ratios(rd_factor, vol_factor):
    entries = team((50, 300), (.09, .02))
    before = aggregate(entries)
    delta = dict(rating=-47, rd=before['rd'] * (rd_factor - 1),
                 vol=before['vol'] * (vol_factor - 1))
    changes = distribute(entries, delta)
    assert [d['weight'] for d in changes] == pytest.approx([1/7, 6/7])
    assert sum(d['rating'] for d in changes) / 2 == pytest.approx(-47)
    apply(entries, changes)
    assert aggregate(entries) == pytest.approx({k: before[k] + delta[k] for k in before})
    assert entries[0]['rating_entry'].rating_deviation == pytest.approx(50 * rd_factor)
    assert entries[1]['rating_entry'].volatility == pytest.approx(.02 * vol_factor)


@pytest.mark.parametrize('winner', ['A', 'B'])
def test_real_update_reaggregates_both_teams_and_is_permutation_invariant(winner):
    a, b = team((30, 350), (.02, .09)), team((90, 120), (.1, .04), (1300, 1900))
    result = update(aggregate(a), aggregate(b), winner)
    for entries, label in ((a, 'a'), (b, 'b')):
        changes = distribute(entries, result['delta_' + label])
        assert distribute(entries[::-1], result['delta_' + label]) == changes[::-1]
        apply(entries, changes)
        assert aggregate(entries) == pytest.approx(result['team_' + label + '_after'], abs=1e-10)


def test_long_rotating_team_history_stays_finite_and_reconstructs_every_update():
    rng = random.Random(420)
    players = [team((350,), (.06,), (1500,))[0] for _ in range(12)]
    for i, p in enumerate(players):
        p['player_id'] = i
    for _ in range(1000):
        sampled = rng.sample(players, 4)
        a, b = sampled[:2], sampled[2:]
        result = update(aggregate(a), aggregate(b), rng.choice(['A', 'B']))
        for entries, label in ((a, 'a'), (b, 'b')):
            apply(entries, distribute(entries, result['delta_' + label]))
            assert aggregate(entries) == pytest.approx(result['team_' + label + '_after'], abs=1e-9)
            assert all(math.isfinite(e['rating_entry'].rating)
                       and e['rating_entry'].rating_deviation > 0
                       and e['rating_entry'].volatility > 0 for e in entries)


@pytest.mark.parametrize('field,value', [('rating', float('nan')), ('rd', float('inf')),
                                       ('rd', -1000), ('vol', -.1)])
def test_invalid_target_is_rejected_without_mutation(field, value):
    entries = team()
    before = aggregate(entries)
    delta = dict(rating=0, rd=0, vol=0)
    delta[field] = value
    with pytest.raises(ValueError):
        distribute(entries, delta)
    assert aggregate(entries) == before


@pytest.mark.parametrize('rds,vols', [((0, 200), (.06, .06)),
                                    ((-1, 200), (.06, .06)),
                                    ((200, 200), (0, .06)),
                                    ((float('nan'), 200), (.06, .06))])
def test_invalid_prior_rejected(rds, vols):
    with pytest.raises(ValueError):
        aggregate(team(rds, vols))


def test_empty_team_and_invalid_winner_rejected():
    with pytest.raises(ValueError):
        aggregate([])
    with pytest.raises(ValueError):
        update(aggregate(team()), aggregate(team()), 'X')
