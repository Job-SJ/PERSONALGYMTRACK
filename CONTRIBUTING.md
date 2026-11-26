# Contributing to PERSONALGYMTRACK

## Open a pull request

1. Fork the repository on GitHub and clone your fork.
2. Create a feature branch from upstream `main`. Replace the placeholder with your account name before running these commands.

   ```sh
   git clone https://github.com/YOUR_GITHUB_USERNAME/PERSONALGYMTRACK.git
   cd PERSONALGYMTRACK
   git remote add upstream https://github.com/Job-SJ/PERSONALGYMTRACK.git
   git fetch upstream main
   git switch -c fix/short-description upstream/main
   ```

3. Use Node.js 22.x and run `npm ci`. Follow [the local setup](README.md#run-locally) and run lint, type checking, tests, and a production build before opening the PR.
4. Push your branch to your fork and open a pull request targeting upstream `main`. Explain what changed, how you verified it, and any impact on setup or existing data. Use synthetic records in examples and screenshots.
5. Address feedback on the same branch. Maintainers review changes and merge after the required checks pass.

CI runs lint, type checking, unit and database tests, a production build, and Gitleaks. It uses a GitHub-hosted runner with a read-only token, no production environment, and no repository secrets. Contributions to project-owned code are made under the [MIT License](LICENSE). Keep upstream notices with third-party material.

## Develop with isolated data

For UI work, start the app in setup mode with both Supabase values unset. Vitest's database suite creates embedded PostgreSQL instances and applies the checked-in migrations with synthetic owners.

For full sign-in and persistence, create a **separate development Supabase project** under your own account. Use its URL and publishable key in your ignored `.env.local`. Follow the [Supabase setup](README.md#set-up-supabase) to link the development project, check pending migrations, configure a localhost Auth Site URL, and invite synthetic test users. Before applying migrations, check that the CLI is linked to your development project. Use two test accounts when verifying ownership and no real fitness records. CI needs no Supabase or Hevy account.

For local database development with Docker, follow the [Supabase CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started) and run `supabase init` once and `supabase start`. Use the local API URL and publishable key from `supabase status`. Keep command output and local keys out of issues and PRs. Apply the repository migrations to the local stack using `supabase migration up` with a current Supabase CLI. Use your isolated hosted project if you need to test invite and recovery email configuration end to end.

## Keep your commit email private

Open [GitHub email settings](https://github.com/settings/emails), enable **Keep my email addresses private**, and copy the exact GitHub-provided noreply address. Set it for this clone before creating commits.

```sh
git config --local user.email "YOUR_GITHUB_NOREPLY_ADDRESS"
git config --local user.email
```

You can also enable **Block command line pushes that expose my email**. This config applies to future commits. Existing commits retain their original metadata. Your name is a separate Git setting. [GitHub commit email documentation](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)

Report vulnerabilities through the private channels in [SECURITY.md](SECURITY.md).
