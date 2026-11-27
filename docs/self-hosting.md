# Self-hosting

The Docker container runs the web app. Use a separate managed Supabase project for authentication and PostgreSQL.

Install Docker with Docker Compose and Node.js 22. Clone the repository and run the setup commands from its root.

```sh
git clone https://github.com/Job-SJ/PERSONALGYMTRACK.git
cd PERSONALGYMTRACK
```

1. Follow the README’s Supabase instructions in a separate development project first. Apply the migrations and disable public registration in Supabase Auth for an invitation-only instance.
2. Run `npm run setup` from a local interactive Node.js 22 terminal. The wizard checks Supabase Auth and the migrated schema, masks the server secret, generates the vault and scheduler keys, and creates `.env` exclusively. Existing configuration stays in place. On Windows, restrict the file's NTFS permissions to the operator. You can also copy `.env.example` to `.env` with `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux and macOS and set the variables manually.
3. Run `docker compose up -d`. Check `docker compose ps` and `curl http://localhost:3000/api/health`. This endpoint checks process availability. Verify database setup separately through the Supabase CLI migration list and a test account.
4. Put an HTTPS reverse proxy in front of port 3000 before accessing the app over the network. The Compose port binds to loopback by default. Preserve the public Host header and forward the HTTPS scheme. Set Supabase Auth Site URL and email confirmation links to the public HTTPS origin. Invite the first account through the Supabase dashboard.

For Caddy running on the host, point your DNS record at that host and use a configuration like this. Set a real domain you control before deploying.

```caddyfile
gymtrack.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

For an update, review and apply pending migrations through Supabase, then run `docker compose up -d --build`. To use a published image when one is available, set `PGT_IMAGE` to the release image tag, run `docker compose pull app`, then run `docker compose up -d --no-build`.

## Set up Supabase

1. Create a development Supabase project and install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). In a fresh checkout, run `supabase init` once from the repository root to create the CLI configuration. Then link the development project and inspect the migration plan.

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase migration list --remote
   supabase db push --dry-run --remote
   ```

   Once you confirm the target and pending files, run `supabase db push --remote`. The [migrations](../supabase/migrations) run in filename order. On an existing project, compare its migration history and schema before applying pending changes. See the [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

2. In Supabase Auth, disable public signup for an invite-only workspace. Set the Auth Site URL to the app origin you intend to open from email, such as `http://localhost:3000` for local testing. Configure allowed redirect URLs and email delivery for that environment.
3. In the Supabase [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), point the **Invite** and **Reset Password** links to the app's confirmation route.

   ```text
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
   ```

4. Invite yourself from **Authentication → Users**. Open the invitation in your browser, then set a password in **Settings** and optionally enroll an authenticator app. The workspace requires the authenticator code after enrollment. Open [localhost:3000/app](http://localhost:3000/app) after setup.

## Vercel preview

The repository includes a [Vercel configuration](../vercel.json) for Next.js functions in Frankfurt. For a restricted preview:

1. Import the repository into Vercel, choose the Next.js preset and Node.js 22.x, and enable Deployment Protection before sharing the URL.
2. Use a separate Supabase project for preview. Apply its migrations and set the environment variables for the **Preview** environment in Vercel.
3. Set the preview project's Supabase Auth Site URL and allowlist to the approved HTTPS origin. Verify invitations and recovery, MFA, isolation between two test accounts, and import and sync behavior before using real records.

[Vercel Git deployment](https://vercel.com/docs/git) · [Environment variables](https://vercel.com/docs/environment-variables) · [Deployment protection settings](https://vercel.com/docs/project-configuration/security-settings)

## Hevy credential storage

Apply the credential migration, then set `SUPABASE_SERVER_SECRET` to your project's server secret in the runtime secret store. Generate a random 32-byte base64url key on the administrator machine with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. Set `INTEGRATION_KEYS` to a JSON object mapping a version such as `v1` to the generated key. Set `INTEGRATION_ACTIVE_KEY=v1`. Keep the keyring separate from database backups. Anyone with both the database ciphertext and the keyring could recover the integration keys.

Users connect and test a masked Hevy key under **Settings → Integrations**. Disconnect deletes the stored ciphertext and leaves imported workouts available. Use a replacement key for the same Hevy account to preserve the meaning of the existing sync cursor and history.

For the legacy owner, leave the existing environment variables set while adding the vault. Sign in with the original Supabase user and choose **Re-encrypt current key** in Integrations. Test the connection, remove `HEVY_API_KEY` and `HEVY_OWNER_ID` from the runtime configuration, restart, and test again.

To rotate the vault key, add the new version while retaining the old version and switch `INTEGRATION_ACTIVE_KEY` to the new version. Each user can re-encrypt their current key after the switch. Verify all active envelopes and backup recovery requirements before retiring old key material. Rotate the Hevy key at Hevy if it may have been exposed.

## Registration

For public registration, enable email signup and confirmation in Supabase Auth, configure SMTP and provider-side Auth rate limits, and set `PGT_PUBLIC_REGISTRATION=true`. Configure the Supabase confirmation email link as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. For invite-only access, disable signup in Supabase itself and keep `PGT_PUBLIC_REGISTRATION=false`.

## Install on mobile

On iOS, open the HTTPS app in Safari, choose **Share → Add to Home Screen**, and open the new icon. On Android, open it in Chrome and choose **Install app** or **Add to Home screen** from the browser menu. The installed app requires a connection for private records. The service worker offers an offline screen and does not store authenticated responses.

## Notifications

Choose the scheduler option in the local setup wizard, or set `COMPOSE_PROFILES=notifications` and a random 32-byte `PGT_NOTIFICATION_JOB_SECRET` in `.env`. The companion container calls the app through the internal Docker network once a minute. On other hosting, schedule authenticated `POST /api/jobs/notifications` with `Authorization: Bearer <job secret>` over HTTPS. Keep the job secret separate from user and provider credentials.

For Web Push, generate VAPID keys locally with `npx --no-install web-push generate-vapid-keys`. Store the values in `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` and set `VAPID_SUBJECT` to a real `mailto:` or HTTPS contact. Restart the app and enable push from the notification center on each device. In-app scheduling also works without VAPID.

Categories start out disabled. Each event uses a daily or weekly duplicate key, local time and quiet hours. Accounts receive at most one push per local day. Push is best effort and the in-app inbox remains available. Device registration is capped at eight per account. Registered browser subscriptions are removed on sign-out when the browser can reach the service.

## Troubleshooting

- **Setup reports missing schema**. Verify the project in `supabase migration list --remote`, apply the missing migration in filename order, and retry after the Data API refreshes its schema.
- **Coach cannot find a model**. Confirm the OpenRouter key is an inference key, then retry model discovery. Catalog availability and compatible pricing change.
- **A reminder did not arrive**. Check the category, local time, quiet hours, worker health, device permission and VAPID credentials. iOS Web Push requires opening the installed app from the home screen.
