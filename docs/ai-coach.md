# AI Coach

Coach is optional. The deterministic dashboard, training analytics and adaptive nutrition work independently.

1. Ask the instance administrator to apply the Coach migration and set up the [credential vault](self-hosting.md#hevy-credential-storage).
2. Create an [OpenRouter inference key](https://openrouter.ai/settings/keys). Set a provider-side credit cap. Disable prompt and response logging, prompt sharing and any observability exports that record content in the OpenRouter workspace. An administrator may provide a separate capped instance key using `OPENROUTER_INSTANCE_KEY`.
3. Open **Coach**. Choose the key source, enter a personal key if needed, then test the connection. The app saves a new key after testing it. It never returns a stored key to the browser.
4. Choose a model and hosting endpoint. Review free or paid pricing, required Zero Data Retention, supported parameters and the monthly USD budget. A zero budget works for eligible free endpoints. Grant consent and enable Coach.
5. Choose a question about strength, bench press, nutrition, goals, a recent period, or the next training session. Coach shows answers and a monthly usage summary. You can cancel a request.

The app queries OpenRouter's current Zero Data Retention endpoint catalog, pins the approved model and endpoint, requires `zdr` and `data_collection: deny`, disables fallback and caps pricing per token. An unavailable or changed model requires reviewing settings. OpenRouter workspace settings and its own metadata and retention policies remain relevant. The inference API does not expose a way for GymTrack to audit your workspace's logging configuration. [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection) · [Zero Data Retention](https://openrouter.ai/docs/guides/privacy/zdr)

The model receives a fixed question and bounded structured evidence, such as dates, workout counts, estimated strength and averages for completed nutrition days. Free-form notes, names, labels, credentials and internal identifiers stay in GymTrack. The model has no access to tools, database queries or account actions. Exercise-specific summaries use a small catalog of canonical exercise names. Account settings and goals change only through the app's own controls.

Budget reservations and a cooldown are enforced in the database per user. An interrupted or invalid upstream response may keep its estimated reservation until the next UTC month. The provider-side key limit is the external billing backstop. Administrators who share an instance key should set an aggregate provider cap before enabling it.

Use **Coach settings** to test or replace a key, change the model, withdraw consent, remove the personal key or delete conversations. Deleting conversations removes stored answer text and preserves non-content billing counters. OpenRouter's handling of prior requests and your Supabase backup retention are governed by their respective settings and policies.
