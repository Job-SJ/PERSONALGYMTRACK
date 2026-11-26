# Architecture

Next.js App Router serves private pages and server actions. Clients handle navigation, chart interaction, and barcode decoding. Supabase SSR refreshes session cookies through Next.js Proxy. The application checks each private session, and PostgreSQL applies owner-level row security and MFA enforcement for enrolled accounts.

## Data paths

- **Training.** The server reads workouts and exercise templates from Hevy after a manual sync request. It validates provider responses and updates workouts and their children in an invoker transaction per page. A lease covers the sync. Incremental runs use newest-first events and a five-minute cursor overlap. The cursor advances after local and upstream workout counts match.
- **Nutrition.** The app queries the public Open Food Facts API from the server. Diary entries carry a snapshot of the label and portion. Browser camera access is limited to the Nutrition route, and the decoder loads when scanning starts.
- **Analytics.** Server routes read the required data in paginated batches and calculate metrics before rendering. The browser displays native SVG charts and accessible data tables. Dates group in Europe/Amsterdam, mass uses kilograms, and body circumferences use centimeters.

## Runtime characteristics

Settings and integrations skip workout history queries. Nutrition starts independent queries together. Workout list rows link to a replay view for set-by-set detail. Most analytics still read the relevant private history in full, and Hevy sync has a 100-second application deadline.

See the [data model](data-model.md) for calculation rules and the [security audit](security-audit.md) for the scope of local verification.
