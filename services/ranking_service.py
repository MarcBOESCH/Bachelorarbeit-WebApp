"""Shared public placement policy; admin comparisons retain all players."""
from flask import current_app
from models.match import Match
from models.match_rating_status import MatchRatingStatus
from models.rating import PlayerRating


def public_rating_lookup():
    # Hide ranks while a saved match is awaiting processing after a failed update.
    eligible = {m.id for m in Match.query.filter_by(four_twenty_mode=False).all()}
    processed = {s.match_id for s in MatchRatingStatus.query.filter_by(
        system_name="glicko2", processed=True).all()}
    return ({r.player_id: r for r in PlayerRating.query.filter_by(system_name="glicko2").all()},
            eligible == processed)


def placement_fields(entry, ready=True):
    required = current_app.config["RATING_PLACEMENT_MATCHES"]
    count = entry.matches_played if entry else 0
    return {
        "glicko2": entry.rating if entry else None,
        "rating_deviation": entry.rating_deviation if entry else None,
        "rated_matches": count,
        "placement_required": required,
        "placement_remaining": max(0, required - count),
        "ranking_eligible": bool(ready and entry and count >= required),
        "rating_pending": not ready,
    }


def assign_rating_ranks(stats):
    ranked = sorted((s for s in stats if s["ranking_eligible"]),
                    key=lambda s: (-s["glicko2"], s["id"]))
    ranks = {s["id"]: i for i, s in enumerate(ranked, 1)}
    for item in stats:
        item["rating_rank"] = ranks.get(item["id"])
    return stats
