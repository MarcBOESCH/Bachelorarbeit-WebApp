"""Explicit, repeatable data migration without changing the schema."""
import click
from services.rating_service import rebuild_glicko2_ratings


def register_rating_commands(app):
    @app.cli.command("rebuild-glicko2")
    @click.option("--dry-run", is_flag=True, help="Calculate and validate, then roll back.")
    def rebuild_glicko2(dry_run):
        """Rebuild Glicko-2 from all regular matches; preserve Elo."""
        results = rebuild_glicko2_ratings(dry_run=dry_run)
        click.echo(f"Glicko-2: {len(results)} Matches; "
                   + ("Probelauf zurückgerollt." if dry_run else "atomar gespeichert."))
