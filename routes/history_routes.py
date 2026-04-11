from flask import Blueprint, render_template


history_page_bp = Blueprint("history", __name__)


@history_page_bp.route("/history")
def history_page():
    return render_template("history.html")