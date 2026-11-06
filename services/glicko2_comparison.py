"""Read-only legacy/corrected replay. No ORM writes, flushes or transactions.

The legacy distributor is frozen to main 206c66de for migration comparisons.
The Glickman volatility-equation fix is shared by both versions.
"""
from types import SimpleNamespace

from services.rating_utils import (
    DEFAULT_GLICKO2_RATING, DEFAULT_GLICKO2_RD, DEFAULT_GLICKO2_VOL,
    aggregate_glicko2_team_state, calculate_glicko2_team_update,
    calculate_rd_based_weights, distribute_team_delta_by_rd,
)


def _legacy_distribution(entries, delta):
    return [dict(player_id=e["player_id"], weight=w,
                 **{k: delta[k] * len(entries) * w for k in ("rating", "rd", "vol")})
            for e, w in zip(entries, calculate_rd_based_weights(entries))]


def compare_glicko2_history(matches, *, placement_matches=10):
    """Replay the same immutable history twice, ignoring stored ratings/status.

    Accepts Match-like objects with team relationships; callers must provide
    a complete, consistent snapshot. Returns full precision, with public ranks
    sorted by rating descending then player ID, after placement only.
    """
    if placement_matches < 1:
        raise ValueError("placement_matches must be positive")
    history = sorted(matches, key=lambda m: (m.played_at, m.id))
    if len({m.id for m in history}) != len(history):
        raise ValueError("Duplicate match IDs")
    eligible = []
    for m in history:
        if not m.rating_eligible:
            continue
        if not m.team_a or not m.team_b:
            raise ValueError(f"Match {m.id}: missing team")
        ids = [m.team_a.player1_id, m.team_a.player2_id,
               m.team_b.player1_id, m.team_b.player2_id]
        if (None in ids or len(set(ids)) != 4 or m.winner_team not in {"A", "B"}
                or m.score_team_a == m.score_team_b
                or (m.score_team_a > m.score_team_b) != (m.winner_team == "A")):
            raise ValueError(f"Match {m.id}: invalid players or result")
        eligible.append((m, ids))

    def replay(distribute, legacy=False):
        states = {}
        for m, ids in eligible:
            for pid in ids:
                states.setdefault(pid, SimpleNamespace(
                    rating=DEFAULT_GLICKO2_RATING, rating_deviation=DEFAULT_GLICKO2_RD,
                    volatility=DEFAULT_GLICKO2_VOL, matches_played=0))
            teams = [[dict(player_id=pid, rating_entry=states[pid]) for pid in team]
                     for team in (ids[:2], ids[2:])]
            update = calculate_glicko2_team_update(
                *(aggregate_glicko2_team_state(t) for t in teams), m.winner_team)
            # Materialize both distributions before mutating any state.
            deltas = [distribute(t, update[key])
                      for t, key in zip(teams, ("delta_a", "delta_b"))]
            for team, changes in zip(teams, deltas):
                for entry, d in zip(team, changes):
                    s = entry["rating_entry"]
                    s.rating += d["rating"]
                    s.rating_deviation += d["rd"]
                    s.volatility += d["vol"]
                    if legacy:
                        s.rating_deviation = max(1e-6, s.rating_deviation)
                        s.volatility = max(1e-6, s.volatility)
                    s.matches_played += 1
        ranked = sorted((pid for pid, s in states.items()
                         if s.matches_played >= placement_matches),
                        key=lambda pid: (-states[pid].rating, pid))
        ranks = {pid: i for i, pid in enumerate(ranked, 1)}
        return {pid: dict(rating=s.rating, rd=s.rating_deviation, vol=s.volatility,
                          rated_matches=s.matches_played, rank=ranks.get(pid))
                for pid, s in states.items()}

    old = replay(_legacy_distribution, legacy=True)
    new = replay(distribute_team_delta_by_rd)
    return {
        "baseline": "206c66de: legacy linear RD/volatility distribution",
        "candidate": "proportional RD/volatility scaling",
        "matches": len(history), "rated_matches": len(eligible),
        "excluded_matches": len(history) - len(eligible),
        "placement_matches": placement_matches,
        "players": [dict(player_id=pid, before=old[pid], after=new[pid],
                         delta={k: new[pid][k] - old[pid][k] for k in ("rating", "rd", "vol")})
                    for pid in sorted(new)],
    }
