from flask import Blueprint, jsonify, request
from extensions import db
from models.team import Team
from models.player import Player

team_api_bp = Blueprint("team_api", __name__)

@team_api_bp.route("/api/teams", methods=["GET"])
def get_teams():
    teams = Team.query.all()
    return jsonify([{
        "id": t.id,
        "name": t.name,
        "player1_id": t.player1_id,
        "player2_id": t.player2_id,
        "player_names": f"{t.player1.name} & {t.player2.name}"
    } for t in teams]), 200

@team_api_bp.route("/api/teams", methods=["POST"])
def create_team():
    data = request.get_json()
    name = data.get("name", "").strip()
    p1_id = data.get("player1_id")
    p2_id = data.get("player2_id")

    if not name or not p1_id or not p2_id or p1_id == p2_id:
        return jsonify({"error": "Ungültige Team-Daten."}), 400

    if Team.query.filter_by(name=name).first():
        return jsonify({"error": "Dieser Teamname existiert bereits."}), 400

    new_team = Team(name=name, player1_id=p1_id, player2_id=p2_id)
    db.session.add(new_team)
    db.session.commit()

    return jsonify({"message": "Team erstellt", "id": new_team.id}), 201