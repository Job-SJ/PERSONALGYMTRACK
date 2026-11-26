# Data model and calculations

Nested records are separated into workouts, workout exercises and sets. Ownership is part of each parent/child key. Hevy workout and exercise template IDs are kept as supplied. CSV identities are hashes of the title and normalized start/end timestamps, and exercise names have a separate namespace. Latest state replaces a workout atomically. Hevy deletion events remove the local workout through a cascade.

Exercise templates supply equipment, exercise type and muscle names. Traps and upper/lower back map to Back. Abdominals map to Core. Unknown classifications remain unassigned. Direct and secondary working sets exclude warmups and duplicate region aliases. A muscle session is counted once per workout.

- Recorded volume load sums positive external kg × repetitions for exercises of the Hevy weight_reps type. Missing weights remain unavailable. Weighted and assisted bodyweight are intentionally kept out of this aggregate. Unilateral load conventions are preserved as recorded.
- Epley is weight × (1 + reps ÷ 30). Brzycki is weight × 36 ÷ (37 − reps). One rep uses the actual weight. Estimates use eligible working sets of 1–10 reps from one exercise. Machine resistance is comparable only within stable equipment and conditions.
- PR baselines and strict improvements are calculated chronologically per template and metric. These include positive loaded work, per-rep weight, estimated 1RM, eligible exercise volume and bodyweight repetitions.
- Streaks use unique local dates, with a current streak retained through the day after the most recent training date. Relative strength divides the session estimate by the closest bodyweight recorded on or before the session, up to seven calendar days earlier.
- Body measurements retain a manual/imported source field. Moving averages use observed values within the trailing window. Goals track workout counts or bodyweight by calendar date; target completion history is pending.

## Athlete experience

- **Performance Replay** compares non-overlapping 30-, 90-, or 180-day windows in Amsterdam time. Estimated 1RM and relative strength use medians of eligible daily estimates for the selected exercise. Recorded maximum load is the highest working load in the window. Relative samples require the closest positive weigh-in on the session date or within the preceding seven days. The chart uses observed points, and long histories use bucket maxima for strength. Workout counts and mapped load are aggregated by week or calendar month. Gold points and milestone links represent genuine improvements after an earlier record.
- **Strength Passport** selects up to four available facts, with weight and relative strength off by default. Its optional display name is entered for this preview. The export is a 1200 × 1500 PNG generated locally from the reviewed selection. The renderer receives display text and numbers. Workout and measurement identifiers stay outside the export content.
- **Training Fingerprint** compares equal 28-, 56-, or 84-day windows of completed dates. Four distinct training dates are the minimum for a profile. The previous outline applies the same rules to the preceding window. Its strength and volume axes also require a third window as a reference. Unavailable dimensions are left blank.

| Fingerprint axis | Calculation |
| --- | --- |
| Strength progression | For each matched lift, divide its current median daily estimated 1RM by its prior median and subtract one. Take the median change across lifts. Multiply by 500 and add 50, then clamp to 0–100. Each lift needs three eligible dates spanning at least seven days in both windows. |
| Training volume | Divide recorded mapped volume by the preceding window's volume. The scale is `50 + 50 × log₂(ratio)`, clamped to 0–100. Each window needs measured load in at least two workouts and 75% of its workouts. |
| Consistency | Count distinct training dates in each seven-day bucket. Sum the absolute differences across all ordered pairs of bucket counts. Divide by `2 × (number of buckets − 1) × total training dates`. Subtract from one and multiply by 100. |
| Muscle group balance | For each of the 11 regions, divide direct working sets by all mapped direct working sets. Square and sum the shares to get concentration. The score is `100 × (1 − concentration) ÷ (1 − 1/11)`. Requires at least 12 mapped sets and 75% coverage of all working sets. |
| Progression patterns | Count consecutive dates for the same loaded lift that are at most 21 days apart. Divide pairs with a heavier recorded maximum working load on the later date by all eligible pairs and multiply by 100. Requires six pairs. |
| Training frequency | Divide distinct training dates by calendar days in the window and multiply by 100. |

Strength and volume comparisons require the archive to reach the start of the reference window. Archetypes require at least three available axes. The first matching profile takes precedence in this order: improving estimates with frequent load increases, distributed muscle work, even weekly attendance, higher recorded volume, frequent training dates, and a mixed profile. The classifications describe the recorded period and carry no population ranking.
