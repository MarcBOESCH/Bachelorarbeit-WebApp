from extensions import db
from models.match import Match, MatchPlayer
from models.player import Player


def create_match(score_team_a, score_team_b, players):
    """
    Erstellt ein Match mit 4 Spieler-Zuordnungen.
    """

    if not isinstance(score_team_a, int) or not isinstance(score_team_b, int):
        return False, "Die Scores müssen Ganzzahlen sein.", None

    if score_team_a < 0 or score_team_b < 0:
        return False, "Die Scores dürfen nicht negativ sein.", None

    if score_team_a == score_team_b:
        return False, "Ein Match kann nicht mit Gleichstand gespeichert werden.", None

    if not isinstance(players, list) or len(players) != 4:
        return False, "Es müssen genau 4 Spieler übergeben werden.", None

    player_ids = []
    seen_slots = set()

    for entry in players:
        if not isinstance(entry, dict):
            return False, "Ungültiger Spieler-Eintrag.", None

        player_id = entry.get("player_id")
        team = entry.get("team")
        team_slot = entry.get("team_slot")

        if not isinstance(player_id, int):
            return False, "Ungültige player_id.", None

        if team not in {"A", "B"}:
            return False, "Team muss 'A' oder 'B' sein.", None

        if team_slot not in {1, 2}:
            return False, "team_slot muss 1 oder 2 sein.", None

        slot_key = (team, team_slot)
        if slot_key in seen_slots:
            return False, "Jeder Team-Slot darf nur einmal vorkommen.", None
        seen_slots.add(slot_key)

        player_ids.append(player_id)

    if len(set(player_ids)) != 4:
        return False, "Ein Spieler darf nicht mehrfach im selben Match vorkommen.", None

    existing_players = Player.query.filter(Player.id.in_(player_ids)).all()
    if len(existing_players) != 4:
        return False, "Mindestens ein ausgewählter Spieler existiert nicht.", None

    point_diff = abs(score_team_a - score_team_b)
    winner_team = "A" if score_team_a > score_team_b else "B"

    match = Match(
        score_team_a=score_team_a,
        score_team_b=score_team_b,
        point_diff=point_diff,
        winner_team=winner_team,
        rating_processed=False
    )

    db.session.add(match)
    db.session.flush()

    for entry in players:
        match_player = MatchPlayer(
            match_id=match.id,
            player_id=entry["player_id"],
            team=entry["team"],
            team_slot=entry["team_slot"]
        )
        db.session.add(match_player)

    db.session.commit()

    return True, None, match

def get_all_matches():
    return Match.query.order_by(Match.played_at.desc()).all()