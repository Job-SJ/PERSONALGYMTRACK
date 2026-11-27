# Self-hosting

The Docker container runs the web app. Use a separate managed Supabase project for authentication and PostgreSQL.

1. Follow the README’s Supabase instructions in a separate development project first. Apply the migrations and disable public registration in Supabase Auth for an invitation-only instance.
2. Copy `.env.example` to `.env` with `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` on Linux and macOS. Fill the Supabase URL and publishable key. Keep the file readable only by the operator and container runtime.
3. Run `docker compose up -d`. Check `docker compose ps` and `curl http://localhost:3000/api/health`. This endpoint checks process availability. Verify database setup separately through the Supabase CLI migration list and a test account.
4. Put an HTTPS reverse proxy in front of port 3000 before accessing the app over the network. The Compose port binds to loopback by default. Preserve the public Host header and forward the HTTPS scheme. Set Supabase Auth Site URL and email confirmation links to the public HTTPS origin. Invite the first account through the Supabase dashboard.

For an update, review and apply pending migrations through Supabase, then run `docker compose up -d --build`. To use a published image when one is available, set `PGT_IMAGE` to the release image tag, run `docker compose pull app`, then run `docker compose up -d --no-build`.

## Hevy credential storage

Apply the credential migration, then set `SUPABASE_SERVER_SECRET` to your project's server secret in the runtime secret store. Generate a random 32-byte base64url key on the administrator machine with `node -p "require('node:crypto').randomBytes(32).toString('base64url')"`. Set `INTEGRATION_KEYS` to a JSON object mapping a version such as `v1` to the generated key. Set `INTEGRATION_ACTIVE_KEY=v1`. Keep the keyring separate from database backups. Anyone with both the database ciphertext and the keyring could recover the integration keys.

Users connect and test a masked Hevy key under **Settings → Integrations**. Disconnect deletes the stored ciphertext and leaves imported workouts available. Use a replacement key for the same Hevy account to preserve the meaning of the existing sync cursor and history.

For the legacy owner, leave the existing environment variables set while adding the vault. Sign in with the original Supabase user and choose **Re-encrypt current key** in Integrations. Test the connection, remove `HEVY_API_KEY` and `HEVY_OWNER_ID` from the runtime configuration, restart, and test again.

To rotate the vault key, add the new version while retaining the old version and switch `INTEGRATION_ACTIVE_KEY` to the new version. Each user can re-encrypt their current key after the switch. Verify all active envelopes and backup recovery requirements before retiring old key material. Rotate the Hevy key at Hevy if it may have been exposed.

## Registration

For public registration, enable email signup and confirmation in Supabase Auth, configure SMTP and provider-side Auth rate limits, and set `PGT_PUBLIC_REGISTRATION=true`. Configure the Supabase confirmation email link as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. For invite-only access, disable signup in Supabase itself and keep `PGT_PUBLIC_REGISTRATION=false`.

## Install on mobile

On iOS, open the HTTPS app in Safari, choose **Share → Add to Home Screen**, and open the new icon. On Android, open it in Chrome and choose **Install app** or **Add to Home screen** from the browser menu. The installed app requires a connection for private records. The service worker offers an offline screen and does not store authenticated responses.
