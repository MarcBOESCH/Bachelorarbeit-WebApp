from __future__ import annotations

import csv
from pathlib import Path
from typing import Any


def flatten_simulation_evaluation_result(evaluation_result: dict[str, Any]) -> list[dict[str, Any]]:
    scenario = evaluation_result.get("scenario", {})
    scenario_name = scenario.get("name", "unknown")
    num_players = evaluation_result.get("num_players", 0)
    num_matches = evaluation_result.get("num_matches", 0)

    rows: list[dict[str, Any]] = []

    for system_name, result in evaluation_result.get("results", {}).items():
        strength_metrics = result.get("strength_metrics", {})

        rows.append({
            "scenario_name": scenario_name,
            "num_players": num_players,
            "num_matches": num_matches,
            "system_name": system_name,
            "accuracy": result.get("accuracy"),
            "brier_score": result.get("brier_score"),
            "log_loss": result.get("log_loss"),
            "spearman_rank_correlation": strength_metrics.get("spearman_rank_correlation"),
            "rmse_to_true_skill": strength_metrics.get("rmse_to_true_skill"),
            "total_predictions": result.get("total_predictions"),
            "correct_predictions": result.get("correct_predictions"),
        })

    return rows


def export_simulation_evaluation_table_to_csv(
    output_path: str | Path,
    evaluation_result: dict[str, Any],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = flatten_simulation_evaluation_result(evaluation_result)

    fieldnames = [
        "scenario_name",
        "num_players",
        "num_matches",
        "system_name",
        "accuracy",
        "brier_score",
        "log_loss",
        "spearman_rank_correlation",
        "rmse_to_true_skill",
        "total_predictions",
        "correct_predictions",
    ]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return output_path


def export_multiple_simulation_evaluations_to_csv(
    output_path: str | Path,
    evaluation_results: list[dict[str, Any]],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    all_rows: list[dict[str, Any]] = []
    for evaluation_result in evaluation_results:
        all_rows.extend(flatten_simulation_evaluation_result(evaluation_result))

    fieldnames = [
        "scenario_name",
        "num_players",
        "num_matches",
        "system_name",
        "accuracy",
        "brier_score",
        "log_loss",
        "spearman_rank_correlation",
        "rmse_to_true_skill",
        "total_predictions",
        "correct_predictions",
    ]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)

    return output_path


def _group_rows_by_scenario(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        scenario_name = row["scenario_name"]
        grouped.setdefault(scenario_name, []).append(row)

    return grouped


def _mark_best_models_for_group(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return rows

    def valid_max(metric_name: str):
        values = [row[metric_name] for row in rows if row[metric_name] is not None]
        return max(values) if values else None

    def valid_min(metric_name: str):
        values = [row[metric_name] for row in rows if row[metric_name] is not None]
        return min(values) if values else None

    best_accuracy = valid_max("accuracy")
    best_brier = valid_min("brier_score")
    best_log_loss = valid_min("log_loss")
    best_spearman = valid_max("spearman_rank_correlation")
    best_rmse = valid_min("rmse_to_true_skill")

    marked_rows: list[dict[str, Any]] = []

    for row in rows:
        marked_row = dict(row)
        marked_row["best_accuracy"] = row["accuracy"] == best_accuracy if best_accuracy is not None else False
        marked_row["best_brier_score"] = row["brier_score"] == best_brier if best_brier is not None else False
        marked_row["best_log_loss"] = row["log_loss"] == best_log_loss if best_log_loss is not None else False
        marked_row["best_spearman_rank_correlation"] = (
            row["spearman_rank_correlation"] == best_spearman if best_spearman is not None else False
        )
        marked_row["best_rmse_to_true_skill"] = (
            row["rmse_to_true_skill"] == best_rmse if best_rmse is not None else False
        )
        marked_rows.append(marked_row)

    return marked_rows


def build_ranked_simulation_comparison_rows(
    evaluation_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []

    for evaluation_result in evaluation_results:
        all_rows.extend(flatten_simulation_evaluation_result(evaluation_result))

    grouped = _group_rows_by_scenario(all_rows)

    ranked_rows: list[dict[str, Any]] = []
    for scenario_name in sorted(grouped.keys()):
        ranked_rows.extend(_mark_best_models_for_group(grouped[scenario_name]))

    return ranked_rows


def export_ranked_simulation_comparisons_to_csv(
    output_path: str | Path,
    evaluation_results: list[dict[str, Any]],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = build_ranked_simulation_comparison_rows(evaluation_results)

    fieldnames = [
        "scenario_name",
        "num_players",
        "num_matches",
        "system_name",
        "accuracy",
        "brier_score",
        "log_loss",
        "spearman_rank_correlation",
        "rmse_to_true_skill",
        "total_predictions",
        "correct_predictions",
        "best_accuracy",
        "best_brier_score",
        "best_log_loss",
        "best_spearman_rank_correlation",
        "best_rmse_to_true_skill",
    ]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return output_path


def _pick_best_system(rows: list[dict[str, Any]], metric_name: str, higher_is_better: bool) -> str | None:
    valid_rows = [row for row in rows if row.get(metric_name) is not None]

    if not valid_rows:
        return None

    if higher_is_better:
        best_row = max(valid_rows, key=lambda row: row[metric_name])
    else:
        best_row = min(valid_rows, key=lambda row: row[metric_name])

    return best_row["system_name"]


def build_scenario_winner_summary_rows(
    evaluation_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []

    for evaluation_result in evaluation_results:
        all_rows.extend(flatten_simulation_evaluation_result(evaluation_result))

    grouped = _group_rows_by_scenario(all_rows)
    summary_rows: list[dict[str, Any]] = []

    for scenario_name in sorted(grouped.keys()):
        rows = grouped[scenario_name]

        if not rows:
            continue

        first_row = rows[0]

        summary_rows.append({
            "scenario_name": scenario_name,
            "num_players": first_row["num_players"],
            "num_matches": first_row["num_matches"],
            "best_accuracy_system": _pick_best_system(rows, "accuracy", higher_is_better=True),
            "best_brier_score_system": _pick_best_system(rows, "brier_score", higher_is_better=False),
            "best_log_loss_system": _pick_best_system(rows, "log_loss", higher_is_better=False),
            "best_spearman_system": _pick_best_system(rows, "spearman_rank_correlation", higher_is_better=True),
            "best_rmse_system": _pick_best_system(rows, "rmse_to_true_skill", higher_is_better=False),
        })

    return summary_rows


def export_scenario_winner_summary_to_csv(
    output_path: str | Path,
    evaluation_results: list[dict[str, Any]],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    rows = build_scenario_winner_summary_rows(evaluation_results)

    fieldnames = [
        "scenario_name",
        "num_players",
        "num_matches",
        "best_accuracy_system",
        "best_brier_score_system",
        "best_log_loss_system",
        "best_spearman_system",
        "best_rmse_system",
    ]

    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return output_path