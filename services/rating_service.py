import datetime

from extensions import db
from models.match import Match
from models.player import Player
from models.rating import PlayerRating
from models.match_rating_status import MatchRatingStatus

SUPPORTED_SYSTEMS = {"elo", "glicko2", "trueskill"}


def get_or_create_player_rating(player_id, system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    rating_entry = PlayerRating.query.filter_by(
        player_id=player_id,
        system_name=system_name
    ).first()

    if rating_entry:
        return rating_entry

    if system_name == "elo":
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name="elo",
            rating=1500.0,
            matches_played=0
        )

    elif system_name == "glicko2":
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name="glicko2",
            rating=1500.0,
            rating_deviation=350.0,
            volatility=0.06,
            matches_played=0
        )

    elif system_name == "trueskill":
        rating_entry = PlayerRating(
            player_id=player_id,
            system_name="trueskill",
            mu=25.0,
            sigma=8.333,
            matches_played=0
        )

    db.session.add(rating_entry)
    db.session.commit()

    return rating_entry


def split_match_ratings_by_team(match, system_name):
    entries = get_match_player_ratings(match, system_name)

    team_a = [entry for entry in entries if entry["team"] == "A"]
    team_b = [entry for entry in entries if entry["team"] == "B"]

    return team_a, team_b


def calculate_elo_expected_score(team_a_rating, team_b_rating):
    return 1 / (1 + 10 ** ((team_b_rating - team_a_rating) / 400))


def calculate_team_average_rating(team_entries):
    ratings = [entry["rating_entry"].rating for entry in team_entries]
    return sum(ratings) / len(ratings)


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


def process_match_for_system(match, system_name):
    if system_name == "elo":
        return process_elo_match(match)

    raise ValueError(f"Für das System '{system_name}' ist noch keine Verarbeitung implementiert.")


def process_all_unprocessed_matches_for_system(system_name):
    if system_name not in SUPPORTED_SYSTEMS:
        raise ValueError(f"Unbekanntes Rating-System: {system_name}")

    matches = get_unprocessed_matches_for_system(system_name)
    results = []

    for match in matches:
        result = process_match_for_system(match, system_name)
        results.append(result)

    return results


def process_elo_match(match, k_factor=32):
    team_a, team_b = split_match_ratings_by_team(match, "elo")

    if len(team_a) != 2 or len(team_b) != 2:
        raise ValueError("Ein Elo-Match muss genau 2 Spieler pro Team haben.")

    team_a_rating = calculate_team_average_rating(team_a)
    team_b_rating = calculate_team_average_rating(team_b)

    expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
    expected_b = calculate_elo_expected_score(team_b_rating, team_a_rating)

    actual_a = 1.0 if match.winner_team == "A" else 0.0
    actual_b = 1.0 if match.winner_team == "B" else 0.0

    delta_a = k_factor * (actual_a - expected_a)
    delta_b = k_factor * (actual_b - expected_b)

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

def process_all_unprocessed_elo_matches():
    matches = get_unprocessed_matches_for_system("elo")
    results = []

    for match in matches:
        result = process_elo_match(match)
        results.append(result)

    return results

def get_match_player_ratings(match, system_name):
    ratings = []

    sorted_entries = sorted(match.players, key=lambda player_entry: (player_entry.team, player_entry.team_slot))

    for entry in sorted_entries:
        rating_entry = get_or_create_player_rating(entry.player_id, system_name)

        ratings.append({
            "player_id": entry.player_id,
            "player_name": entry.player.name,
            "team": entry.team,
            "team_slot": entry.team_slot,
            "rating_entry": rating_entry
        })

    return ratings