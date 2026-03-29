from routes.main_routes import main_bp
from routes.player_routes import player_bp


def register_blueprints(app):
    app.register_blueprint(main_bp)
    app.register_blueprint(player_bp)