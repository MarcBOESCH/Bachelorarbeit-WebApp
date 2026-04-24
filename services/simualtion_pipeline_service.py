from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from services.rating_utils import (
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
    calculate_trueskill_exposed_rating,
    calculate_log_loss,
)
from services.simulation_io import (
    LoadedSimulatedPlayer,
    LoadedSimulatedMatch,
)


@dataclass
class SimPlayerRef:
    player_id: int


def build_match_teams(match: LoadedSimulatedMatch) -> tuple[list[SimPlayerRef], list[SimPlayerRef]]:
    team_a = [
        SimPlayerRef(match.team_a_player1_id),
        SimPlayerRef(match.team_a_player2_id),
    ]
    team_b = [
        SimPlayerRef(match.team_b_player1_id),
        SimPlayerRef(match.team_b_player2_id),
    ]
    return team_a, team_b


def build_result_payload(
    system_name: str,
    total_predictions: int,
    correct_predictions: int,
    total_brier_score: float,
    total_log_loss: float,
    prediction_details: list[dict],
    final_states: dict[int, Any],
) -> dict:
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
        "final_states": final_states,
    }


def build_glicko2_team_proxy(team_entries: list[SimPlayerRef], player_states: dict[int, dict]) -> list[dict]:
    class RatingEntryProxy:
        def __init__(self, rating: float, rating_deviation: float, volatility: float):
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
            ),
        }
        for entry in team_entries
    ]


def build_trueskill_team_proxy(team_entries: list[SimPlayerRef], player_states: dict[int, Any]) -> list[dict]:
    class RatingEntryProxy:
        def __init__(self, mu: float, sigma: float):
            self.mu = mu
            self.sigma = sigma

    return [
        {
            "player_id": entry.player_id,
            "rating_entry": RatingEntryProxy(
                mu=player_states[entry.player_id].mu,
                sigma=player_states[entry.player_id].sigma,
            ),
        }
        for entry in team_entries
    ]


def evaluate_elo_on_simulation(matches: list[LoadedSimulatedMatch], players: list[LoadedSimulatedPlayer]) -> dict:
    player_ratings = {player.player_id: DEFAULT_ELO_RATING for player in players}
    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    ordered_matches = sorted(matches, key=lambda m: m.played_at)

    for match in ordered_matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        team_a_rating = sum(player_ratings[e.player_id] for e in team_a_entries) / 2
        team_b_rating = sum(player_ratings[e.player_id] for e in team_b_entries) / 2

        expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
        expected_b = 1.0 - expected_a

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_predictions += 1
        total_brier_score += brier_score
        total_log_loss += log_loss
        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_index": match.match_index,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "correct": is_correct,
        })

        update = calculate_elo_update(
            team_a_rating=team_a_rating,
            team_b_rating=team_b_rating,
            winner_team=actual_winner,
            k_factor=32,
        )

        for e in team_a_entries:
            player_ratings[e.player_id] += update["delta_a"]
        for e in team_b_entries:
            player_ratings[e.player_id] += update["delta_b"]

    return build_result_payload(
        system_name="elo",
        total_predictions=total_predictions,
        correct_predictions=correct_predictions,
        total_brier_score=total_brier_score,
        total_log_loss=total_log_loss,
        prediction_details=prediction_details,
        final_states=player_ratings,
    )


def evaluate_elo_margin_on_simulation(matches: list[LoadedSimulatedMatch], players: list[LoadedSimulatedPlayer]) -> dict:
    player_ratings = {player.player_id: DEFAULT_ELO_RATING for player in players}
    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    ordered_matches = sorted(matches, key=lambda m: m.played_at)

    for match in ordered_matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        team_a_rating = sum(player_ratings[e.player_id] for e in team_a_entries) / 2
        team_b_rating = sum(player_ratings[e.player_id] for e in team_b_entries) / 2

        expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
        expected_b = 1.0 - expected_a

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_predictions += 1
        total_brier_score += brier_score
        total_log_loss += log_loss
        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_index": match.match_index,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "point_diff": match.point_diff,
            "correct": is_correct,
        })

        update = calculate_elo_margin_update(
            team_a_rating=team_a_rating,
            team_b_rating=team_b_rating,
            winner_team=actual_winner,
            point_diff=match.point_diff,
            k_factor=32,
            cap=500,
            alpha=0.5,
        )

        for e in team_a_entries:
            player_ratings[e.player_id] += update["delta_a"]
        for e in team_b_entries:
            player_ratings[e.player_id] += update["delta_b"]

    return build_result_payload(
        system_name="elo_margin",
        total_predictions=total_predictions,
        correct_predictions=correct_predictions,
        total_brier_score=total_brier_score,
        total_log_loss=total_log_loss,
        prediction_details=prediction_details,
        final_states=player_ratings,
    )


