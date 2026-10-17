"""Local-only, reversible placement preview data for the statistics page."""
import os
from datetime import datetime, timedelta

import click
from flask import current_app
from sqlalchemy.engine import make_url

from extensions import db
from models.match import Match
from models.player import Player
from models.team import Team
from services.rating_service import rebuild_glicko2_ratings


DEMO_PLAYERS = (
    "Demo Anna (Placement)",
    "Demo Ben (Placement)",
    "Demo Carla (Placement)",
    "Demo David (Placement)",
)
DEMO_TEAMS = ("Demo Nord (Placement)", "Demo Sued (Placement)")

# Ten normal victories (one of them in 420 mode), and a true 420-point win
# that intentionally counts only in general statistics, not in the rating.
DEMO_SCORES = (
    (1020, 780, False),
    (850, 1010, False),
    (1000, 830, True),
    (920, 1005, False),
    (1080, 910, False),
    (760, 1000, False),
    (1005, 875, False),
    (880, 1020, False),
    (1030, 940, False),
    (960, 1000, False),
    (420, 205, True),
)


def require_local_demo_db():
    """Refuse all remote databases and non-demo local databases."""
    url = make_url(current_app.config["SQLALCHEMY_DATABASE_URI"])
    if current_app.config.get("TESTING") and url.get_backend_name() == "sqlite" \
            and url.database in (None, ":memory:"):
        return
    if (os.environ.get("FLASK_ENV", "development").lower() != "development"
            or url.get_backend_name() != "postgresql"
            or url.host not in {"localhost", "127.0.0.1", "::1"}
            or url.database != "jasstistics_dev"):
        raise click.ClickException(
            "Nur fuer die lokale PostgreSQL-Testdatenbank "
            "'localhost/jasstistics_dev' im Development-Modus erlaubt."
        )


def seed_placement_demo():
    require_local_demo_db()
    if Player.query.filter(Player.name.in_(DEMO_PLAYERS)).first() or \
            Team.query.filter(Team.name.in_(DEMO_TEAMS)).first():
        raise click.ClickException(
            "Demo-Spieler oder -Teams existieren bereits. "
            "Vor einem erneuten Seed erst 'clear-placement-demo' ausfuehren."
        )

    try:
        players = [Player(name=name) for name in DEMO_PLAYERS]
        db.session.add_all(players)
        db.session.flush()
        teams = [
            Team(name=DEMO_TEAMS[0], player1_id=players[0].id, player2_id=players[1].id),
            Team(name=DEMO_TEAMS[1], player1_id=players[2].id, player2_id=players[3].id),
        ]
        db.session.add_all(teams)
        db.session.flush()

        start = datetime.utcnow() - timedelta(minutes=len(DEMO_SCORES) + 1)
        for index, (score_a, score_b, mode) in enumerate(DEMO_SCORES):
            db.session.add(Match(
                played_at=start + timedelta(minutes=index),
                team_a_id=teams[0].id, team_b_id=teams[1].id,
                score_team_a=score_a, score_team_b=score_b,
                point_diff=abs(score_a - score_b),
                winner_team="A" if score_a > score_b else "B",
                four_twenty_mode=mode,
            ))
        db.session.flush()
        rebuild_glicko2_ratings()  # commits all new rows and the recalculated ratings atomically
    except Exception:
        db.session.rollback()
        raise
    return len(DEMO_SCORES)


def clear_placement_demo():
    require_local_demo_db()
    players = Player.query.filter(Player.name.in_(DEMO_PLAYERS)).all()
    teams = Team.query.filter(Team.name.in_(DEMO_TEAMS)).all()
    if not players and not teams:
        return 0
    if len(players) != len(DEMO_PLAYERS) or len(teams) != len(DEMO_TEAMS):
        raise click.ClickException("Unvollstaendige Demo-Daten: kein automatisches Loeschen.")

    by_name = {p.name: p for p in players}
    team_by_name = {t.name: t for t in teams}
    north = team_by_name[DEMO_TEAMS[0]]
    south = team_by_name[DEMO_TEAMS[1]]
    if (set((north.player1_id, north.player2_id)) !=
            {by_name[DEMO_PLAYERS[0]].id, by_name[DEMO_PLAYERS[1]].id} or
            set((south.player1_id, south.player2_id)) !=
            {by_name[DEMO_PLAYERS[2]].id, by_name[DEMO_PLAYERS[3]].id}):
        raise click.ClickException("Demo-Teamzusammensetzung wurde veraendert; Abbruch.")

    team_ids = [t.id for t in teams]
    player_ids = [p.id for p in players]
    used_elsewhere = Team.query.filter(
        ~Team.id.in_(team_ids),
        (Team.player1_id.in_(player_ids)) | (Team.player2_id.in_(player_ids)),
    ).first()
    if used_elsewhere:
        raise click.ClickException(
            "Demo-Spieler sind in weiteren Teams eingetragen; "
            "die Bereinigung wurde aus Sicherheitsgruenden abgebrochen."
        )
    matches = Match.query.filter(
        (Match.team_a_id.in_(team_ids)) | (Match.team_b_id.in_(team_ids))
    ).all()
    if any({m.team_a_id, m.team_b_id} != set(team_ids) for m in matches):
        raise click.ClickException(
            "Demo-Teams wurden gegen andere Teams verwendet; "
            "die Bereinigung wurde aus Sicherheitsgruenden abgebrochen."
        )
    try:
        for match in matches:
            db.session.delete(match)
        db.session.flush()
        for team in teams:
            db.session.delete(team)
        db.session.flush()
        for player in players:
            db.session.delete(player)
        db.session.flush()
        rebuild_glicko2_ratings()  # atomically saves cleanup and restores the actual ratings
    except Exception:
        db.session.rollback()
        raise
    return len(matches)


def register_demo_commands(app):
    @app.cli.command("seed-placement-demo")
    def seed_command():
        """Create four demo players and eleven matches in a LOCAL DB only."""
        matches = seed_placement_demo()
        click.echo(
            f"{matches} Demo-Matches gespeichert (10 gewertet, 1 x 420-Sieg). "
            "Vier Demo-Spieler haben Placement 10/10 abgeschlossen."
        )

    @app.cli.command("clear-placement-demo")
    def clear_command():
        """Remove only recognizable demo teams, players and matches."""
        matches = clear_placement_demo()
        click.echo(f"{matches} Demo-Matches geloescht; Glicko-2 neu berechnet.")
