from sqlalchemy import or_

from extensions import db
from models.player import Player
from models.team import Team


def create_player(name):
    if not isinstance(name, str):
        return False, "Name muss ein Text sein", None

    cleaned_name = name.strip()

    if not cleaned_name:
        return False, "Name darf nicht leer sein", None

    existing_player = Player.query.filter_by(name=cleaned_name).first()
    if existing_player:
        return False, "Spieler existiert bereits", None

    player = Player(name=cleaned_name)
    db.session.add(player)
    db.session.commit()

    return True, None, player


def update_player(player_id, new_name):
    player = Player.query.get(player_id)

    if not player:
        return False, "Spieler wurde nicht gefunden.", None

    if not isinstance(new_name, str):
        return False, "Name muss ein Text sein.", None

    cleaned_name = new_name.strip()

    if not cleaned_name:
        return False, "Name darf nicht leer sein.", None

    existing_player = Player.query.filter_by(name=cleaned_name).first()
    if existing_player and existing_player.id != player.id:
        return False, "Ein anderer Spieler mit diesem Namen existiert bereits.", None

    player.name = cleaned_name
    db.session.commit()

    return True, None, player


def delete_player(player_id):
    player = Player.query.get(player_id)

    if not player:
        return False, "Spieler wurde nicht gefunden."

    is_used_in_team = Team.query.filter(
        or_(Team.player1_id == player_id, Team.player2_id == player_id)
    ).first()

    if is_used_in_team:
        return False, "Spieler kann nicht gelöscht werden, da er bereits in einem Team verwendet wird."

    db.session.delete(player)
    db.session.commit()

    return True, None


def get_all_players():
    return Player.query.order_by(Player.name.asc()).all()