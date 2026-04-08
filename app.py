import os

from flask import Flask
from livereload import Server

from config import Config
from extensions import db
from routes import register_blueprints


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)

    os.makedirs(app.instance_path, exist_ok=True)

    db.init_app(app)
    register_blueprints(app)

    print("\n=== REGISTERED ROUTES ===")
    for rule in app.url_map.iter_rules():
        print(rule)
    print("=========================\n")

    with app.app_context():
        import models
        db.create_all()

    return app


app = create_app()


if __name__ == "__main__":
    server = Server(app.wsgi_app)
    server.watch("templates/*.html")
    server.watch("static/css/*.css")
    server.watch("static/js/*/*js")
    server.serve(port=8080, host="0.0.0.0", debug=False)