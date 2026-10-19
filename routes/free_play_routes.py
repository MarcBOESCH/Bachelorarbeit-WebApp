"""Non-rated modes: never write to player, team, match, or rating tables."""
from flask import Blueprint, abort, redirect, render_template, request, session, url_for

from services.game_service import start_free_game


free_play_bp = Blueprint("free_play", __name__)


def setup_free_game(mode, player_count):
    if "role" not in session:
        # POST must be protected as well as GET (handled by the app's guard).
        abort(401)

    if request.method == "POST":
        def cleaned(field, default):
            value = (request.form.get(field) or "").strip()
            if len(value) > 40:
                abort(400, "Team- und Spielernamen dürfen höchstens 40 Zeichen haben.")
            return value or default

        names_a = [
            cleaned(f"player_a_{i}", f"Spieler {i}") for i in range(1, player_count + 1)
        ]
        names_b = [
            cleaned(f"player_b_{i}", f"Spieler {i}") for i in range(1, player_count + 1)
        ]
        start_free_game(
            mode=mode,
            team_name_a=cleaned("team_a_name", "Team A"),
            team_name_b=cleaned("team_b_name", "Team B"),
            player_names_a=names_a,
            player_names_b=names_b,
            four_twenty_mode=request.form.get("four_twenty_mode") == "on",
        )
        return redirect(url_for("matches.match_page"))

    return render_template("free_play_setup.html", mode=mode, player_count=player_count)


@free_play_bp.route("/quickplay", methods=["GET", "POST"])
def quickplay_page():
    return setup_free_game("quickplay", 2)


@free_play_bp.route("/six-player", methods=["GET", "POST"])
def six_player_page():
    return setup_free_game("six_player", 3)
