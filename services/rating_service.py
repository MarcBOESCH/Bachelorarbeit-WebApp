import datetime

from glicko2 import Player as Glicko2Player

from extensions import db
from models.match import Match
from models.match_rating_status import MatchRatingStatus
from models.rating import PlayerRating
from services.rating_utils import (
    SUPPORTED_RATING_SYSTEMS,
    DEFAULT_ELO_RATING,
    DEFAULT_GLICKO2_RATING,
    DEFAULT_GLICKO2_RD,
    DEFAULT_GLICKO2_VOL,
    DEFAULT_TRUESKILL_MU,
    DEFAULT_TRUESKILL_SIGMA,
    TRUESKILL_ENV,
    calculate_elo_update,
    calculate_elo_margin_update,
)

SUPPORTED_SYSTEMS = SUPPORTED_RATING_SYSTEMS


def get_or_create_player_rating(player_id, system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    rating_entry = PlayerRating.query.filter_by(
        player_id=player_id,
        system_name=system_name
    ).first()

    if rating_entry:
        return rating_entry

    if system_name in {"elo", "elo_margin",}:
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name=system_name,
            rating=DEFAULT_ELO_RATING,
            matches_played=0
        )
    elif system_name == "glicko2":
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name="glicko2",
            rating=DEFAULT_GLICKO2_RATING,
            rating_deviation=DEFAULT_GLICKO2_RD,
            volatility=DEFAULT_GLICKO2_VOL,
            matches_played=0
        )
    elif system_name == "trueskill":
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name="trueskill",
            mu=DEFAULT_TRUESKILL_MU,
            sigma=DEFAULT_TRUESKILL_SIGMA,
            matches_played=0
        )
    else:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    db.session.add(rating_entry)
    db.session.commit()
    return rating_entry


def get_match_player_ratings(match, system_name):
    return [
        {
            "player_id": match.team_a.player1_id,
            "player_name": match.team_a.player1.name,
            "team": "A",
            "team_slot": 1,
            "rating_entry": get_or_create_player_rating(match.team_a.player1_id, system_name)
        },
        {
            "player_id": match.team_a.player2_id,
            "player_name": match.team_a.player2.name,
            "team": "A",
            "team_slot": 2,
            "rating_entry": get_or_create_player_rating(match.team_a.player2_id, system_name)
        },
        {
            "player_id": match.team_b.player1_id,
            "player_name": match.team_b.player1.name,
            "team": "B",
            "team_slot": 1,
            "rating_entry": get_or_create_player_rating(match.team_b.player1_id, system_name)
        },
        {
            "player_id": match.team_b.player2_id,
            "player_name": match.team_b.player2.name,
            "team": "B",
            "team_slot": 2,
            "rating_entry": get_or_create_player_rating(match.team_b.player2_id, system_name)
        }
    ]


def split_match_ratings_by_team(match, system_name):
    entries = get_match_player_ratings(match, system_name)
    team_a = [entry for entry in entries if entry["team"] == "A"]
    team_b = [entry for entry in entries if entry["team"] == "B"]
    return team_a, team_b


def calculate_team_average_rating(team_entries):
    ratings = [entry["rating_entry"].rating for entry in team_entries]
    return sum(ratings) / len(ratings)


def calculate_team_average_glicko2_values(team_entries):
    avg_rating = sum(entry["rating_entry"].rating for entry in team_entries) / len(team_entries)
    avg_rd = sum(entry["rating_entry"].rating_deviation for entry in team_entries) / len(team_entries)
    avg_vol = sum(entry["rating_entry"].volatility for entry in team_entries) / len(team_entries)
    return avg_rating, avg_rd, avg_vol


def build_trueskill_rating(rating_entry):
    return TRUESKILL_ENV.create_rating(
        mu=rating_entry.mu,
        sigma=rating_entry.sigma
    )