def evaluate_glicko2_on_simulation(matches: list[LoadedSimulatedMatch], players: list[LoadedSimulatedPlayer]) -> dict:
    player_states = {
        player.player_id: {
            "rating": DEFAULT_GLICKO2_RATING,
            "rd": DEFAULT_GLICKO2_RD,
            "vol": DEFAULT_GLICKO2_VOL,
        }
        for player in players
    }

    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    ordered_matches = sorted(matches, key=lambda m: m.played_at)

    for match in ordered_matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        team_a_proxy = build_glicko2_team_proxy(team_a_entries, player_states)
        team_b_proxy = build_glicko2_team_proxy(team_b_entries, player_states)

        team_a_state = aggregate_glicko2_team_state(team_a_proxy)
        team_b_state = aggregate_glicko2_team_state(team_b_proxy)

        expected_a = calculate_elo_expected_score(team_a_state["rating"], team_b_state["rating"])
        expected_b = 1.0 - expected_a

        predicted_winner = "A" if expected_a >= expected_b else "B"
        actual_winner = match.winner_team
        is_correct = predicted_winner == actual_winner

        actual_a_binary = 1.0 if actual_winner == "A" else 0.0
        brier_score = (expected_a - actual_a_binary) ** 2
        log_loss = calculate_log_loss(expected_a, actual_a_binary)

        total_predictions += 1
        total_brier_score += brier_score
        total_log_loss += log_loss
        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_index": match.match_index,
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
            player_states[entry.player_id]["rd"] = max(1e-6, player_states[entry.player_id]["rd"] + delta["rd"])
            player_states[entry.player_id]["vol"] = max(1e-6, player_states[entry.player_id]["vol"] + delta["vol"])

        for entry, delta in zip(team_b_entries, distributed_b):
            player_states[entry.player_id]["rating"] += delta["rating"]
            player_states[entry.player_id]["rd"] = max(1e-6, player_states[entry.player_id]["rd"] + delta["rd"])
            player_states[entry.player_id]["vol"] = max(1e-6, player_states[entry.player_id]["vol"] + delta["vol"])

    return build_result_payload(
        system_name="glicko2",
        total_predictions=total_predictions,
        correct_predictions=correct_predictions,
        total_brier_score=total_brier_score,
        total_log_loss=total_log_loss,
        prediction_details=prediction_details,
        final_states=player_states,
    )


def evaluate_trueskill_on_simulation(matches: list[LoadedSimulatedMatch], players: list[LoadedSimulatedPlayer]) -> dict:
    player_states = {
        player.player_id: TRUESKILL_ENV.create_rating(
            mu=DEFAULT_TRUESKILL_MU,
            sigma=DEFAULT_TRUESKILL_SIGMA,
        )
        for player in players
    }

    correct_predictions = 0
    total_predictions = 0
    prediction_details = []
    total_brier_score = 0.0
    total_log_loss = 0.0

    ordered_matches = sorted(matches, key=lambda m: m.played_at)

    for match in ordered_matches:
        team_a_entries, team_b_entries = build_match_teams(match)

        team_a_proxy = build_trueskill_team_proxy(team_a_entries, player_states)
        team_b_proxy = build_trueskill_team_proxy(team_b_entries, player_states)

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

        total_predictions += 1
        total_brier_score += brier_score
        total_log_loss += log_loss
        if is_correct:
            correct_predictions += 1

        prediction_details.append({
            "match_index": match.match_index,
            "predicted_winner": predicted_winner,
            "actual_winner": actual_winner,
            "confidence_a": round(expected_a, 4),
            "confidence_b": round(expected_b, 4),
            "brier_score": round(brier_score, 6),
            "log_loss": round(log_loss, 6),
            "correct": is_correct,
        })

        team_a_ratings = [player_states[e.player_id] for e in team_a_entries]
        team_b_ratings = [player_states[e.player_id] for e in team_b_entries]

        update_result = calculate_trueskill_team_update(
            team_a_ratings=team_a_ratings,
            team_b_ratings=team_b_ratings,
            winner_team=actual_winner,
        )

        for entry, new_rating in zip(team_a_entries, update_result["team_a_after"]):
            player_states[entry.player_id] = new_rating

        for entry, new_rating in zip(team_b_entries, update_result["team_b_after"]):
            player_states[entry.player_id] = new_rating

    final_states = {
        player_id: {
            "mu": rating.mu,
            "sigma": rating.sigma,
            "exposed_rating": calculate_trueskill_exposed_rating(rating.mu, rating.sigma),
        }
        for player_id, rating in player_states.items()
    }

    return build_result_payload(
        system_name="trueskill",
        total_predictions=total_predictions,
        correct_predictions=correct_predictions,
        total_brier_score=total_brier_score,
        total_log_loss=total_log_loss,
        prediction_details=prediction_details,
        final_states=final_states,
    )


def evaluate_all_systems_on_simulation(
    matches: list[LoadedSimulatedMatch],
    players: list[LoadedSimulatedPlayer],
) -> dict:
    return {
        "elo": evaluate_elo_on_simulation(matches, players),
        "elo_margin": evaluate_elo_margin_on_simulation(matches, players),
        "glicko2": evaluate_glicko2_on_simulation(matches, players),
        "trueskill": evaluate_trueskill_on_simulation(matches, players),
    }