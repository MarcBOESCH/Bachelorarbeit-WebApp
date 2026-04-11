from flask import Blueprint, jsonify, render_template, request, session

from services.player_service import (
    create_player,
    delete_player,
    get_all_players,
    update_player,
)


players_page_bp = Blueprint("players", __name__)


def serialize_player(player):
    return {
        "id": player.id,
        "name": player.name,
    }


@players_page_bp.route("/players")
def players_page():
    return render_template("players.html", players=get_all_players())


@players_page_bp.route("/api/players", methods=["GET"])
def get_players_route():
    players = get_all_players()
    return jsonify([serialize_player(player) for player in players]), 200


@players_page_bp.route("/api/players", methods=["POST"])
def create_player_route():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    name = data.get("name")

    success, error, player = create_player(name)

    if not success:
        return jsonify({"error": error}), 400

    return jsonify({
        "message": "Spieler erfolgreich erstellt.",
        "player": serialize_player(player),
    }), 201


@players_page_bp.route("/api/players/<int:player_id>", methods=["PUT"])
def update_player_route(player_id):
    data = request.get_json()

    if not data:
        return jsonify({"error": "Keine JSON-Daten erhalten."}), 400

    new_name = data.get("name")

    success, error, player = update_player(player_id, new_name)

    if not success:
        return jsonify({"error": error}), 400

    return jsonify({
        "message": "Spieler erfolgreich aktualisiert.",
        "player": serialize_player(player),
    }), 200


@players_page_bp.route("/api/players/<int:player_id>", methods=["DELETE"])
def delete_player_route(player_id):
    if session.get("role") != "admin":
        return jsonify({"error": "Nur Admins dürfen Spieler löschen."}), 403

    success, error = delete_player(player_id)

    if not success:
        return jsonify({"error": error}), 400

    return jsonify({
        "message": "Spieler erfolgreich gelöscht.",
    }), 200