def get_or_create_match_rating_status(match_id, system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    status_entry = MatchRatingStatus.query.filter_by(
        match_id=match_id,
        system_name=system_name
    ).first()

    if status_entry:
        return status_entry

    status_entry = MatchRatingStatus(
        match_id=match_id,
        system_name=system_name,
        processed=False
    )

    db.session.add(status_entry)
    db.session.commit()
    return status_entry


def get_unprocessed_matches_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    matches = Match.query.order_by(Match.played_at.asc()).all()
    result = []

    for match in matches:
        status_entry = MatchRatingStatus.query.filter_by(
            match_id=match.id,
            system_name=system_name
        ).first()

        if not status_entry or not status_entry.processed:
            result.append(match)

    return result


def mark_match_as_processed_for_system(match, system_name):
    status_entry = get_or_create_match_rating_status(match.id, system_name)
    status_entry.processed = True
    status_entry.processed_at = datetime.datetime.now()


def process_elo_match(match, k_factor=32):
    team_a, team_b = split_match_ratings_by_team(match, "elo")

    if len(team_a) != 2 or len(team_b) != 2:
        raise ValueError("Ein Elo-Match muss genau 2 Spieler pro Team haben.")

    team_a_rating = calculate_team_average_rating(team_a)
    team_b_rating = calculate_team_average_rating(team_b)

    elo_result = calculate_elo_update(
        team_a_rating=team_a_rating,
        team_b_rating=team_b_rating,
        winner_team=match.winner_team,
        k_factor=k_factor,
    )

    delta_a = elo_result["delta_a"]
    delta_b = elo_result["delta_b"]
    expected_a = elo_result["expected_a"]
    expected_b = elo_result["expected_b"]

    for entry in team_a:
        rating = entry["rating_entry"]
        rating.rating += delta_a
        rating.matches_played += 1

    for entry in team_b:
        rating = entry["rating_entry"]
        rating.rating += delta_b
        rating.matches_played += 1

    mark_match_as_processed_for_system(match, "elo")
    db.session.commit()

    return {
        "match_id": match.id,
        "winner_team": match.winner_team,
        "team_a_rating_before": round(team_a_rating, 2),
        "team_b_rating_before": round(team_b_rating, 2),
        "expected_a": round(expected_a, 4),
        "expected_b": round(expected_b, 4),
        "delta_a": round(delta_a, 2),
        "delta_b": round(delta_b, 2)
    }


def process_elo_margin_match(match, k_factor=32, cap=500, alpha=0.5):
    team_a, team_b = split_match_ratings_by_team(match, "elo_margin")

    if len(team_a) != 2 or len(team_b) != 2:
        raise ValueError("Ein Elo-Margin-Match muss genau 2 Spieler pro Team haben.")

    team_a_rating = calculate_team_average_rating(team_a)
    team_b_rating = calculate_team_average_rating(team_b)

    elo_result = calculate_elo_margin_update(
        team_a_rating=team_a_rating,
        team_b_rating=team_b_rating,
        winner_team=match.winner_team,
        point_diff=match.point_diff,
        k_factor=k_factor,
        cap=cap,
        alpha=alpha,
    )

    delta_a = elo_result["delta_a"]
    delta_b = elo_result["delta_b"]
    expected_a = elo_result["expected_a"]
    expected_b = elo_result["expected_b"]
    margin_multiplier = elo_result["margin_multiplier"]

    for entry in team_a:
        rating = entry["rating_entry"]
        rating.rating += delta_a
        rating.matches_played += 1

    for entry in team_b:
        rating = entry["rating_entry"]
        rating.rating += delta_b
        rating.matches_played += 1

    mark_match_as_processed_for_system(match, "elo_margin")
    db.session.commit()

    return {
        "match_id": match.id,
        "winner_team": match.winner_team,
        "team_a_rating_before": round(team_a_rating, 2),
        "team_b_rating_before": round(team_b_rating, 2),
        "expected_a": round(expected_a, 4),
        "expected_b": round(expected_b, 4),
        "delta_a": round(delta_a, 2),
        "delta_b": round(delta_b, 2),
        "margin_multiplier": round(margin_multiplier, 4),
    }


def process_glicko2_match(match):
    team_a, team_b = split_match_ratings_by_team(match, "glicko2")

    if len(team_a) != 2 or len(team_b) != 2:
        raise ValueError("Ein Glicko-2-Match muss genau 2 Spieler pro Team haben.")

    team_a_rating, team_a_rd, team_a_vol = calculate_team_average_glicko2_values(team_a)
    team_b_rating, team_b_rd, team_b_vol = calculate_team_average_glicko2_values(team_b)

    team_a_player = Glicko2Player(rating=team_a_rating, rd=team_a_rd, vol=team_a_vol)
    team_b_player = Glicko2Player(rating=team_b_rating, rd=team_b_rd, vol=team_b_vol)

    if match.winner_team == "A":
        team_a_result = 1
        team_b_result = 0
    else:
        team_a_result = 0
        team_b_result = 1

    team_a_player.update_player([team_b_rating], [team_b_rd], [team_a_result])
    team_b_player.update_player([team_a_rating], [team_a_rd], [team_b_result])

    delta_a_rating = team_a_player.rating - team_a_rating
    delta_b_rating = team_b_player.rating - team_b_rating
    delta_a_rd = team_a_player.rd - team_a_rd
    delta_b_rd = team_b_player.rd - team_b_rd
    delta_a_vol = team_a_player.vol - team_a_vol
    delta_b_vol = team_b_player.vol - team_b_vol

    for entry in team_a:
        rating = entry["rating_entry"]
        rating.rating += delta_a_rating
        rating.rating_deviation += delta_a_rd
        rating.volatility += delta_a_vol
        rating.matches_played += 1

    for entry in team_b:
        rating = entry["rating_entry"]
        rating.rating += delta_b_rating
        rating.rating_deviation += delta_b_rd
        rating.volatility += delta_b_vol
        rating.matches_played += 1

    mark_match_as_processed_for_system(match, "glicko2")
    db.session.commit()

    return {
        "match_id": match.id,
        "winner_team": match.winner_team,
        "team_a_rating_before": round(team_a_rating, 2),
        "team_b_rating_before": round(team_b_rating, 2),
        "team_a_rating_after": round(team_a_player.rating, 2),
        "team_b_rating_after": round(team_b_player.rating, 2)
    }


def process_trueskill_match(match):
    team_a, team_b = split_match_ratings_by_team(match, "trueskill")

    if len(team_a) != 2 or len(team_b) != 2:
        raise ValueError("Ein TrueSkill-Match muss genau 2 Spieler pro Team haben.")

    team_a_ratings = [build_trueskill_rating(entry["rating_entry"]) for entry in team_a]
    team_b_ratings = [build_trueskill_rating(entry["rating_entry"]) for entry in team_b]

    if match.winner_team == "A":
        rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[0, 1])
    else:
        rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[1, 0])

    new_team_a_ratings, new_team_b_ratings = rated_teams

    for entry, new_rating in zip(team_a, new_team_a_ratings):
        rating = entry["rating_entry"]
        rating.mu = new_rating.mu
        rating.sigma = new_rating.sigma
        rating.matches_played += 1

    for entry, new_rating in zip(team_b, new_team_b_ratings):
        rating = entry["rating_entry"]
        rating.mu = new_rating.mu
        rating.sigma = new_rating.sigma
        rating.matches_played += 1

    mark_match_as_processed_for_system(match, "trueskill")
    db.session.commit()

    return {
        "match_id": match.id,
        "winner_team": match.winner_team,
        "team_a_mu_before": [round(r.mu, 4) for r in team_a_ratings],
        "team_b_mu_before": [round(r.mu, 4) for r in team_b_ratings],
        "team_a_mu_after": [round(r.mu, 4) for r in new_team_a_ratings],
        "team_b_mu_after": [round(r.mu, 4) for r in new_team_b_ratings]
    }


