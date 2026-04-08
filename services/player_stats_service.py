from models.player import Player


def get_player_stats():
    players = Player.query.order_by(Player.name.asc()).all()
    result = []

    for player in players:
        matches_played = 0
        wins = 0
        losses = 0
        total_point_diff = 0

        for entry in player.match_entries:
            match = entry.match
            matches_played += 1

            if match.winner_team == entry.team:
                wins += 1
            else:
                losses += 1

            if entry.team == "A":
                player_point_diff = match.score_team_a - match.score_team_b
            else:
                player_point_diff = match.score_team_b - match.score_team_a

            total_point_diff += player_point_diff

        win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0
        avg_point_diff = round(total_point_diff / matches_played, 1) if matches_played > 0 else 0.0

        elo_rating = 1500  #
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