import os

from flask import Flask, request, redirect, url_for, session, render_template

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

# ==========================================
# LOGIN & SICHERHEIT (PIN-SYSTEM)
# ==========================================
USER_PIN = os.environ.get("USER_PIN", "1234")
ADMIN_PIN = os.environ.get("ADMIN_PIN", "5678")


@app.before_request
def require_login():
    # Diese Routen dürfen ohne PIN geladen werden
    allowed_endpoints = ['login', 'static']

    # 1. Prüfen, ob überhaupt jemand eingeloggt ist
    if request.endpoint not in allowed_endpoints and 'role' not in session:
        return redirect(url_for('login'))

    # 2. Prüfen, ob ein normaler User auf eine Admin-Seite will
    admin_endpoints = ['ratings.ratings_page', 'ratings.process_ratings_for_system', 'ratings.get_ratings_for_system',
                       'evaluation.evaluate_system']
    if request.endpoint in admin_endpoints and session.get('role') != 'admin':
        return redirect(url_for('matches.match_page'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        pin = request.form.get('pin')

        if pin == USER_PIN:
            session['role'] = 'user'
            return redirect(url_for('matches.player_selection_page'))

        elif pin == ADMIN_PIN:
            session['role'] = 'admin'
            return redirect(url_for('matches.player_selection_page'))

        else:
            error = "Falscher PIN."

    return render_template('login.html', error=error)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


if __name__ == "__main__":
    if __name__ == "__main__":
        # Nur lokal mit Livereload starten
        from livereload import Server

        server = Server(app.wsgi_app)
        server.watch("templates/*.html")
        server.watch("static/css/*.css")
        server.watch("static/js/*/*.js")
        server.serve(port=8080, host="0.0.0.0", debug=True)