import os

from flask import Flask, request, redirect, url_for, session, render_template

from config import config_by_name
from extensions import db
from routes import register_blueprints


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    env_name = os.environ.get("FLASK_ENV", "development").lower()
    config_class = config_by_name.get(env_name, config_by_name["development"])
    app.config.from_object(config_class)

    if env_name == "production":
        required_keys = ["SECRET_KEY", "USER_PIN", "ADMIN_PIN"]
        missing = [key for key in required_keys if not app.config.get(key)]
        if missing:
            raise RuntimeError(
                f"Fehlende Umgebungsvariablen für Production: {', '.join(missing)}"
            )

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    register_blueprints(app)

    with app.app_context():
        import models
        db.create_all()

    return app


app = create_app()

USER_PIN = app.config["USER_PIN"]
ADMIN_PIN = app.config["ADMIN_PIN"]


@app.before_request
def require_login():
    allowed_endpoints = ["login", "static"]

    if request.endpoint not in allowed_endpoints and "role" not in session:
        return redirect(url_for("login"))

    admin_endpoints = [
        "ratings.ratings_page",
        "ratings.process_ratings_for_system",
        "ratings.get_ratings_for_system",
        "evaluation.evaluate_system",
        "players.delete_player_route",
        "team_api.delete_team",
    ]

    if request.endpoint in admin_endpoints and session.get("role") != "admin":
        return redirect(url_for("matches.match_page"))


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None

    if request.method == "POST":
        pin = request.form.get("pin")

        if pin == USER_PIN:
            session["role"] = "user"
            return redirect(url_for("matches.player_selection_page"))

        if pin == ADMIN_PIN:
            session["role"] = "admin"
            return redirect(url_for("matches.player_selection_page"))

        error = "Falscher PIN."

    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


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