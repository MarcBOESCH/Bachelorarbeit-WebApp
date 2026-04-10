from models.team import Team
from models.match import Match
from models.rating import PlayerRating


def get_team_stats():
    teams = Team.query.order_by(Team.name.asc()).all()
    matches = Match.query.all()
    result = []

    elo_ratings = {
        rating.player_id: rating.rating
        for rating in PlayerRating.query.filter_by(system_name="elo").all()
    }

    for team in teams:
        matches_played = 0
        wins = 0
        losses = 0
        total_point_diff = 0

        for match in matches:
            is_team_a = match.team_a_id == team.id
            is_team_b = match.team_b_id == team.id

            if not is_team_a and not is_team_b:
                continue

            matches_played += 1

            if is_team_a:
                if match.winner_team == "A":
                    wins += 1
                else:
                    losses += 1

                total_point_diff += (match.score_team_a - match.score_team_b)

            else:
                if match.winner_team == "B":
                    wins += 1
                else:
                    losses += 1

                total_point_diff += (match.score_team_b - match.score_team_a)

        win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0
        avg_point_diff = round(total_point_diff / matches_played, 1) if matches_played > 0 else 0.0

        player1_elo = elo_ratings.get(team.player1_id, 1500.0)
        player2_elo = elo_ratings.get(team.player2_id, 1500.0)
        team_elo = int(round((player1_elo + player2_elo) / 2))

        result.append({
            "id": team.id,
            "name": team.name,
            "player_names": f"{team.player1.name} & {team.player2.name}",
            "matches_played": matches_played,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate,
            "avg_point_diff": avg_point_diff,
            "elo": team_elo
        })

    return result