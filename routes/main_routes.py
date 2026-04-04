from flask import Blueprint, redirect, url_for

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    """
    Startseite der App.
    Leitet direkt in den Match-Flow weiter.
    """
    return redirect(url_for("matches.player_selection_page"))