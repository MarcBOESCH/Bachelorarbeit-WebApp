from routes.match_routes import match_page_bp
from routes.player_routes import players_page_bp
from routes.history_routes import history_page_bp
from routes.statistic_routes import statistics_page_bp, statistics_api_bp
from routes.evaluation_routes import evaluation_bp
from routes.rating_routes import rating_page_bp
from routes.team_routes import team_api_bp


def register_blueprints(app):
    app.register_blueprint(match_page_bp)
    app.register_blueprint(players_page_bp)
    app.register_blueprint(history_page_bp)
    app.register_blueprint(statistics_page_bp)
    app.register_blueprint(statistics_api_bp)
    app.register_blueprint(rating_page_bp)
    app.register_blueprint(evaluation_bp)
    app.register_blueprint(team_api_bp)