import math

import trueskill


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


def calculate_log_loss(probability, actual_outcome):
    clipped_probability = min(max(probability, 1e-6), 1 - 1e-6)
    return -(
        actual_outcome * math.log(clipped_probability) +
        (1 - actual_outcome) * math.log(1 - clipped_probability)
    )