from routes.evaluation_routes import evaluation_bp
from routes.main_routes import main_bp
from routes.player_routes import players_page_bp
from routes.match_routes import match_page_bp
from routes.statistic_routes import stats_bp
from routes.rating_routes import rating_bp


def register_blueprints(app):
    app.register_blueprint(main_bp)
    app.register_blueprint(players_page_bp)
    app.register_blueprint(match_page_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(rating_bp)
    app.register_blueprint(evaluation_bp)