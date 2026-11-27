# Release verification

Automated checks use synthetic records and mocked upstream responses. The embedded PostgreSQL tests apply the migrations and verify grants, owner isolation, MFA, budget reservations and reminder deduplication. Production Chromium tests use a loopback Supabase fixture for authenticated web and native API requests. OpenRouter tests use mocked HTTP responses.

GitHub validated a clean Node.js 22 install, 59 unit and database tests, 26 Chromium tests, Android and iOS Hermes exports, both dependency audits, and Gitleaks. The Docker smoke test built the production image, verified its non-root runtime, and served the health endpoint and PWA manifest. [Implementation CI run](https://github.com/Job-SJ/PERSONALGYMTRACK/actions/runs/46077745533)

## Dashboard comparison

Compared the v2 foundation commit `e357483` with the completed dashboard and navigation changes. Both used production web builds, the same loopback Supabase fixture and the same synthetic account. Desktop Chromium alternated between builds, discarded three warm-up navigations per build and recorded 15 navigations each. Service workers were blocked for this comparison.

| Median | Foundation | Updated dashboard |
| --- | ---: | ---: |
| TTFB | 14 ms | 13 ms |
| DOMContentLoaded | 59 ms | 75 ms |
| Encoded document body | 25,074 B | 26,009 B |

The result covers one local fixture and does not estimate hosted response times or low-end device performance. Coach's dashboard preview adds no database query. Provider requests and the conversation UI load on the dedicated Coach route.

## Operator activation checks

- Apply the migrations to a separate Supabase project and verify email invitations, recovery and MFA with synthetic accounts. Verify the local setup wizard against that project's Auth policy and Data API.
- Connect an isolated Hevy account and verify initial sync, update and deletion events.
- Test a capped OpenRouter inference key under the intended workspace privacy settings. Confirm an eligible model completes a question and reports usage, then disable Coach and delete its history.
- Test Web Push on Android and installed iOS Safari. Test Expo push, TOTP and same-device PKCE recovery on a signed development build. Verify quiet hours, preview settings, sign-out, and stale device registration behavior before wider use.
