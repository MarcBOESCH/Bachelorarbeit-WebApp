from routes.main_routes import main_bp
from routes.player_routes import player_bp
from routes.match_routes import match_bp
from routes.statistic_routes import stats_bp


def register_blueprints(app):
    app.register_blueprint(main_bp)
    app.register_blueprint(player_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(stats_bp)