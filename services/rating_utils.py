import math

import trueskill


SUPPORTED_RATING_SYSTEMS = {"elo", "glicko2", "trueskill"}

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


def calculate_log_loss(probability, actual_outcome):
    clipped_probability = min(max(probability, 1e-6), 1 - 1e-6)
    return -(
        actual_outcome * math.log(clipped_probability) +
        (1 - actual_outcome) * math.log(1 - clipped_probability)
    )