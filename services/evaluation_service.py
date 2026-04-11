from glicko2 import Player as Glicko2Player

from models.match import Match
from services.rating_utils import (
    SUPPORTED_RATING_SYSTEMS,
    DEFAULT_ELO_RATING,
    DEFAULT_GLICKO2_RATING,
    DEFAULT_GLICKO2_RD,
    DEFAULT_GLICKO2_VOL,
    DEFAULT_TRUESKILL_MU,
    DEFAULT_TRUESKILL_SIGMA,
    TRUESKILL_ENV,
    calculate_elo_expected_score,
    calculate_log_loss,
)


SUPPORTED_EVALUATION_SYSTEMS = SUPPORTED_RATING_SYSTEMS


class MockPlayerEntry:
    def __init__(self, player_id, team, team_slot):
        self.player_id = player_id
        self.team = team
        self.team_slot = team_slot


def build_match_teams(match):
    team_a_entries = [
        MockPlayerEntry(match.team_a.player1_id, "A", 1),
        MockPlayerEntry(match.team_a.player2_id, "A", 2),
    ]
    team_b_entries = [
        MockPlayerEntry(match.team_b.player1_id, "B", 1),
        MockPlayerEntry(match.team_b.player2_id, "B", 2),
    ]
    return team_a_entries, team_b_entries


def build_result_payload(
    system_name,
    total_predictions,
    correct_predictions,
    total_brier_score,
    total_log_loss,
    prediction_details,
):
    accuracy = round((correct_predictions / total_predictions) * 100, 2) if total_predictions > 0 else 0.0
    average_brier_score = round(total_brier_score / total_predictions, 6) if total_predictions > 0 else 0.0
    average_log_loss = round(total_log_loss / total_predictions, 6) if total_predictions > 0 else 0.0

    return {
        "system_name": system_name,
        "total_predictions": total_predictions,
        "correct_predictions": correct_predictions,
        "accuracy": accuracy,
        "brier_score": average_brier_score,
        "log_loss": average_log_loss,
        "details": prediction_details,
    }


def evaluate_elo_predictions():
    matches = Match.query.order_by(Match.played_at.asc()).all()

    player_ratings = {}
    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    for match in matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        if len(team_a_entries) != 2 or len(team_b_entries) != 2:
            continue

        for entry in team_a_entries + team_b_entries:
            if entry.player_id not in player_ratings:
                player_ratings[entry.player_id] = DEFAULT_ELO_RATING

        team_a_rating = sum(player_ratings[entry.player_id] for entry in team_a_entries) / 2
        team_b_rating = sum(player_ratings[entry.player_id] for entry in team_b_entries) / 2

        expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
        expected_b = calculate_elo_expected_score(team_b_rating, team_a_rating)

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_brier_score += brier_score
        total_log_loss += log_loss
        total_predictions += 1

        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_id": match.id,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "correct": is_correct,
        })

        actual_a = 1.0 if actual_winner == "A" else 0.0
        actual_b = 1.0 if actual_winner == "B" else 0.0

        k_factor = 32
        mov_multiplier = 1.0 + (match.point_diff / 500.0)
        adjusted_k = k_factor * mov_multiplier

        delta_a = adjusted_k * (actual_a - expected_a)
        delta_b = adjusted_k * (actual_b - expected_b)

        for entry in team_a_entries:
            player_ratings[entry.player_id] += delta_a

        for entry in team_b_entries:
            player_ratings[entry.player_id] += delta_b

    return build_result_payload(
        "elo",
        total_predictions,
        correct_predictions,
        total_brier_score,
        total_log_loss,
        prediction_details,
    )


