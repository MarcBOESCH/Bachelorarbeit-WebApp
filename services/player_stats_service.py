from models.match import Match
from models.player import Player


DEFAULT_ELO_RATING = 1500


def get_player_elo_rating(player):
    for rating in player.ratings:
        if rating.system_name == "elo":
            return int(round(rating.rating))

    return DEFAULT_ELO_RATING


def get_player_team_for_match(player, match):
    in_team_a = player.id in (match.team_a.player1_id, match.team_a.player2_id)
    in_team_b = player.id in (match.team_b.player1_id, match.team_b.player2_id)

    if in_team_a:
        return "A"

    if in_team_b:
        return "B"

    return None


def calculate_player_match_point_diff(player_team, match):
    if player_team == "A":
        return match.score_team_a - match.score_team_b

    return match.score_team_b - match.score_team_a


def build_player_stats(player, matches):
    matches_played = 0
    wins = 0
    losses = 0
    total_point_diff = 0

    for match in matches:
        player_team = get_player_team_for_match(player, match)

        if not player_team:
            continue

        matches_played += 1

        if match.winner_team == player_team:
            wins += 1
        else:
            losses += 1

        total_point_diff += calculate_player_match_point_diff(player_team, match)

    win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0
    avg_point_diff = round(total_point_diff / matches_played, 1) if matches_played > 0 else 0.0

    return {
        "id": player.id,
        "name": player.name,
        "matches_played": matches_played,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "avg_point_diff": avg_point_diff,
        "elo": get_player_elo_rating(player),
    }


def get_player_stats():
    players = Player.query.order_by(Player.name.asc()).all()
    matches = Match.query.all()

    return [build_player_stats(player, matches) for player in players]