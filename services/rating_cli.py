"""Explicit, repeatable data migration without changing the schema."""
import click
from services.rating_service import rebuild_glicko2_ratings


def register_rating_commands(app):
    @app.cli.command("compare-glicko2")
    def compare_glicko2():
        """Print old/new replays as JSON without writing any database rows."""
        import json
        from sqlalchemy.orm import joinedload
        from extensions import db
        from models.match import Match
        from services.glicko2_comparison import compare_glicko2_history

        # One SELECT for matches and both teams; never autoflush pending rows.
        with db.session.no_autoflush:
            matches = Match.query.options(
                joinedload(Match.team_a), joinedload(Match.team_b)).all()
            report = compare_glicko2_history(
                matches, placement_matches=app.config["RATING_PLACEMENT_MATCHES"])
        click.echo(json.dumps(report, indent=2, allow_nan=False))

    @app.cli.command("rebuild-glicko2")
    @click.option("--dry-run", is_flag=True, help="Calculate and validate, then roll back.")
    def rebuild_glicko2(dry_run):
        """Rebuild Glicko-2 from all regular matches; preserve Elo."""
        results = rebuild_glicko2_ratings(dry_run=dry_run)
        click.echo(f"Glicko-2: {len(results)} Matches; "
                   + ("Probelauf zurückgerollt." if dry_run else "atomar gespeichert."))

