# Glicko-2 team projection correction

## Scope and mathematical model

The app models a two-player team as its mean strength. Assuming independent
player states, R = sum(r_i)/n, D = sqrt(sum(d_i²))/n, and
S = sqrt(sum(sigma_i²))/n. Volatility is on the Glicko-2 scale; RD is on the
rating scale. The common conversion factor cancels in their scaling ratios.
Both teams update against their opponent's pre-match state. One eligible match
is one rating period; inactive players are not advanced by calendar time.

[Glickman's specification](https://www.glicko.net/glicko/glicko2.pdf)
defines the single-player update, including phi*² = phi² + sigma'². It does
not uniquely specify how a changing partnership's posterior should be split
between individuals. It recommends more games per rating period than this
application uses. The existing corrected volatility equation and tau=0.5 stay.

The old implementation allocated all three deltas using n*d_i/sum(d).
That preserves the mean rating, but not D or S. With equal RDs, a team RD
delta of -30 gives only -30/sqrt(2) = -21.2132034356 after reaggregation.
Volatility allocation also incorrectly depended on RD rather than volatility.

The correction preserves each uncertainty's within-team proportions:

    r_i'     = r_i + n * d_i/sum(d) * (R' - R)
    d_i'     = d_i * D'/D
    sigma_i' = sigma_i * S'/S

Hence sqrt(sum(d_i'²))/n = D' exactly in real arithmetic, and likewise S'.
For equal RDs and delta D=-30, each player's RD changes by -42.4264068712.
Positive targets preserve positivity. Invalid/non-finite states and targets
raise errors rather than silently clamping; caller clamps were removed from
live replay, evaluation and simulation because they could break this invariant.
Normal Glicko-2 updates produce positive RD/volatility.

## Why this projection, and what it does not prove

This is the unique common multiplicative scaling that preserves prior RD
ratios (and separately volatility ratios). It fixes aggregate consistency
without introducing a new rating-point allocation policy or database schema.
The RD-weighted rating allocation remains an explicit historical heuristic.
It is mean-consistent, but is not a Gaussian posterior allocation rule.

For independent Gaussian player strengths with prior variances v_i and team
mean T, a conditional mean update would use n*v_i/sum(v) rather than n*d_i/sum(d).
A full Gaussian moment update also generates teammate covariance:

    Cov'(i,j) = Cov(i,j)
                + (n*v_i/sum(v)) * (n*v_j/sum(v)) * (Var(T')-Var(T))

Here the prior off-diagonal covariance is zero. Dropping those posterior
off-diagonal terms while keeping the marginal variances generally fails to
reproduce the team variance. Proportional scaling is therefore a deliberate
diagonal approximation, not a claim of exact Bayesian inference. Persistent
partnerships cannot identify separate player strengths reliably; changing
partners helps, but individual RD must not be read as a calibrated confidence
interval. A covariance-aware team model or a separately validated TrueSkill
model would be a broader algorithm change, requiring predictive validation.
Changing only the rating weights to variance weights would not solve that.

## Safe comparison before deployment

**Do not deploy this change as an incidental main-branch update.** Creating
the next eligible match already triggers a full historical replay. A new
deployment can therefore change the live ranking without anyone manually
running a rebuild. Stored rows have no algorithm-version field; existing
processed markers alone cannot distinguish old from corrected ratings.

First use a consistent export including matches, teams and players, and keep
the stored player_ratings and match_rating_status as reconciliation controls.
Never infer team membership from team names or rating values.

The standalone command does not load app configuration or connect to a DB:

```sh
python compare_glicko2.py history.json > comparison.json
```

Input is a JSON array of objects with id, played_at (ISO timestamp), team_a and
team_b (two player IDs each), score_team_a, score_team_b, winner_team and
four_twenty_mode (boolean). The IDs and timestamps must match the export.

Alternatively, with a read-only database account or a local snapshot:

```sh
flask --app app compare-glicko2 > comparison.json
```

This command reads matches and teams in one SELECT with autoflush disabled;
both replays happen on detached in-memory rating states. It never invokes
the rebuild command, writes rows, resets statuses, commits, or rolls back user
data. This differs from rebuild-glicko2 --dry-run, which writes then rolls back.
Comparison output contains full precision rating/RD/volatility before and
after, differences, match counts and public ranks. Unplaced players have null
ranks. Players with no eligible matches do not appear in the replay output.
Baseline is main 206c66de's linear distribution, including its 1e-6 clamps.
Both versions retain the earlier library volatility-equation correction.

Reconcile the old replay against exported saved ratings and statuses before
trusting the new comparison. Investigate mismatches or missing matches; do
not overwrite them automatically. Rank order remains descending rating then
player ID. Placement stays at 10 rated matches (or the existing configured
threshold). Only actual 420-point victories with 420 mode enabled are excluded;
regular victories in that mode remain eligible. Point margins do not enter
Glicko-2. Elo and TrueSkill are not changed.

After reviewing the real comparison, schedule deployment and one atomic full
rebuild together during a match-entry pause, with a verified backup. Verify
counts, statuses and rankings before resuming. Rollback requires reverting
code AND restoring/replaying the old ratings, not merely reverting code.
No production data or deployment is changed by the comparison commands.
