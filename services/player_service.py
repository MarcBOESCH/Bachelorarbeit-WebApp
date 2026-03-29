from models.player import Player
from extensions import db


def create_player(name):
    """
    Erstellt einen neuen Spieler, wenn der Name gültig ist
    und noch nicht existiert.
    """

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


def get_all_players():
    return Player.query.order_by(Player.name.asc()).all()