from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.simulation_io import (
    load_simulation_bundle_from_json,
    load_simulation_matches_from_csv,
    load_simulation_players_from_csv,
)
from services.simulation_metrics_service import enrich_simulation_results_with_strength_metrics
from services.simulation_pipeline_service import evaluate_all_systems_on_simulation


def run_simulation_evaluation_from_bundle_json(bundle_json_path: str | Path) -> dict[str, Any]:
    bundle = load_simulation_bundle_from_json(bundle_json_path)

    raw_results = evaluate_all_systems_on_simulation(
        matches=bundle["matches"],
        players=bundle["players"],
    )

    enriched_results = enrich_simulation_results_with_strength_metrics(
        results_by_system=raw_results,
        players=bundle["players"],
    )

    return {
        "scenario": bundle["scenario"],
        "num_players": len(bundle["players"]),
        "num_matches": len(bundle["matches"]),
        "results": enriched_results,
    }


def run_simulation_evaluation_from_csv(
    players_csv_path: str | Path,
    matches_csv_path: str | Path,
    scenario_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    players = load_simulation_players_from_csv(players_csv_path)
    matches = load_simulation_matches_from_csv(matches_csv_path)

    raw_results = evaluate_all_systems_on_simulation(
        matches=matches,
        players=players,
    )

    enriched_results = enrich_simulation_results_with_strength_metrics(
        results_by_system=raw_results,
        players=players,
    )

    return {
        "scenario": scenario_metadata or {},
        "num_players": len(players),
        "num_matches": len(matches),
        "results": enriched_results,
    }


def export_simulation_evaluation_to_json(
    output_path: str | Path,
    evaluation_result: dict[str, Any],
) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as f:
        json.dump(evaluation_result, f, ensure_ascii=False, indent=2)

    return output_path


def run_and_export_simulation_evaluation_from_bundle_json(
    bundle_json_path: str | Path,
    output_path: str | Path,
) -> dict[str, Any]:
    evaluation_result = run_simulation_evaluation_from_bundle_json(bundle_json_path)
    export_simulation_evaluation_to_json(output_path, evaluation_result)
    return evaluation_result


def run_and_export_simulation_evaluation_from_csv(
    players_csv_path: str | Path,
    matches_csv_path: str | Path,
    output_path: str | Path,
    scenario_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    evaluation_result = run_simulation_evaluation_from_csv(
        players_csv_path=players_csv_path,
        matches_csv_path=matches_csv_path,
        scenario_metadata=scenario_metadata,
    )
    export_simulation_evaluation_to_json(output_path, evaluation_result)
    return evaluation_result