from models.player import Player
from models.match import Match


def get_player_stats():
    players = Player.query.order_by(Player.name.asc()).all()
    matches = Match.query.all()
    result = []

    for player in players:
        matches_played = 0
        wins = 0
        losses = 0
        total_point_diff = 0

        for match in matches:
            # Prüfen, ob der Spieler im aktuellen Match auf dem Feld stand
            in_team_a = player.id in (match.team_a.player1_id, match.team_a.player2_id)
            in_team_b = player.id in (match.team_b.player1_id, match.team_b.player2_id)

            if not in_team_a and not in_team_b:
                continue

            matches_played += 1
            player_team = "A" if in_team_a else "B"

            if match.winner_team == player_team:
                wins += 1
            else:
                losses += 1

            if player_team == "A":
                total_point_diff += (match.score_team_a - match.score_team_b)
            else:
                total_point_diff += (match.score_team_b - match.score_team_a)

        win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0
        avg_point_diff = round(total_point_diff / matches_played, 1) if matches_played > 0 else 0.0

        elo_rating = 1500
        for r in player.ratings:
            if r.system_name == "elo":
                elo_rating = int(round(r.rating))
                break

        result.append({
            "id": player.id,
            "name": player.name,
            "matches_played": matches_played,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "avg_point_diff": avg_point_diff,
            "elo": elo_rating
        })

    return result