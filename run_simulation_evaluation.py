from __future__ import annotations

from pathlib import Path

from services.simulation_service import export_simulation_bundle
from services.simulation_workflow_service import (
    run_and_export_simulation_evaluation_from_bundle_json,
)


def main() -> None:
    scenario_name = "standard"
    seed = 42

    output_dir = Path("simulation_output")
    output_dir.mkdir(parents=True, exist_ok=True)

    exported_paths = export_simulation_bundle(
        output_dir=output_dir,
        scenario_name=scenario_name,
        seed=seed,
    )

    bundle_json_path = exported_paths["bundle_json"]
    evaluation_json_path = output_dir / f"{scenario_name}_evaluation.json"

    result = run_and_export_simulation_evaluation_from_bundle_json(
        bundle_json_path=bundle_json_path,
        output_path=evaluation_json_path,
    )

    print(f"Szenario: {scenario_name}")
    print(f"Spieler: {result['num_players']}")
    print(f"Matches: {result['num_matches']}")
    print()

    for system_name, system_result in result["results"].items():
        strength_metrics = system_result.get("strength_metrics", {})

        print(f"=== {system_name.upper()} ===")
        print(f"Accuracy: {system_result['accuracy']}")
        print(f"Brier Score: {system_result['brier_score']}")
        print(f"Log Loss: {system_result['log_loss']}")
        print(
            "Spearman: "
            f"{strength_metrics.get('spearman_rank_correlation', '-')}"
        )
        print(
            "RMSE to True Skill: "
            f"{strength_metrics.get('rmse_to_true_skill', '-')}"
        )
        print()

    print("Exportierte Dateien:")
    for key, path in exported_paths.items():
        print(f"- {key}: {path}")

    print(f"- evaluation_json: {evaluation_json_path}")


if __name__ == "__main__":
    main()