"""Compare models on CSV exports without loading the app or a database."""
import argparse
import json

from services.rating_model_comparison import load_export_history, compare_rating_models


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export_directory", help="Directory containing matches.csv, teams.csv, players.csv")
    args = parser.parse_args()
    history, players, provenance = load_export_history(args.export_directory)
    report = compare_rating_models(history, players)
    report["provenance"] = provenance
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
