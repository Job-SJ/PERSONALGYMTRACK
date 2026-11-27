# Security policy

## Report a vulnerability privately

Use **Security → Advisories → Report a vulnerability** on GitHub when private reporting is enabled. If the button is unavailable, ask the repository maintainer through a private channel for a secure way to share the report. Keep vulnerability details, credentials, and user records out of public issues and pull requests.

Include the affected version or commit, the impacted feature, a description of the issue and its impact, and steps to reproduce it with synthetic data. Share only the minimum evidence needed to triage the issue. We will coordinate disclosure after assessing the report and preparing any fix.

Reports are triaged against the current `main` branch. Test only against systems and accounts you own or are authorized to use.

## Threat model

Fitness history, notes, body measurements and email addresses are private. Threats include unauthenticated access, cross-account access, compromised sessions, key leakage and malformed source data.

## Implemented controls

- Supabase Auth owns credentials, email verification, session refresh and password reset. Invite-only access requires disabling public signup in project settings. TOTP verification is required after enrollment, including in database policy.
- Owner-based row-level security, composite foreign keys, explicit grants and security-invoker write RPCs enforce account isolation. MFA checks use the authenticated account and verify enrolled factors before server-side privileged operations. The optional credential vault, Coach and scheduler use a server-only Supabase key. The service-only tables and RPCs revoke direct access from browser and mobile roles.
- Server actions check authorization and validate input. Next.js validates action origin/host. Private responses request no-store. The app sets a nonce-based script policy and restrictive frame, referrer and browser capability headers. Inline styles are allowed for chart color variables.
- Hevy requests target a fixed HTTPS origin, use GET, reject redirects and enforce timeout and retry limits. The vault encrypts each key with AES-256-GCM and binds its authentication tag to the owning account, provider and key version. Keep keyring material separate from database backups.
- Coach uses explicit consent, fixed questions, bounded evidence, a pinned OpenRouter endpoint, Zero Data Retention, a pricing ceiling and a database-enforced budget. See [AI Coach privacy and usage](docs/ai-coach.md).
- Native requests use Supabase bearer sessions and the same assurance checks. Device notification registration uses validated endpoints and generic previews by default. Anonymous schedulers require a separate high-entropy job secret.
- CSV processing has body and file-size limits and validates parsed workout records. JSON export uses attachment and private cache headers. App logs should never include request bodies, user content, authorization headers, OTP tokens or full confirmation URLs.

## Before production

1. Apply and verify migrations in isolated Supabase. Test cross-user access and AAL enforcement using real Supabase JWTs and confirm Supabase's role ownership matches the migration assumptions.
2. Verify Supabase Auth rate limits, OTP lifetime, recovery flow with an existing factor, SMTP, allowed origins and disabled sign-ups. Add application-level quotas to import and sync routes before wider access.
3. Test initial Hevy import and subsequent update/delete events using a fresh key and explicitly approved test data. Review partial imports, clock skew, page movement and long histories.
4. Verify headers and session behavior on a restricted Vercel preview. Review infrastructure access, backup retention and redacted monitoring. Keep any external monitoring disabled until its data handling is configured.
5. Establish documented policies for data access and deletion, EU privacy review, incident response and hosting before enrolling external users.

Supabase stores records and manages identity. The hosting operator controls registration policy and infrastructure. Hevy supplies records during a user-initiated sync. OpenRouter receives a fitness summary when an opted-in account requests a Coach reply. Delivery providers process push registrations and payloads when users enable device notifications.
