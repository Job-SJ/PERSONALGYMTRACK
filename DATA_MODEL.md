# Data model and calculations

Nested records are separated into workouts, workout exercises and sets. Ownership is part of each parent/child key. Hevy workout and exercise template IDs are kept as supplied. CSV identities are hashes of the title and normalized start/end timestamps, and exercise names have a separate namespace. Latest state replaces a workout atomically. Hevy deletion events remove the local workout through a cascade.

Exercise templates supply equipment, exercise type and muscle names. Traps and upper/lower back map to Back. Abdominals map to Core. Unknown classifications remain unassigned. Direct and secondary working sets exclude warmups and duplicate region aliases. A muscle session is counted once per workout.

- Recorded volume load sums positive external kg × repetitions for exercises of the Hevy weight_reps type. Missing weights remain unavailable. Weighted and assisted bodyweight are intentionally kept out of this aggregate. Unilateral load conventions are preserved as recorded.
- Epley is weight × (1 + reps ÷ 30). Brzycki is weight × 36 ÷ (37 − reps). One rep uses the actual weight. Estimates use eligible working sets of 1–10 reps from one exercise. Machine resistance is comparable only within stable equipment and conditions.
- PR baselines and strict improvements are calculated chronologically per template and metric. These include positive loaded work, per-rep weight, estimated 1RM, eligible exercise volume and bodyweight repetitions.
- Streaks use unique local dates, with a current streak retained through the day after the most recent training date. Relative strength divides the session estimate by the closest bodyweight recorded on or before the session, up to seven calendar days earlier.
- Body measurements retain a manual/imported source field. Moving averages use observed values within the trailing window. Goals track workout counts or bodyweight by calendar date; target completion history is pending.
