# Uncertainty-aware forecasts and offline model comparison

## Forecast versus rating update

The old Glicko-2 evaluation used an Elo logistic on team mean ratings, ignoring
both teams' RDs. The replacement follows Glickman's **Expected outcome of a
game** formula ([The Glicko system, p. 5](https://www.glicko.net/glicko/glicko.pdf)):

    phi = hypot(RD_A, RD_B) / 173.7178
    g = 1 / sqrt(1 + 3 * phi² / pi²)
    P(A wins) = logistic(g * (rating_A - rating_B) / 173.7178)
    P(B wins) = 1 - P(A wins)

Both RDs belong in a pre-match forecast. Substituting only the opponent's RD
as in a player's conditional rating-update expectation would make forecasts
dependent on the chosen side. Larger uncertainty moves predictions toward
50:50; the rating update equations remain unchanged. This is still based on
the project's approximate team aggregate, not a new covariance-aware model.
Volatility is not added a second time or treated as another RD; no calendar
inactivity model is introduced by this change.

The helper is shared by the database evaluation and simulation pipeline.
Full-precision `probability_a` is returned alongside the existing rounded
display fields. TrueSkill forecasts now use the standard-library normal CDF
instead of its library's approximate CDF, preserving exactly 0.5 at equal
means. TrueSkill rating updates and parameters are unchanged.

Simulation ordering is explicitly `(played_at, match_index)` for every model,
matching the live replay's `(played_at, id)` tie-break. These fixes change
forecast metrics, not the underlying rating states beyond the separately
documented RD/volatility projection correction.

## Reproducible offline comparison

```sh
python compare_rating_models.py /path/to/export > comparison.json
```

Requires `matches.csv`, `teams.csv`, `players.csv` from one consistent export.
The command validates IDs, team membership, scores and winner consistency and
excludes only actual 420-point wins with 420 mode enabled. It never imports
the Flask app, opens a database, writes ratings or uses exported final ratings
as prediction inputs. It records source hashes. Do not commit private exports
or player-level reports to the repository.

Elo (K=32), corrected team-Glicko-2 (1500/350/0.06, tau=0.5), and TrueSkill
(mu=25, sigma=8.333, beta=4.167, tau=0.083, no draws) start from their existing
defaults. No parameters are fitted. Each model predicts a match before it
updates on that result. All three see exactly the same ordered history.

Primary measures are Brier score and natural-log loss (both lower is better),
computed from unrounded probabilities. The 50:50 baseline has Brier 0.25 and
log loss ln(2). Accuracy is secondary: a 50:50 prediction receives half credit
so choosing A for numerical ties cannot inflate results. Probabilities within
1e-12 of 0.5 count as ties for this metric only. The comparison does not use
the legacy A-on-tie accuracy still exposed by the existing evaluation UI.

Additional descriptive slices: the second chronological half (with continued
learning from earlier matches), and matches where all four players had at
least ten eligible games **before** that match. Excluded matches never advance
placement. None of these thresholds or settings are tuned to the results.

Paired Brier differences versus Elo include a seeded, 2,000-resample calendar-
day block bootstrap. Database timestamps are naive UTC; day clusters use
Europe/Vienna. Whole days are resampled jointly for both models. This is only
a descriptive uncertainty check: repeated players remain dependent across
days, the same history was already inspected, and this is not an untouched
prospective test set. A small sample cannot establish universal superiority.

No ranking uncertainty penalty, changed placement policy, security change,
database migration or live deployment is included. Parameter optimization
requires a separately defined chronological validation protocol; the current
comparison must not be reused as an allegedly untouched final test set.
