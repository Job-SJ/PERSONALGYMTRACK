# Maintainer release checks

## Repository settings

Use an active branch ruleset targeting the default branch. Require a pull request, at least one approval by someone other than the author, and passing **CI / Secret scan** and **CI / App checks** checks. Block force pushes and branch deletion. Keep bypass and direct write permissions limited to authorized maintainers. Select the exact check names from a completed GitHub Actions run. Confirm the rule is enforced before accepting outside contributions. [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)

Review who has write access under **Settings → Collaborators**. For fork PRs, use GitHub-hosted runners, require maintainer approval as appropriate, and keep write tokens and repository secrets unavailable. This repository runs fork CI via `pull_request`. Keep deployment credentials and deployment workflows separate from PR validation. [GitHub Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

Enable GitHub private vulnerability reporting where available, and verify that the channel in [SECURITY.md](../SECURITY.md) opens a private form. Enable secret scanning and push protection when available.

## Visibility preflight

- Scan an authenticated mirror of every branch, tag, and advertised pull-request ref. Review commit author metadata, historical documentation, screenshots, fixtures, issues, releases, and Actions logs and artifacts. Review anything made public by the visibility change.
- Verify revocation of any previously exposed credentials with the provider. Decide whether to publish historical author metadata and operational references. Confirm publication consent before any history or visibility decision that affects them.
- Confirm the public README, project license, and [third-party notices](../THIRD_PARTY_NOTICES.md). Keep production application release checks separate from publication of source code.
