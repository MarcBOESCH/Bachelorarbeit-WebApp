from __future__ import annotations

import math
from typing import Any

from services.simulation_io import LoadedSimulatedPlayer


def build_true_skill_lookup(players: list[LoadedSimulatedPlayer]) -> dict[int, float]:
    return {player.player_id: player.true_skill for player in players}


def _rank_desc(values_by_player: dict[int, float]) -> dict[int, int]:
    sorted_items = sorted(
        values_by_player.items(),
        key=lambda item: item[1],
        reverse=True,
    )

    ranks: dict[int, int] = {}
    current_rank = 1

    for index, (player_id, value) in enumerate(sorted_items):
        if index > 0:
            previous_value = sorted_items[index - 1][1]
            if value != previous_value:
                current_rank = index + 1

        ranks[player_id] = current_rank

    return ranks


def calculate_spearman_rank_correlation(
    true_values_by_player: dict[int, float],
    estimated_values_by_player: dict[int, float],
) -> float:
    common_player_ids = sorted(set(true_values_by_player.keys()) & set(estimated_values_by_player.keys()))

    n = len(common_player_ids)
    if n < 2:
        return 0.0

    true_ranks = _rank_desc({pid: true_values_by_player[pid] for pid in common_player_ids})
    estimated_ranks = _rank_desc({pid: estimated_values_by_player[pid] for pid in common_player_ids})

    sum_squared_rank_diff = 0.0
    for player_id in common_player_ids:
        diff = true_ranks[player_id] - estimated_ranks[player_id]
        sum_squared_rank_diff += diff ** 2

    return 1.0 - ((6.0 * sum_squared_rank_diff) / (n * (n ** 2 - 1)))


def standardize_values(values_by_player: dict[int, float]) -> dict[int, float]:
    values = list(values_by_player.values())

    if not values:
        return {}

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    std_dev = math.sqrt(variance)

    if std_dev == 0:
        return {player_id: 0.0 for player_id in values_by_player}

    return {
        player_id: (value - mean) / std_dev
        for player_id, value in values_by_player.items()
    }


def calculate_rmse_to_true_skill(
    true_values_by_player: dict[int, float],
    estimated_values_by_player: dict[int, float],
    standardize: bool = True,
) -> float:
    common_player_ids = sorted(set(true_values_by_player.keys()) & set(estimated_values_by_player.keys()))

    if not common_player_ids:
        return 0.0

    true_subset = {pid: true_values_by_player[pid] for pid in common_player_ids}
    estimated_subset = {pid: estimated_values_by_player[pid] for pid in common_player_ids}

    if standardize:
        true_subset = standardize_values(true_subset)
        estimated_subset = standardize_values(estimated_subset)

    mse = sum(
        (true_subset[player_id] - estimated_subset[player_id]) ** 2
        for player_id in common_player_ids
    ) / len(common_player_ids)

    return math.sqrt(mse)


def extract_estimated_strengths(system_name: str, final_states: dict[int, Any]) -> dict[int, float]:
    if system_name in {"elo", "elo_margin"}:
        return {player_id: float(value) for player_id, value in final_states.items()}

    if system_name == "glicko2":
        return {
            player_id: float(state["rating"])
            for player_id, state in final_states.items()
        }

    if system_name == "trueskill":
        return {
            player_id: float(state["exposed_rating"])
            for player_id, state in final_states.items()
        }

    raise ValueError(f"Unbekanntes System für Strength-Extraktion: {system_name}")


def summarize_strength_reconstruction(
    system_name: str,
    players: list[LoadedSimulatedPlayer],
    final_states: dict[int, Any],
) -> dict[str, float]:
    true_skills = build_true_skill_lookup(players)
    estimated_strengths = extract_estimated_strengths(system_name, final_states)

    spearman = calculate_spearman_rank_correlation(true_skills, estimated_strengths)
    rmse = calculate_rmse_to_true_skill(true_skills, estimated_strengths, standardize=True)

    return {
        "spearman_rank_correlation": round(spearman, 6),
        "rmse_to_true_skill": round(rmse, 6),
    }


def enrich_simulation_results_with_strength_metrics(
    results_by_system: dict[str, dict],
    players: list[LoadedSimulatedPlayer],
) -> dict[str, dict]:
    enriched: dict[str, dict] = {}

    for system_name, result in results_by_system.items():
        strength_metrics = summarize_strength_reconstruction(
            system_name=system_name,
            players=players,
            final_states=result["final_states"],
        )

        enriched_result = dict(result)
        enriched_result["strength_metrics"] = strength_metrics
        enriched[system_name] = enriched_result

    return enriched