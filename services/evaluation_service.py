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
    calculate_elo_update,
    calculate_elo_margin_update,
    aggregate_glicko2_team_state,
    calculate_glicko2_team_update,
    distribute_team_delta_by_rd,
    aggregate_trueskill_team_state,
    calculate_trueskill_team_update,
    calculate_trueskill_win_probability,
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


def build_glicko2_team_proxy(team_entries, player_states):
    class RatingEntryProxy:
        def __init__(self, rating, rating_deviation, volatility):
            self.rating = rating
            self.rating_deviation = rating_deviation
            self.volatility = volatility

    return [
        {
            "player_id": entry.player_id,
            "rating_entry": RatingEntryProxy(
                rating=player_states[entry.player_id]["rating"],
                rating_deviation=player_states[entry.player_id]["rd"],
                volatility=player_states[entry.player_id]["vol"],
            )
        }
        for entry in team_entries
    ]


def build_trueskill_team_proxy(team_entries, player_states):
    class RatingEntryProxy:
        def __init__(self, mu, sigma):
            self.mu = mu
            self.sigma = sigma

    return [
        {
            "rating_entry": RatingEntryProxy(
                mu=player_states[entry.player_id].mu,
                sigma=player_states[entry.player_id].sigma,
            )
        }
        for entry in team_entries
    ]


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

        elo_result = calculate_elo_update(
            team_a_rating=team_a_rating,
            team_b_rating=team_b_rating,
            winner_team=actual_winner,
            k_factor=32,
        )

        delta_a = elo_result["delta_a"]
        delta_b = elo_result["delta_b"]

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


def evaluate_elo_margin_predictions():
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
            "point_diff": match.point_diff,
            "correct": is_correct,
        })

        elo_result = calculate_elo_margin_update(
            team_a_rating=team_a_rating,
            team_b_rating=team_b_rating,
            winner_team=actual_winner,
            point_diff=match.point_diff,
            k_factor=32,
            cap=500,
            alpha=0.5,
        )

        delta_a = elo_result["delta_a"]
        delta_b = elo_result["delta_b"]

        for entry in team_a_entries:
            player_ratings[entry.player_id] += delta_a

        for entry in team_b_entries:
            player_ratings[entry.player_id] += delta_b

    return build_result_payload(
        "elo_margin",
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

        team_a_proxy = build_trueskill_team_proxy(team_a_entries, player_states)
        team_b_proxy = build_trueskill_team_proxy(team_b_entries, player_states)

        team_a_state = aggregate_glicko2_team_state(team_a_proxy)
        team_b_state = aggregate_glicko2_team_state(team_b_proxy)

        expected_a = calculate_elo_expected_score(team_a_state["rating"], team_b_state["rating"])
        expected_b = calculate_elo_expected_score(team_b_state["rating"], team_a_state["rating"])

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

        update_result = calculate_glicko2_team_update(
            team_a_state=team_a_state,
            team_b_state=team_b_state,
            winner_team=actual_winner,
        )

        distributed_a = distribute_team_delta_by_rd(team_a_proxy, update_result["delta_a"])
        distributed_b = distribute_team_delta_by_rd(team_b_proxy, update_result["delta_b"])

        for entry, delta in zip(team_a_entries, distributed_a):
            player_states[entry.player_id]["rating"] += delta["rating"]
            player_states[entry.player_id]["rd"] += delta["rd"]
            player_states[entry.player_id]["vol"] += delta["vol"]

        for entry, delta in zip(team_b_entries, distributed_b):
            player_states[entry.player_id]["rating"] += delta["rating"]
            player_states[entry.player_id]["rd"] += delta["rd"]
            player_states[entry.player_id]["vol"] += delta["vol"]

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

        team_a_proxy = [
            {
                "rating_entry": type(
                    "RatingEntryProxy",
                    (),
                    {
                        "mu": player_states[entry.player_id].mu,
                        "sigma": player_states[entry.player_id].sigma,
                    },
                )()
            }
            for entry in team_a_entries
        ]
        team_b_proxy = [
            {
                "rating_entry": type(
                    "RatingEntryProxy",
                    (),
                    {
                        "mu": player_states[entry.player_id].mu,
                        "sigma": player_states[entry.player_id].sigma,
                    },
                )()
            }
            for entry in team_b_entries
        ]

        team_a_state = aggregate_trueskill_team_state(team_a_proxy)
        team_b_state = aggregate_trueskill_team_state(team_b_proxy)

        expected_a = calculate_trueskill_win_probability(team_a_state, team_b_state)
        expected_b = 1.0 - expected_a

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

        update_result = calculate_trueskill_team_update(
            team_a_ratings=team_a_ratings,
            team_b_ratings=team_b_ratings,
            winner_team=actual_winner,
        )

        new_team_a_ratings = update_result["team_a_after"]
        new_team_b_ratings = update_result["team_b_after"]

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

    if system_name == "elo_margin":
        return evaluate_elo_margin_predictions()

    if system_name == "glicko2":
        return evaluate_glicko2_predictions()

    if system_name == "trueskill":
        return evaluate_trueskill_predictions()

    raise ValueError(f"Für das System '{system_name}' ist noch keine Evaluation implementiert.")