def evaluate_glicko2_predictions():
    matches = Match.query.order_by(Match.played_at.asc()).all()

    player_states = {}
    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    for match in matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        if len(team_a_entries) != 2 or len(team_b_entries) != 2:
            continue

        for entry in team_a_entries + team_b_entries:
            if entry.player_id not in player_states:
                player_states[entry.player_id] = {
                    "rating": DEFAULT_GLICKO2_RATING,
                    "rd": DEFAULT_GLICKO2_RD,
                    "vol": DEFAULT_GLICKO2_VOL,
                }

        team_a_rating = sum(player_states[entry.player_id]["rating"] for entry in team_a_entries) / 2
        team_b_rating = sum(player_states[entry.player_id]["rating"] for entry in team_b_entries) / 2

        team_a_rd = sum(player_states[entry.player_id]["rd"] for entry in team_a_entries) / 2
        team_b_rd = sum(player_states[entry.player_id]["rd"] for entry in team_b_entries) / 2

        team_a_vol = sum(player_states[entry.player_id]["vol"] for entry in team_a_entries) / 2
        team_b_vol = sum(player_states[entry.player_id]["vol"] for entry in team_b_entries) / 2

        expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
        expected_b = calculate_elo_expected_score(team_b_rating, team_a_rating)

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_brier_score += brier_score
        total_log_loss += log_loss
        total_predictions += 1

        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_id": match.id,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "correct": is_correct,
        })

        team_a_player = Glicko2Player(
            rating=team_a_rating,
            rd=team_a_rd,
            vol=team_a_vol,
        )
        team_b_player = Glicko2Player(
            rating=team_b_rating,
            rd=team_b_rd,
            vol=team_b_vol,
        )

        if actual_winner == "A":
            team_a_result = 1
            team_b_result = 0
        else:
            team_a_result = 0
            team_b_result = 1

        team_a_opponent_rating = team_b_rating
        team_a_opponent_rd = team_b_rd

        team_b_opponent_rating = team_a_rating
        team_b_opponent_rd = team_a_rd

        team_a_player.update_player(
            [team_a_opponent_rating],
            [team_a_opponent_rd],
            [team_a_result],
        )
        team_b_player.update_player(
            [team_b_opponent_rating],
            [team_b_opponent_rd],
            [team_b_result],
        )

        delta_a_rating = team_a_player.rating - team_a_rating
        delta_b_rating = team_b_player.rating - team_b_rating

        delta_a_rd = team_a_player.rd - team_a_rd
        delta_b_rd = team_b_player.rd - team_b_rd

        delta_a_vol = team_a_player.vol - team_a_vol
        delta_b_vol = team_b_player.vol - team_b_vol

        for entry in team_a_entries:
            player_states[entry.player_id]["rating"] += delta_a_rating
            player_states[entry.player_id]["rd"] += delta_a_rd
            player_states[entry.player_id]["vol"] += delta_a_vol

        for entry in team_b_entries:
            player_states[entry.player_id]["rating"] += delta_b_rating
            player_states[entry.player_id]["rd"] += delta_b_rd
            player_states[entry.player_id]["vol"] += delta_b_vol

    return build_result_payload(
        "glicko2",
        total_predictions,
        correct_predictions,
        total_brier_score,
        total_log_loss,
        prediction_details,
    )


def evaluate_trueskill_predictions():
    matches = Match.query.order_by(Match.played_at.asc()).all()

    player_states = {}
    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    for match in matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        if len(team_a_entries) != 2 or len(team_b_entries) != 2:
            continue

        for entry in team_a_entries + team_b_entries:
            if entry.player_id not in player_states:
                player_states[entry.player_id] = TRUESKILL_ENV.create_rating(
                    mu=DEFAULT_TRUESKILL_MU,
                    sigma=DEFAULT_TRUESKILL_SIGMA,
                )

        team_a_mu = sum(player_states[entry.player_id].mu for entry in team_a_entries) / 2
        team_b_mu = sum(player_states[entry.player_id].mu for entry in team_b_entries) / 2

        expected_a = calculate_elo_expected_score(team_a_mu, team_b_mu)
        expected_b = calculate_elo_expected_score(team_b_mu, team_a_mu)

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_brier_score += brier_score
        total_log_loss += log_loss
        total_predictions += 1

        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_id": match.id,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "correct": is_correct,
        })

        team_a_ratings = [player_states[entry.player_id] for entry in team_a_entries]
        team_b_ratings = [player_states[entry.player_id] for entry in team_b_entries]

        if actual_winner == "A":
            rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[0, 1])
        else:
            rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[1, 0])

        new_team_a_ratings, new_team_b_ratings = rated_teams

        for entry, new_rating in zip(team_a_entries, new_team_a_ratings):
            player_states[entry.player_id] = new_rating

        for entry, new_rating in zip(team_b_entries, new_team_b_ratings):
            player_states[entry.player_id] = new_rating

    return build_result_payload(
        "trueskill",
        total_predictions,
        correct_predictions,
        total_brier_score,
        total_log_loss,
        prediction_details,
    )


def evaluate_predictions_for_system(system_name):
    if system_name not in SUPPORTED_EVALUATION_SYSTEMS:
        raise ValueError(f"Unbekanntes Evaluationssystem: {system_name}")

    if system_name == "elo":
        return evaluate_elo_predictions()

    if system_name == "glicko2":
        return evaluate_glicko2_predictions()

    if system_name == "trueskill":
        return evaluate_trueskill_predictions()

    raise ValueError(f"Für das System '{system_name}' ist noch keine Evaluation implementiert.")