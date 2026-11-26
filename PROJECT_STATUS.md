# Project status

## Nutrition Intelligence

- Open the private Nutrition workspace at `http://localhost:3000/app/nutrition`, or use `/app/nutrition` on a deployment of this branch. It includes a dated meal diary, calorie and macro targets, reusable foods and meals, recipes, and intake comparisons with bodyweight and estimated strength.
- Open Food Facts name search uses Search-a-licious. Brand search uses structured search on the Dutch endpoint. Barcode details use API v3.6 and read as-sold packaging or manufacturer nutrient values. Diary entries keep their own portion and label snapshot. Missing measurements stay unknown. Recent search terms are held for the current Nutrition page visit. A free read connection works without an API key. Set the optional server environment variable `OPEN_FOOD_FACTS_CONTACT` to the operator's contact email for the API user-agent. [Open Food Facts API documentation](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/)
- The targets tab documents the Mifflin–St Jeor resting-energy formula, estimates maintenance using one overall activity multiplier, and saves only user-confirmed targets. Weekly intake averages use days that the user marked complete and that have known calorie values. Adaptive maintenance and a secondary USDA provider are deferred. [Mifflin–St Jeor study](https://pubmed.ncbi.nlm.nih.gov/2305711/)
- ESLint, 22 Vitest tests, the Node 22 production build with TypeScript, and 10 desktop and mobile Chromium tests passed. Embedded PostgreSQL verified owner isolation, anonymous denial, MFA enforcement, and diary updates, moves, duplication, deletion, and label snapshots.
- Inspected signed-in desktop and mobile Chromium in dark and light themes against a disposable Supabase API fixture. Verified logging, portion conversion, edits, moves, duplication, deletion, reload persistence, saving a meal, and building and logging a recipe serving. A simulated camera decoded EAN-13 barcode 3017620422003 and retrieved its live Nutella label. Live name search returned products in both browser layouts, and the Dutch structured brand endpoint returned genuine products. Hosted sign-in, hosted persistence and isolation, and a physical phone camera remain unverified.
- The hosted CLI could not list migrations on this network because direct access requires IPv6. Apply `supabase/migrations/202611260001_nutrition.sql` in Supabase SQL Editor after the existing core, MFA, and sync migrations. Paste the complete file, click Run, verify success, and reload Nutrition. The migration creates four owner-scoped tables and reuses the existing MFA policy. [Supabase SQL Editor](https://supabase.com/dashboard/project/clcrkpuajztuvyqrhnvu/sql/new)

## Premium upgrade

The working baseline is preserved on main at a80a11f. Upgrade work is on feature/premium-fitness-intelligence.

- Milestone A implements UTF-8 volume units, Amsterdam-local workout dates, browser-scoped UK and Dutch formatting preferences, active navigation, compact theme styling, and comparisons over matching completed days. The current weekly volume point uses an open marker. Relative strength uses an eligible estimated 1RM and an owner-visible weigh-in on or within seven days before the session.
- Local lint, TypeScript, 16 Vitest tests, the Node.js 22 production build and six Chromium setup and calendar checks across desktop and mobile passed. Inspected the dark setup dashboard on desktop and mobile. Hosted reconciliation, authenticated visual checks and live sync remain pending. The hosted CLI could not inspect migration history because the direct database connection requires IPv6.

- Milestone B is in progress. The calendar has selectable month, week and year views, local-date navigation, a session agenda and workout links. Exercise pages add a detail scale, original session links and rep-count records with prior bests. Workout Replay displays recorded set order, loads, reps, RPE, muscle mapping and records. The dashboard switches between six training and bodyweight metrics.
- Remaining product work includes deeper muscle and exercise analytics, equivalent-period chart comparisons, workout comparisons, Performance Lab, Body Evolution integration and Daily Briefing.

## Milestone 1 verification update

- All four required values are populated in the ignored local environment file. The Supabase connection and owner UUID passed format checks. The hosted Auth API accepted the publishable key and reported that public signup is enabled. PostgREST returned `PGRST205` for `sync_state`, so the application schema could not be verified on the hosted instance.
- The configured Hevy key passed a live read-only check. The app's adapter validated the exercise template catalog, paginated the workout history, matched the distinct workout IDs to the provider count and successfully read the event endpoint. Workout contents and counts stayed out of tool output and logs. Provider acceptance cannot establish that the key was rotated. No workouts were written to Supabase.
- The installed Supabase CLI could not read remote migration history over a direct connection because this network lacks IPv6. The hosted SQL Editor was opened for administrative sign-in. Use it to review migration state and existing objects before applying the three local migrations, or use the session pooler with credentials entered privately in an authenticated terminal. Disable public signup, verify the invited owner UID and complete password and TOTP verification before importing. Use a separate test identity to confirm hosted RLS isolation, then reconcile the first import and verify the private analytics.
- Expanded the hosted schema script to inspect policy definitions, constraint validation and index readiness. The sync form now announces a pending check or import and disables repeat submissions while the action is pending. This is request-level feedback. Percentage completion and resumable imports remain open.
- TypeScript, ESLint, 14 Vitest tests, the Node.js 22 production build and four desktop/mobile Playwright setup tests passed. A first setup run against the configured production build failed because public environment variables are fixed at build time. Running the setup suite against an explicitly unconfigured development instance passed. Separate anonymous browser checks against the configured production build confirmed login redirects and private no-store responses for sampled routes and JSON export on desktop and mobile. Inspected dashboard and login screenshots. Authenticated pages, invite/recovery, real TOTP, hosted RLS and private-data visual QA remain pending. npm audit reported zero known vulnerabilities.
- An approved direct Git read reached the GitHub URL successfully and returned no refs. The anonymous repository metadata endpoint returned 404. Both local repositories have zero commits and no staged files. A targeted scan of 57 source candidates found no common credential patterns or private artifact paths. Final repository visibility should be checked in authenticated GitHub metadata before pushing. Create the stable baseline after hosted verification, then request push approval. No push or public deployment occurred.

## Previous infrastructure work

- The supplied Supabase URL is in the ignored local environment file. The hosted Auth endpoint responded with the expected unauthorized status for a keyless request. The publishable key, hosted administrative access, fresh Hevy key and owner UID were unavailable at verification time. No hosted migrations, account creation, MFA enrollment or genuine workout imports were performed.
- Added a sync lifecycle migration and a read-only hosted schema check. Initial import now reconciles changes made during the scan. Both initial and incremental sync verify the live provider count before advancing the cursor. Sync rejects overlapping requests and applies a one-minute cooldown after each finished attempt. The 100-second request deadline still limits very large histories, and a count match alone does not establish record-by-record equivalence.
- Validated publishable/legacy anonymous key configuration and set Supabase server-managed session cookies to HTTP-only. Verified all three migrations locally, including eight RLS-protected tables, three invoker RPCs, two simulated users, MFA restriction, lease ownership, update idempotency and deletion cascades.
- TypeScript, lint, 14 automated tests, a Node.js 22 production build and four unconfigured desktop/mobile Playwright checks passed. The npm dependency audit reported zero known vulnerabilities. Real sign-in, hosted data isolation, template coverage and real-data pages remain pending.
- Prepared a separate ignored Git checkout at `.pgt-checkout` and configured the existing private repository as its `origin`. This leaves the workspace-root Git metadata protected. Both local checkouts have zero commits. A targeted scan of 56 candidate files found no common credential patterns, and Git ignores the local environment file and private export paths. This scan does not cover the inaccessible remote history. Fetch, history review, baseline commit and push require GitHub access and the user's approval before commit/push. No public deployment was created.

## Working milestone

- Initialized Next.js App Router with strict TypeScript and a responsive charcoal/lime interface. Added an explicitly empty setup experience, responsive navigation, keyboard search and three themes.
- Built functional private dashboard, training calendar, workout history and search, exercise library and detail routes, personal records, training analytics, front/back muscle regions and muscle routes, body measurements, basic goals, recap, integration settings and JSON export.
- Implemented Supabase session handling, admin-invite onboarding instructions, password reset, TOTP enrollment and verification, owner RLS and restrictive database MFA policy. Added two ordered migrations.
- Implemented owner-bound Hevy connection test and server-side manual workout/template sync with pagination, retries, local event updates/deletions and an expiring lease. Added idempotent same-source CSV import and transactional workout storage.
- Configured a Vercel build target without a public deployment. Created setup, architecture, design, calculation and security documentation.

## Verification

- Type checking, linting and all 10 unit and embedded PostgreSQL tests passed. Coverage includes volume, 1RM, bodyweight matching, records, timezone, muscle mappings, CSV IDs, pagination/retry and two-owner RLS/MFA authorization.
- The production build passed on Node.js 22. All four desktop/mobile Chromium cases passed against that build and dashboard screenshots were inspected. Running the server separately via PGT_E2E_BASE_URL avoided a Windows teardown hang. Browser fixtures exercise unconfigured routes. The embedded SQL tests simulate Supabase identity claims.
- npm audit reported zero known vulnerabilities for the resolved dependencies. This is one dependency check.
- The workspace did not contain a Git checkout. An empty local repository was initialized. Sandbox restrictions prevented updating its .git configuration, and the private remote could not be read with available Git authentication. No commit or push was made.

## Blockers to a verified private release

1. Configure a disposable Supabase environment, apply the migrations there and verify invite, email, password reset, TOTP, RLS and CSV against two real authenticated accounts.
2. Revoke the exposed Hevy key. Add a newly generated key and the owner ID directly to the excluded local environment file. Verify incremental reconciliation and import runtime with genuine workout data.
3. Reconcile source with the existing private GitHub history in an authenticated checkout. Then prepare a restricted Vercel preview and verify hosting and security before requesting approval for public deployment.

## Pending product scope

- Dashboard widget ordering and visibility, global content search, custom date ranges, chart zoom/export/comparison, and broader accessibility verification.
- Workout detail routes and comparison, richer exercise and muscle analytics, mapping overrides, plateau/variation analysis, and richer goals and completion history.
- Multi-user Hevy OAuth, webhook registration, scheduled and resumable sync, imported body measurements, and Basic-Fit manual/CSV visit fallback. No official Basic-Fit member API was verified.
- Friends, consent and comparisons, achievement cards, full Training Wrapped presentations and card exports, CSV personal export, self-serve account deletion, measurement privacy options, PWA, localization and broader production monitoring.
- Current route queries assemble full private histories, so peak performance and a large Hevy import are open validation items. Schema and sync behavior may need further refinement before a multi-user release.

The current deliverable is a working local milestone. Production readiness and the complete master-prompt scope remain open.
