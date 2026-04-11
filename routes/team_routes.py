from flask import Blueprint, jsonify, request, session
from sqlalchemy import and_, func, or_

from extensions import db
from models.match import Match
from models.player import Player
from models.team import Team


team_api_bp = Blueprint("team_api", __name__)


def serialize_team(team):
    return {
        "id": team.id,
        "name": team.name,
        "player1_id": team.player1_id,
        "player2_id": team.player2_id,
        "player_names": f"{team.player1.name} & {team.player2.name}",
    }


def get_existing_team_with_same_pair(player1_id, player2_id):
    return Team.query.filter(
        or_(
            and_(Team.player1_id == player1_id, Team.player2_id == player2_id),
            and_(Team.player1_id == player2_id, Team.player2_id == player1_id),
        )
    ).first()


@team_api_bp.route("/api/teams", methods=["GET"])
def get_teams_route():
    teams = Team.query.all()
    return jsonify([serialize_team(team) for team in teams]), 200


@team_api_bp.route("/api/teams", methods=["POST"])
def create_team_route():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    name = data.get("name", "").strip()
    player1_id = data.get("player1_id")
    player2_id = data.get("player2_id")

    if not name or not player1_id or not player2_id or player1_id == player2_id:
        return jsonify({"error": "Ungültige Team-Daten."}), 400

    player1 = Player.query.get(player1_id)
    player2 = Player.query.get(player2_id)

    if not player1 or not player2:
        return jsonify({"error": "Mindestens ein Spieler existiert nicht."}), 400

    existing_name = Team.query.filter(func.lower(Team.name) == name.lower()).first()
    if existing_name:
        return jsonify({"error": "Dieser Teamname existiert bereits."}), 400

    existing_same_pair = get_existing_team_with_same_pair(player1_id, player2_id)
    if existing_same_pair:
        return jsonify({"error": "Dieses Team existiert bereits."}), 400

    new_team = Team(name=name, player1_id=player1_id, player2_id=player2_id)
    db.session.add(new_team)
    db.session.commit()

    return jsonify({
        "message": "Team erstellt.",
        "id": new_team.id,
    }), 201


@team_api_bp.route("/api/teams/<int:team_id>", methods=["PUT"])
def update_team_route(team_id):
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    new_name = data.get("name", "").strip()
    if not new_name:
        return jsonify({"error": "Der Teamname darf nicht leer sein."}), 400

    team = Team.query.get(team_id)
    if not team:
        return jsonify({"error": "Team wurde nicht gefunden."}), 404

    existing_name = Team.query.filter(func.lower(Team.name) == new_name.lower()).first()
    if existing_name and existing_name.id != team.id:
        return jsonify({"error": "Dieser Teamname existiert bereits."}), 400

    team.name = new_name
    db.session.commit()

    return jsonify({
        "message": "Team erfolgreich aktualisiert.",
        "team": {
            "id": team.id,
            "name": team.name,
        },
    }), 200


@team_api_bp.route("/api/teams/<int:team_id>", methods=["DELETE"])
def delete_team_route(team_id):
    if session.get("role") != "admin":
        return jsonify({"error": "Nur Admins dürfen Teams löschen."}), 403

    team = Team.query.get(team_id)
    if not team:
        return jsonify({"error": "Team wurde nicht gefunden."}), 404

    is_used_in_match = Match.query.filter(
        or_(Match.team_a_id == team_id, Match.team_b_id == team_id)
    ).first()

    if is_used_in_match:
        return jsonify({
            "error": "Team kann nicht gelöscht werden, da es bereits in Matches verwendet wurde."
        }), 400

    db.session.delete(team)
    db.session.commit()

    return jsonify({
        "message": "Team erfolgreich gelöscht."
    }), 200