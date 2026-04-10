from flask import Blueprint, jsonify, request, session
from sqlalchemy import func

from extensions import db
from models.player import Player
from models.team import Team
from models.match import Match

team_api_bp = Blueprint("team_api", __name__)


@team_api_bp.route("/api/teams", methods=["GET"])
def get_teams():
    teams = Team.query.all()

    return jsonify([
        {
            "id": t.id,
            "name": t.name,
            "player1_id": t.player1_id,
            "player2_id": t.player2_id,
            "player_names": f"{t.player1.name} & {t.player2.name}",
        }
        for t in teams
    ]), 200


@team_api_bp.route("/api/teams", methods=["POST"])
def create_team():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    name = data.get("name", "").strip()
    p1_id = data.get("player1_id")
    p2_id = data.get("player2_id")

    if not name or not p1_id or not p2_id or p1_id == p2_id:
        return jsonify({"error": "Ungültige Team-Daten."}), 400

    player1 = Player.query.get(p1_id)
    player2 = Player.query.get(p2_id)

    if not player1 or not player2:
        return jsonify({"error": "Mindestens ein Spieler existiert nicht."}), 400

    existing_name = Team.query.filter(func.lower(Team.name) == name.lower()).first()
    if existing_name:
        return jsonify({"error": "Dieser Teamname existiert bereits."}), 400

    existing_same_pair = Team.query.filter(
        db.or_(
            db.and_(Team.player1_id == p1_id, Team.player2_id == p2_id),
            db.and_(Team.player1_id == p2_id, Team.player2_id == p1_id),
        )
    ).first()

    if existing_same_pair:
        return jsonify({"error": "Dieses Team existiert bereits."}), 400

    new_team = Team(name=name, player1_id=p1_id, player2_id=p2_id)
    db.session.add(new_team)
    db.session.commit()

    return jsonify({
        "message": "Team erstellt",
        "id": new_team.id
    }), 201

@team_api_bp.route("/api/teams/<int:team_id>", methods=["DELETE"])
def delete_team(team_id):
    if session.get("role") != "admin":
        return jsonify({"error": "Nur Admins dürfen Teams löschen."}), 403

    team = Team.query.get(team_id)

    if not team:
        return jsonify({"error": "Team wurde nicht gefunden."}), 404

    is_used_in_match = Match.query.filter(
        db.or_(Match.team_a_id == team_id, Match.team_b_id == team_id)
    ).first()

    if is_used_in_match:
        return jsonify({"error": "Team kann nicht gelöscht werden, da es bereits in Matches verwendet wurde."}), 400

    db.session.delete(team)
    db.session.commit()

    return jsonify({"message": "Team erfolgreich gelöscht."}), 200