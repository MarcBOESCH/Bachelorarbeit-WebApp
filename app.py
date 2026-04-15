import os
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, request, redirect, url_for, session, render_template, send_from_directory

from config import config_by_name
from extensions import db, migrate
from routes import register_blueprints


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    env_name = os.environ.get("FLASK_ENV", "development").lower()
    config_class = config_by_name.get(env_name, config_by_name["development"])
    app.config.from_object(config_class)

    if env_name == "production":
        required_keys = ["SECRET_KEY", "USER_PIN", "ADMIN_PIN"]
        missing = [key for key in required_keys if not app.config.get(key)]

        if not app.config.get("SQLALCHEMY_DATABASE_URI"):
            missing.append("NEON_DATABASE_URL or DATABASE_URL")

        if missing:
            raise RuntimeError(
                f"Fehlende Umgebungsvariablen für Production: {', '.join(missing)}"
            )

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    register_blueprints(app)

    return app


app = create_app()

USER_PIN = app.config["USER_PIN"]
ADMIN_PIN = app.config["ADMIN_PIN"]


@app.before_request
def require_login():
    allowed_endpoints = ["login", "static", "apple_touch_icon"]

    if request.endpoint not in allowed_endpoints and "role" not in session:
        return redirect(url_for("login"))

    admin_endpoints = [
        "ratings.ratings_page",
        "ratings.process_ratings_for_system",
        "ratings.get_ratings_for_system",
        "evaluation.evaluate_system",
        "players.delete_player_route",
        "team_api.delete_team_route",
    ]

    if request.endpoint in admin_endpoints and session.get("role") != "admin":
        return redirect(url_for("matches.match_page"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None

    if request.method == "POST":
        pin = request.form.get("pin")

        if pin == USER_PIN:
            session.permanent = True
            session["role"] = "user"
            return redirect(url_for("matches.player_selection_page"))

        if pin == ADMIN_PIN:
            session.permanent = True
            session["role"] = "admin"
            return redirect(url_for("matches.player_selection_page"))

        error = "Falscher PIN."

    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route('/apple-touch-icon.png')
def apple_touch_icon():
    return send_from_directory('static/icons', 'apple-touch-icon.png')


@app.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_server_error(error):
    return render_template("500.html"), 500


if __name__ == "__main__":
    if app.config.get("ENABLE_LIVERELOAD"):
        from livereload import Server

        server = Server(app.wsgi_app)
        server.watch("templates/*.html")
        server.watch("static/css/*.css")
        server.watch("static/js/*/*.js")
        server.serve(port=8080, host="0.0.0.0", debug=True)
    else:
        app.run(host="0.0.0.0", port=8080)