from __future__ import annotations

from pathlib import Path

from services.simulation_service import export_simulation_bundle, list_simulation_scenarios
from services.simulation_workflow_service import run_and_export_simulation_evaluation_from_bundle_json
from services.simulation_reporting_service import (
    export_multiple_simulation_evaluations_to_csv,
    export_ranked_simulation_comparisons_to_csv,
    export_scenario_winner_summary_to_csv,
)


def main() -> None:
    seed = 123
    scenario_names = list_simulation_scenarios()

    output_dir = Path("simulation_output")
    output_dir.mkdir(parents=True, exist_ok=True)

    evaluation_results = []

    for scenario_name in scenario_names:
        exported_paths = export_simulation_bundle(
            output_dir=output_dir,
            scenario_name=scenario_name,
            seed=seed,
        )

        bundle_json_path = exported_paths["bundle_json"]
        evaluation_json_path = output_dir / f"{scenario_name}_evaluation.json"

        evaluation_result = run_and_export_simulation_evaluation_from_bundle_json(
            bundle_json_path=bundle_json_path,
            output_path=evaluation_json_path,
        )

        evaluation_results.append(evaluation_result)

    comparison_csv_path = output_dir / "simulation_comparison.csv"
    ranked_comparison_csv_path = output_dir / "simulation_comparison_ranked.csv"
    winner_summary_csv_path = output_dir / "simulation_scenario_winners.csv"

    export_multiple_simulation_evaluations_to_csv(
        output_path=comparison_csv_path,
        evaluation_results=evaluation_results,
    )

    export_ranked_simulation_comparisons_to_csv(
        output_path=ranked_comparison_csv_path,
        evaluation_results=evaluation_results,
    )

    export_scenario_winner_summary_to_csv(
        output_path=winner_summary_csv_path,
        evaluation_results=evaluation_results,
    )

    print("Vergleichsexporte erstellt:")
    print(f"- {comparison_csv_path}")
    print(f"- {ranked_comparison_csv_path}")
    print(f"- {winner_summary_csv_path}")


if __name__ == "__main__":
    main()