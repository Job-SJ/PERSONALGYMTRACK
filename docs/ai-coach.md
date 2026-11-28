# AI Coach

1. Create an [OpenRouter inference key](https://openrouter.ai/settings/keys). Disable prompt and response logging, prompt sharing, and content exports in the [OpenRouter workspace privacy settings](https://openrouter.ai/settings/privacy).
2. Open **Coach** in GymTrack on web or Expo, choose **Connect OpenRouter**, and enter your key. GymTrack verifies it and loads eligible models. Start with **Recommended** or search the advanced list.
3. Review the selected model’s pricing, confirm the GymTrack spending limit for a paid model, grant processing consent, and choose **Enable Coach**. The chat opens immediately.

Try “Who do I usually train with?”, “Which lifts have improved most?” or “Compare this month with my previous three months.” Follow-ups can use the recent conversation to recover the previous topic or date range. Expand **Supporting evidence** to see the analysis windows or recent workout dates behind a partner answer.

## Models and spending

GymTrack checks the live OpenRouter Zero Data Retention catalog for compatible endpoints with known prices and token limits. It groups routes by model and favors declared tool and reasoning support, lower reserved cost, and lower reported median latency when available. These are provider signals. Recommendation labels describe the selection criteria. An eligible free option appears only when the catalog and key allow it.

OpenRouter account credits and key limits govern the provider account. Provider pricing is shown per million input and output tokens. GymTrack applies its own per-user cap, with a suggested **$2 USD per UTC month** for paid setup and a zero-dollar limit for free setup. GymTrack never purchases credits. An administrator who offers a shared instance key should set an aggregate OpenRouter cap as well.

The database reserves the worst-case cost of planning and answering before a model-backed turn. It also applies a cooldown and a monthly request count limit. Unconfirmed or interrupted provider calls can retain their reservation. Provider credit shortages surface when OpenRouter returns them. The inference-key endpoint exposes key and guardrail limits and free-request quotas, while overall account credit availability can become known during inference. [OpenRouter key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)

## What Coach can analyze

Web and Expo share the same server, versioned Coach personality and tool registry. For each model-backed turn, Coach can plan up to four operations from the latest message and bounded conversation history. Tool-capable models use native function calls. Other models produce a JSON plan using the same schema. The server validates every operation and runs the owner-scoped queries and calculations. If a model returns an invalid plan, the app asks the athlete to retry or choose another model.

- Training evidence covers schedule, frequency, duration, repetitions, working sets, mapped load-volume, routine and superset coverage, and muscle distribution. Weekly rates use elapsed calendar days. Comparisons show the actual date ranges.
- Strength evidence compares sessions within the same exercise template, with optional exercise, exact-rep and workout partner filters. Estimated one-rep max uses eligible loaded sets of one to ten reps. Partner comparisons use the locally tagged sessions and all other sessions in the requested window. A missing tag does not establish who attended a workout. Relative strength uses a recent recorded bodyweight where available.
- Nutrition evidence uses diary days you marked complete and excludes missing nutrient values from that nutrient’s denominator. It can show current targets, bodyweight change, workout and weight goals, and the existing adaptive maintenance estimate when coverage qualifies.
- Local partner discovery scans the workout descriptions shown in Replay, stored as `workouts.notes`. It counts each case-insensitive `@username` once per workout, ignores email addresses, and treats tags as inferred partner evidence. Percentages use all workouts in the selected history, with a maximum window of 10,000 workouts. Supporting evidence shows the ranking and recent tagged dates.

Plain language date ranges include recent days, months, years and recorded history. Use two ISO dates such as `2026-03-01 to 2026-03-31` for an exact range. Very large windows can reach the scan caps of 500 workouts or 500 rows per diary or measurement read. Evidence marks bounded samples and weekly extrapolations are omitted for capped training samples. Numbered exercise labels preserve exercise distinctions while keeping custom names out of retrieved evidence. Notes search can match a phrase locally and returns counts, dates and duration.

## Meals in chat

Describe what you ate, then review the editable preview in the conversation. Coach checks your saved foods and Open Food Facts. Select a product and supply an amount where needed. While the preview is active, you can also ask Coach to add a food, change a quantity or move the meal to another slot. Only **Confirm meal** writes to the diary. The confirmation keeps the same request ID on retry. The active editor is specific to the session that prepared it, while chat turns are synchronized.

## Hevy integration

GymTrack already stores workout titles, descriptions, timing, exercise notes, templates, and set metrics. Coach uses those records and local nutrition, goal and bodyweight data. The Hevy workout schema also supplies routine IDs, exercise superset IDs, and the set custom metric used for stair equipment. New synchronizations preserve these fields. Open **Settings → Integrations → Sync options → Refresh workout history** to populate older workouts by their existing IDs. Missing workouts on a history page do not imply deletion. The existing incremental reconciliation still processes explicit Hevy deletion events.

The API also documents owner-only body measurements, media URLs and the authenticated account profile. This release continues to use GymTrack’s existing measurement records and does not import media or profile information. The documented workouts and profile endpoints do not expose a co-attendee roster or provide other athletes’ private training records. [Official Hevy API reference](https://developers.hevy.com/docs) · [Official response schemas](https://developers.hevy.com/openapi.json)

## Privacy and administration

Apply the repository migrations, including `202611280002_coach_evidence.sql` and `202611280003_hevy_workout_metadata.sql`, and configure the [encrypted credential vault](self-hosting.md#hevy-credential-storage). Read [Hevy’s developer terms](https://developers.hevy.com/terms) before making Hevy-powered AI features available to other users, including its AI feature approval requirements.

The server authenticates the user and enforces MFA and row-level security on fitness evidence. Workout partner tags are matched locally and travel to the provider as temporary aliases when needed for context. Provider requests include the current question, a bounded portion of recent eligible chat turns, relevant calculations and an active meal description when needed for corrections. Raw workout notes, retrieved custom exercise names, account IDs and credentials stay out of analytical evidence. An existing preferred name in account metadata can be inserted locally in a reply. Keep identifying details and secrets out of typed messages.

GymTrack pins the approved OpenRouter endpoint, requires Zero Data Retention, denies data collection, disables fallback and sets price caps. Workspace logging controls remain relevant and GymTrack cannot audit them through the inference API. [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection) · [Zero Data Retention](https://openrouter.ai/docs/guides/privacy/zdr)

GymTrack keeps up to 100 conversations and 120 questions per conversation. Use **Coach settings** to withdraw consent, remove the key or delete conversations. Deleting chats removes their messages and evidence while retaining billing counters. Supabase backups and OpenRouter metadata follow their respective policies.
