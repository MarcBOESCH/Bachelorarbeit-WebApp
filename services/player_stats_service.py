from models.player import Player


def get_player_stats():
    players = Player.query.order_by(Player.name.asc()).all()
    result = []

    for player in players:
        matches_played = 0
        wins = 0
        losses = 0

        for entry in player.match_entries:
            match = entry.match
            matches_played += 1

            if match.winner_team == entry.team:
                wins += 1
            else:
                losses += 1

        win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0

        result.append({
            "id": player.id,
            "name": player.name,
            "matches_played": matches_played,
            "wins": wins,
            "losses": losses,
            "win_rate": win_rate
        })

    return result