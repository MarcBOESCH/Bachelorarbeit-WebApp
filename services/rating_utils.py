import math

import trueskill
from glicko2 import Player as Glicko2Player


SUPPORTED_RATING_SYSTEMS = {"elo", "elo_margin", "glicko2", "trueskill"}

DEFAULT_ELO_RATING = 1500.0
DEFAULT_GLICKO2_RATING = 1500.0
DEFAULT_GLICKO2_RD = 350.0
DEFAULT_GLICKO2_VOL = 0.06

DEFAULT_TRUESKILL_MU = 25.0
DEFAULT_TRUESKILL_SIGMA = 8.333

TRUESKILL_ENV = trueskill.TrueSkill(
    mu=DEFAULT_TRUESKILL_MU,
    sigma=DEFAULT_TRUESKILL_SIGMA,
    beta=4.167,
    tau=0.083,
    draw_probability=0.0
)


def calculate_elo_expected_score(team_a_rating, team_b_rating):
    return 1 / (1 + 10 ** ((team_b_rating - team_a_rating) / 400))


def calculate_elo_update(team_a_rating, team_b_rating, winner_team, k_factor=32):
    expected_a = calculate_elo_expected_score(team_a_rating, team_b_rating)
    expected_b = calculate_elo_expected_score(team_b_rating, team_a_rating)

    actual_a = 1.0 if winner_team == "A" else 0.0
    actual_b = 1.0 if winner_team == "B" else 0.0

    delta_a = k_factor * (actual_a - expected_a)
    delta_b = k_factor * (actual_b - expected_b)

    return {
        "expected_a": expected_a,
        "expected_b": expected_b,
        "delta_a": delta_a,
        "delta_b": delta_b,
    }


def calculate_margin_multiplier(point_diff, cap=500, alpha=0.5):
    clipped = min(max(point_diff, 0), cap)
    normalized = math.log1p(clipped) / math.log1p(cap)
    return 1.0 + alpha * normalized


def calculate_elo_margin_update(
    team_a_rating,
    team_b_rating,
    winner_team,
    point_diff,
    k_factor=32,
    cap=500,
    alpha=0.5,
):
    base_result = calculate_elo_update(
        team_a_rating=team_a_rating,
        team_b_rating=team_b_rating,
        winner_team=winner_team,
        k_factor=k_factor,
    )

    margin_multiplier = calculate_margin_multiplier(
        point_diff=point_diff,
        cap=cap,
        alpha=alpha,
    )

    delta_a = base_result["delta_a"] * margin_multiplier
    delta_b = base_result["delta_b"] * margin_multiplier

    return {
        "expected_a": base_result["expected_a"],
        "expected_b": base_result["expected_b"],
        "delta_a": delta_a,
        "delta_b": delta_b,
        "margin_multiplier": margin_multiplier,
    }


def aggregate_glicko2_team_state(team_entries):
    ratings = [entry["rating_entry"].rating for entry in team_entries]
    rds = [entry["rating_entry"].rating_deviation for entry in team_entries]
    vols = [entry["rating_entry"].volatility for entry in team_entries]

    team_rating = sum(ratings) / len(ratings)

    # Teamleistung basiert auf dem Mittelwert der Einzelstärken.
    # Deshalb wird auch die Unsicherheit des Teammittels approximiert:
    # sqrt(sum(variance)) / n
    team_rd = math.sqrt(sum(rd ** 2 for rd in rds)) / len(rds)
    team_vol = math.sqrt(sum(vol ** 2 for vol in vols)) / len(vols)

    return {
        "rating": team_rating,
        "rd": team_rd,
        "vol": team_vol,
    }


def calculate_rd_based_weights(team_entries):
    rds = [max(entry["rating_entry"].rating_deviation, 1e-6) for entry in team_entries]
    total_rd = sum(rds)

    if total_rd <= 0:
        uniform_weight = 1.0 / len(team_entries)
        return [uniform_weight for _ in team_entries]

    return [rd / total_rd for rd in rds]


def calculate_glicko2_team_update(team_a_state, team_b_state, winner_team):
    team_a_player = Glicko2Player(
        rating=team_a_state["rating"],
        rd=team_a_state["rd"],
        vol=team_a_state["vol"],
    )
    team_b_player = Glicko2Player(
        rating=team_b_state["rating"],
        rd=team_b_state["rd"],
        vol=team_b_state["vol"],
    )

    if winner_team == "A":
        team_a_result = 1
        team_b_result = 0
    else:
        team_a_result = 0
        team_b_result = 1

    team_a_player.update_player(
        [team_b_state["rating"]],
        [team_b_state["rd"]],
        [team_a_result],
    )
    team_b_player.update_player(
        [team_a_state["rating"]],
        [team_a_state["rd"]],
        [team_b_result],
    )

    return {
        "team_a_before": team_a_state,
        "team_b_before": team_b_state,
        "team_a_after": {
            "rating": team_a_player.rating,
            "rd": team_a_player.rd,
            "vol": team_a_player.vol,
        },
        "team_b_after": {
            "rating": team_b_player.rating,
            "rd": team_b_player.rd,
            "vol": team_b_player.vol,
        },
        "delta_a": {
            "rating": team_a_player.rating - team_a_state["rating"],
            "rd": team_a_player.rd - team_a_state["rd"],
            "vol": team_a_player.vol - team_a_state["vol"],
        },
        "delta_b": {
            "rating": team_b_player.rating - team_b_state["rating"],
            "rd": team_b_player.rd - team_b_state["rd"],
            "vol": team_b_player.vol - team_b_state["vol"],
        },
    }


def distribute_team_delta_by_rd(team_entries, team_delta):
    weights = calculate_rd_based_weights(team_entries)
    team_size = len(team_entries)

    distributed = []
    for entry, weight in zip(team_entries, weights):
        distributed.append({
            "player_id": entry["player_id"],
            "weight": weight,
            "rating": team_delta["rating"] * team_size * weight,
            "rd": team_delta["rd"] * team_size * weight,
            "vol": team_delta["vol"] * team_size * weight,
        })

    return distributed


def calculate_log_loss(probability, actual_outcome):
    clipped_probability = min(max(probability, 1e-6), 1 - 1e-6)
    return -(
        actual_outcome * math.log(clipped_probability) +
        (1 - actual_outcome) * math.log(1 - clipped_probability)
    )