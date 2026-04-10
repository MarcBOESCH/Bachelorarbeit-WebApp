from extensions import db
from models.match import Match
from models.team import Team
from services.rating_service import process_match_for_system

MAX_POINTS = 1000

def create_match(score_team_a, score_team_b, team_a_id, team_b_id):
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

    team_a = Team.query.get(team_a_id)
    team_b = Team.query.get(team_b_id)

    if not team_a or not team_b:
        return False, "Mindestens eines der Teams existiert nicht.", None

    # Verhindern, dass jemand gegen sich selbst spielt
    players_a = {team_a.player1_id, team_a.player2_id}
    players_b = {team_b.player1_id, team_b.player2_id}
    if players_a.intersection(players_b):
        return False, "Ein Spieler kann nicht in beiden Teams gleichzeitig spielen.", None

    winner_team = "A" if score_team_a > score_team_b else "B"
    point_diff = abs(score_team_a - score_team_b)

    # Dubletten-Schutz (Verhindert mehrfaches Klicken des Speichern-Buttons)
    last_match = Match.query.order_by(Match.played_at.desc()).first()
    if last_match:
        same_scores = (
            last_match.score_team_a == score_team_a and
            last_match.score_team_b == score_team_b and
            last_match.team_a_id == team_a_id and
            last_match.team_b_id == team_b_id
        )
        if same_scores:
            return False, "Dieses Match scheint bereits gespeichert worden zu sein.", None

    match = Match(
        team_a_id=team_a_id,
        team_b_id=team_b_id,
        score_team_a=score_team_a,
        score_team_b=score_team_b,
        point_diff=point_diff,
        winner_team=winner_team,
        rating_processed=False
    )

    try:
        db.session.add(match)
        db.session.commit()

        # Elo Update antriggern
        try:
            process_match_for_system(match, "elo")
        except Exception as e:
            print(f"Automatisches Elo-Update fehlgeschlagen: {e}")

    except Exception:
        db.session.rollback()
        return False, "Das Match konnte aufgrund eines Datenbankfehlers nicht gespeichert werden.", None

    return True, None, match

def get_all_matches():
    return Match.query.order_by(Match.played_at.desc()).all()