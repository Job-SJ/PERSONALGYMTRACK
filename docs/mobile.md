# Mobile development

The Expo project is in `mobile/`. It uses the same Supabase account and the web app's HTTPS API. It supports email/password, existing TOTP challenges, TOTP enrollment and PKCE password recovery. New accounts can accept an invite or register through the web application, then sign in natively.

## Run the app

Use Node.js 22.x, an Android emulator or device, or an iOS simulator or device. The iOS simulator requires Xcode and macOS. Use an isolated Supabase project with all migrations and a matching web app.

```sh
cd mobile
npm ci
```

Copy `.env.example` to `.env.local` with `Copy-Item .env.example .env.local` on PowerShell or `cp .env.example .env.local` on Linux and macOS. Set:

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project's Connect dialog. The native app accepts a Supabase publishable key.
- `EXPO_PUBLIC_PGT_URL` to the matching HTTPS app origin. On an Android emulator a development server can be reached at `http://10.0.2.2:3000`. Use `http://localhost:3000` on an iOS simulator with the server on the same Mac.
- `EXPO_PUBLIC_EAS_PROJECT_ID` only when testing remote native notifications.

```sh
npx expo start
npm run typecheck
npm run build:verify
```

Use a matching Expo Go version for password sign-in and browsing, or build a development client on a configured machine with `npm run android` or `npm run ios`. Use the development client for deep links and remote notifications. Bundle verification exports JavaScript and assets. Native signing, APK/IPA assembly and store submission use the platform toolchains.

## Password recovery

Add `personalgymtrack://auth/confirm` to the isolated Supabase project's redirect allowlist. Keep the existing browser recovery path by adding a branch to the Supabase Reset Password email template.

```html
{{ if eq .RedirectTo "personalgymtrack://auth/confirm" }}
  <a href="{{ .ConfirmationURL }}">Reset password in PERSONALGYMTRACK</a>
{{ else }}
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password in your browser</a>
{{ end }}
```

Request and complete the reset on the same native installation so the PKCE verifier is available. Use verified HTTPS app links for a branded store deployment with a controlled domain. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

## Native notifications

In `mobile/`, run `npx eas-cli init` to link your own EAS project, `npx expo install expo-dev-client` to add the development client, then `npx eas-cli build:configure`. Create a development profile with `developmentClient: true` and `distribution: "internal"`. Configure Android FCM v1 and iOS APNs credentials in EAS. For Android, set `expo.android.googleServicesFile` to your local `google-services.json`.

Run `npx eas-cli build --profile development --platform android` or the equivalent with `--platform ios`, install the signed build, and enable device notifications in **Settings**. Choose categories and check-in hours in the web notification center. Enable delivery on the server with `EXPO_PUSH_ENABLED=true` and configure `EXPO_PUSH_ACCESS_TOKEN` if your Expo project uses enhanced push security. Native previews are generic. Verify registration and delivery on a test device before using live accounts. [Expo notification setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)

Keep EAS, Apple, Google, provider and database administration secrets in their respective secret stores. The app bundle should contain only public configuration. Session data is stored in the device keychain or keystore, and private workspace data is fetched on demand.