def process_match_for_system(match, system_name):
    if system_name == "elo":
        return process_elo_match(match)
    if system_name == "elo_margin":
        return process_elo_margin_match(match)
    if system_name == "glicko2":
        return process_glicko2_match(match)
    if system_name == "trueskill":
        return process_trueskill_match(match)

    raise ValueError(f"Für das System '{system_name}' ist noch keine Verarbeitung implementiert.")


def process_all_unprocessed_matches_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    matches = get_unprocessed_matches_for_system(system_name)
    results = []

    for match in matches:
        results.append(process_match_for_system(match, system_name))

    return results


def get_player_ratings_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    rating_entries = PlayerRating.query.filter_by(system_name=system_name).all()

    result = []
    for entry in rating_entries:
        result.append({
            "player_id": entry.player_id,
            "player_name": entry.player.name,
            "system_name": entry.system_name,
            "rating": round(entry.rating, 2) if entry.rating is not None else None,
            "matches_played": entry.matches_played,
            "rating_deviation": round(entry.rating_deviation, 2) if entry.rating_deviation is not None else None,
            "volatility": round(entry.volatility, 4) if entry.volatility is not None else None,
            "mu": round(entry.mu, 4) if entry.mu is not None else None,
            "sigma": round(entry.sigma, 4) if entry.sigma is not None else None
        })

    if system_name in {"elo", "elo_margin","glicko2"}:
        result.sort(
            key=lambda item: item["rating"] if item["rating"] is not None else -999999,
            reverse=True
        )
    elif system_name == "trueskill":
        result.sort(
            key=lambda item: item["mu"] if item["mu"] is not None else -999999,
            reverse=True
        )

    return result