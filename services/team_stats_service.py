from models.match import Match
from models.rating import PlayerRating
from models.team import Team


DEFAULT_ELO_RATING = 1500.0


def build_elo_lookup():
    return {
        rating.player_id: rating.rating
        for rating in PlayerRating.query.filter_by(system_name="elo").all()
    }


def calculate_team_elo(team, elo_lookup):
    player1_elo = elo_lookup.get(team.player1_id, DEFAULT_ELO_RATING)
    player2_elo = elo_lookup.get(team.player2_id, DEFAULT_ELO_RATING)
    return int(round((player1_elo + player2_elo) / 2))


def get_team_side_in_match(team, match):
    if match.team_a_id == team.id:
        return "A"

    if match.team_b_id == team.id:
        return "B"

    return None


def calculate_team_match_point_diff(team_side, match):
    if team_side == "A":
        return match.score_team_a - match.score_team_b

    return match.score_team_b - match.score_team_a


def build_team_stats(team, matches, elo_lookup):
    matches_played = 0
    wins = 0
    losses = 0
    total_point_diff = 0

    for match in matches:
        team_side = get_team_side_in_match(team, match)

        if not team_side:
            continue

        matches_played += 1

        if match.winner_team == team_side:
            wins += 1
        else:
            losses += 1

        total_point_diff += calculate_team_match_point_diff(team_side, match)

    win_rate = round((wins / matches_played) * 100, 1) if matches_played > 0 else 0.0
    avg_point_diff = round(total_point_diff / matches_played, 1) if matches_played > 0 else 0.0

    return {
        "id": team.id,
        "name": team.name,
        "player_names": f"{team.player1.name} & {team.player2.name}",
        "matches_played": matches_played,
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "avg_point_diff": avg_point_diff,
        "elo": calculate_team_elo(team, elo_lookup),
    }


def get_team_stats():
    teams = Team.query.order_by(Team.name.asc()).all()
    matches = Match.query.all()
    elo_lookup = build_elo_lookup()

    return [build_team_stats(team, matches, elo_lookup) for team in teams]