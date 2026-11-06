import math

import trueskill
from glicko2 import Player as BaseGlicko2Player


class Glicko2Player(BaseGlicko2Player):
    """Correct glicko2 2.1.0 volatility equation (Glickman, step 5)."""

    def _f(self, x, delta, v, a):
        variance = (self.rd / 173.7178) ** 2
        ex = math.exp(x)
        return (ex * (delta ** 2 - variance - v - ex)
                / (2 * (variance + v + ex) ** 2)
                - (x - a) / self._tau ** 2)



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


def calculate_glicko2_win_probability(team_a_state, team_b_state):
    """Symmetric pre-match forecast, integrating both teams' uncertainty.

    Glickman, The Glicko system, 'Expected outcome of a game', p. 5:
    logistic(g(hypot(phi_a, phi_b)) * (mu_a - mu_b)).
    Unlike the conditional expectation inside a player's rating update,
    a match forecast must include BOTH RDs; swapping teams complements p.
    Team states use this project's independent-player approximation.
    """
    for state in (team_a_state, team_b_state):
        if (not math.isfinite(state["rating"])
                or not math.isfinite(state["rd"]) or state["rd"] < 0):
            raise ValueError("Forecasts require finite ratings and nonnegative RD.")
    scale = 173.7178
    uncertainty_factor = math.sqrt(3) / math.pi
    denominator = math.hypot(scale, uncertainty_factor * team_a_state["rd"],
                             uncertainty_factor * team_b_state["rd"])
    x = (team_a_state["rating"] - team_b_state["rating"]) / denominator
    if x >= 0:
        return 1 / (1 + math.exp(-x))
    ex = math.exp(x)
    return ex / (1 + ex)


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
    if not team_entries:
        raise ValueError("A Glicko-2 team must not be empty.")
    ratings = [entry["rating_entry"].rating for entry in team_entries]
    rds = [entry["rating_entry"].rating_deviation for entry in team_entries]
    vols = [entry["rating_entry"].volatility for entry in team_entries]
    if (not all(math.isfinite(r) for r in ratings)
            or not all(math.isfinite(x) and x > 0 for x in rds + vols)):
        raise ValueError("Glicko-2 states require finite ratings and positive RD/volatility.")

    team_rating = sum(ratings) / len(ratings)

    # Teamleistung basiert auf dem Mittelwert der Einzelstärken.
    # Deshalb wird auch die Unsicherheit des Teammittels approximiert:
    # sqrt(sum(variance)) / n
    team_rd = math.hypot(*rds) / len(rds)
    team_vol = math.hypot(*vols) / len(vols)

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
    if winner_team not in {"A", "B"}:
        raise ValueError("Glicko-2 winner must be A or B.")
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
    """Preserve the team mean and both quadratic aggregates on reconstruction.

    Rating allocation keeps the existing RD-weighted heuristic. RD and
    volatility instead keep their respective within-team ratios: x_i' =
    x_i * x_team' / x_team. This is an aggregate-consistent projection,
    not a Bayesian individual posterior (teammate covariance is not stored).
    """
    before = aggregate_glicko2_team_state(team_entries)
    if not all(math.isfinite(team_delta[key]) for key in ("rating", "rd", "vol")):
        raise ValueError("Glicko-2 deltas must be finite.")
    after = {key: before[key] + team_delta[key] for key in before}
    if (not all(math.isfinite(x) for x in after.values())
            or after["rd"] <= 0 or after["vol"] <= 0):
        raise ValueError("Glicko-2 target RD and volatility must be positive and finite.")
    weights = calculate_rd_based_weights(team_entries)
    team_size = len(team_entries)

    distributed = []
    for entry, weight in zip(team_entries, weights):
        distributed.append({
            "player_id": entry["player_id"],
            "weight": weight,
            "rating": team_delta["rating"] * team_size * weight,
            "rd": entry["rating_entry"].rating_deviation * (team_delta["rd"] / before["rd"]),
            "vol": entry["rating_entry"].volatility * (team_delta["vol"] / before["vol"]),
        })

    return distributed


def aggregate_trueskill_team_state(team_entries):
    mus = [entry["rating_entry"].mu for entry in team_entries]
    sigmas = [entry["rating_entry"].sigma for entry in team_entries]

    team_mu = sum(mus)
    team_sigma = math.sqrt(sum(sigma ** 2 for sigma in sigmas))

    return {
        "mu": team_mu,
        "sigma": team_sigma,
    }


def calculate_trueskill_win_probability(team_a_state, team_b_state):
    delta_mu = team_a_state["mu"] - team_b_state["mu"]
    sum_sigma_sq = team_a_state["sigma"] ** 2 + team_b_state["sigma"] ** 2

    players_per_team = 2
    performance_variance = players_per_team * (TRUESKILL_ENV.beta ** 2)

    denominator = math.sqrt(sum_sigma_sq + 2 * performance_variance)

    # Standard-library normal CDF: exact symmetry at zero, unlike the
    # library's approximate CDF which can make a 50:50 game favor team A.
    return 0.5 * math.erfc(-delta_mu / (denominator * math.sqrt(2)))


def calculate_trueskill_exposed_rating(mu, sigma, k=3.0):
    return mu - k * sigma


def calculate_trueskill_team_update(team_a_ratings, team_b_ratings, winner_team):
    if winner_team == "A":
        rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[0, 1])
    else:
        rated_teams = TRUESKILL_ENV.rate([team_a_ratings, team_b_ratings], ranks=[1, 0])

    new_team_a_ratings, new_team_b_ratings = rated_teams

    return {
        "team_a_after": new_team_a_ratings,
        "team_b_after": new_team_b_ratings,
    }


def calculate_log_loss(probability, actual_outcome):
    epsilon = 1e-15
    clipped_probability = min(max(probability, epsilon), 1 - epsilon)
    return -(
        actual_outcome * math.log(clipped_probability) +
        (1 - actual_outcome) * math.log(1 - clipped_probability)
    )
