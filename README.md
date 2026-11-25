# PERSONALGYMTRACK

Private workout and strength analytics. Without service credentials, the local app opens a setup workspace with empty charts and no synthetic workouts.

## Run locally

Use Node.js 22 and npm. In PowerShell:

```powershell
npm ci --cache .npm-cache
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open http://localhost:3000. Enter environment values directly in the excluded .env.local file.

## Connect Supabase

1. The target project ref is `clcrkpuajztuvyqrhnvu`. Before applying migrations, check its migration history and existing schema. With the authenticated Supabase CLI v3, run `supabase migration list --remote=clcrkpuajztuvyqrhnvu` and `supabase db push --remote=clcrkpuajztuvyqrhnvu --dry-run`. Confirm the three pending files and then run the push without `--dry-run` in your authenticated terminal. The MFA migration needs access to the managed auth schema. Keep the migration history intact if the project already contains tables or partially applied migrations.
2. Add the Supabase Project URL and the **publishable** API key from the project's Connect dialog as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The intended production project URL is `https://clcrkpuajztuvyqrhnvu.supabase.co`. Use separate development values for real testing.
3. Turn off public signup in Authentication settings. Set the Auth Site URL and allowed URLs to the approved app origins. Configure SMTP and use an admin invite from the Supabase Dashboard.
4. Configure the Supabase Invite and Reset Password email templates to send `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` and `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`, respectively. The app opens Settings for password setup. Confirm the existing-factor MFA experience before relying on recovery.
5. Run the read-only `supabase/tests/schema_check.sql` in the linked project's SQL Editor. Expect eight tables with RLS, owner and restrictive policies, no anonymous SELECT, and three invoker RPCs with authenticated access and no anonymous EXECUTE. Run `supabase/tests/isolation.sql` against a disposable instance.
6. Open the invitation in the same browser you will use for the local app. Set your password in Settings and enroll the authenticator. Sign out and back in to confirm TOTP is required. Use a separate invited test account and browser profile to verify that the second user sees an empty dashboard, while your original records remain available to your account. Verify the password reset flow before relying on it.

## Connect Hevy

Revoke the previously exposed key and generate a **fresh** API key in [Hevy Developer Settings](https://hevy.com/settings?developer). Enter it as `HEVY_API_KEY` in the ignored `.env.local`. In the Supabase dashboard, open **Authentication → Users**, select your invited account and copy its **User UID** into `HEVY_OWNER_ID`. It is the account UUID, distinct from the project ref and email address. Restart the development server, sign in as that account, then open **Integrations → Test connection → Sync workouts**. A successful sync checks the count of imported Hevy workouts against Hevy. Wait one minute between sync attempts. Use only one source per history to avoid double counting. Removing the two Hevy variables disconnects application access. Imported workouts stay in Supabase.

Hevy CSV works for workouts, sets and reps. CSV exports omit stable template IDs and exercise types, so imported exercises use a separate namespace and do not contribute to mapped muscle analytics, loaded volume or estimated 1RM. CSV wall times are interpreted in Europe/Amsterdam. Timestamps in a daylight-saving gap or overlap require an explicit UTC offset.

## Verification and deployment

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:PGT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run test:e2e
npm audit --cache .npm-cache
```

Omit `PGT_BROWSER_PATH` if Chromium has been installed through Playwright. Playwright runs the unconfigured setup pages and stores screenshots in the ignored test-results directory.

For version control, the sandbox-compatible checkout is `.pgt-checkout`, with the existing private GitHub repository configured as its `origin`. Authenticate through Git Credential Manager in your own terminal and verify remote access with `git -C .pgt-checkout ls-remote origin`. Fetch and audit the remote history before reconciling source changes. Leave local environment files, exports, downloaded data and tool caches out of the checkout and any commit.

For staging, use a Vercel project with Next.js, Node.js 22 and Frankfurt functions. Use separate Vercel environment variables for preview and production. Restrict preview access. Set server-side Hevy credentials in Vercel's encrypted environment settings. The app does not depend on cron. Review all gates in SECURITY.md before requesting public deployment approval.

Export personal data as JSON from Settings. For instance recovery, use Supabase's supported backup or dump mechanism and validate restores into a separate environment. Treat exports and database backups as sensitive. Document retention and test recovery before production. Account deletion is currently an administrator operation in Supabase Auth, with related records removed by database cascades.
