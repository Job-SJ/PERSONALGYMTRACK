# Architecture

- Next.js App Router serves private pages and form mutations. The client owns navigation and chart interactions. No third-party analytics run in the browser.
- Supabase SSR refreshes sessions through Next.js Proxy. Server pages and actions independently verify the authenticated user, and PostgreSQL enforces ownership and verified-factor policy.
- Hevy traffic originates on the server using GET only. The OpenAPI contract is validated at the external boundary. Workouts and their children update in one invoker transaction per page. A single-owner lease prevents normal overlapping sync requests. Initial import retries safely from page one. Incremental mode uses newest-first events, a five-minute cursor overlap and the latest event per workout ID per run.
- Charts use native SVG and readable chart-data tables. Period grouping uses Europe/Amsterdam. Mass is stored in kilograms and body circumferences in centimeters.
- Chart and history pages currently read paginated database batches and assemble analytics server-side. Request rendering and full imports need profiling with a realistic history before production. The sync deadline is 100 seconds. Large imports may require a resumable job.
- OAuth scopes, workout webhooks and body measurements are documented by Hevy. OAuth app review, secure per-user credential storage and webhook delivery have separate verification work. Scheduled sync is disabled. Vercel Hobby has limited cron scheduling precision and frequency. No supported Basic-Fit personal-data API was verified from official sources.

[Hevy API spec](https://developers.hevy.com/openapi.json) · [Hevy developers](https://developers.hevy.com/) · [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
