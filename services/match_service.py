from extensions import db
from models.match import Match, MatchPlayer
from models.player import Player

MAX_POINTS = 1000


def create_match(score_team_a, score_team_b, players):
    if not isinstance(score_team_a, int) or not isinstance(score_team_b, int):
        return False, "Die Scores müssen Ganzzahlen sein.", None

    if score_team_a < 0 or score_team_b < 0:
        return False, "Die Scores dürfen nicht negativ sein.", None

    if score_team_a == score_team_b:
        return False, "Ein Match kann nicht mit Gleichstand gespeichert werden.", None

    has_valid_winner = (
        (score_team_a >= MAX_POINTS and score_team_a > score_team_b) or
        (score_team_b >= MAX_POINTS and score_team_b > score_team_a)
    )

    if not has_valid_winner:
        return False, "Das Match darf erst gespeichert werden, wenn ein Team die Gewinnpunktzahl erreicht hat.", None

    if not isinstance(players, list) or len(players) != 4:
        return False, "Es müssen genau 4 Spieler übergeben werden.", None

    player_ids = []
    seen_slots = set()
    team_a_count = 0
    team_b_count = 0

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

        if team == "A":
            team_a_count += 1
        else:
            team_b_count += 1

        slot_key = (team, team_slot)
        if slot_key in seen_slots:
            return False, "Jeder Team-Slot darf nur einmal vorkommen.", None
        seen_slots.add(slot_key)

        player_ids.append(player_id)

    if team_a_count != 2 or team_b_count != 2:
        return False, "Es müssen genau 2 Spieler in Team A und 2 Spieler in Team B sein.", None

    if len(set(player_ids)) != 4:
        return False, "Ein Spieler darf nicht mehrfach im selben Match vorkommen.", None

    existing_players = Player.query.filter(Player.id.in_(player_ids)).all()
    if len(existing_players) != 4:
        return False, "Mindestens ein ausgewählter Spieler existiert nicht.", None

    winner_team = "A" if score_team_a > score_team_b else "B"
    point_diff = abs(score_team_a - score_team_b)

    last_match = Match.query.order_by(Match.played_at.desc()).first()
    if last_match:
        same_scores = (
            last_match.score_team_a == score_team_a and
            last_match.score_team_b == score_team_b and
            last_match.winner_team == winner_team
        )
        if same_scores:
            return False, "Dieses Match scheint bereits gespeichert worden zu sein.", None

    match = Match(
        score_team_a=score_team_a,
        score_team_b=score_team_b,
        point_diff=point_diff,
        winner_team=winner_team,
        rating_processed=False
    )

    try:
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
    except Exception:
        db.session.rollback()
        return False, "Das Match konnte aufgrund eines Datenbankfehlers nicht gespeichert werden.", None

    return True, None, match

def get_all_matches():
    return Match.query.order_by(Match.played_at.desc()).all()