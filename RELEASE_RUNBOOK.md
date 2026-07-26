# World Explorer 3D Release Runbook

This runbook is the required release path. Production Hosting is changed only by the explicit promotion command after the candidate has passed every gate and received deployment approval.

## 1. Prepare one clean commit

Confirm the release version is consistent and the worktree is clean:

```bash
npm run test:release-version
git status --short
git rev-parse HEAD
```

Production artifacts cannot be built from a dirty worktree. Do not edit `dist/`; it is generated and ignored.

## 2. Run the release gate

```bash
npm ci
npm run release:verify
```

The gate builds a production-configured artifact, verifies its hashes before
testing, runs the complete acceptance suite, then deterministically rebuilds
and verifies the production artifact after any test-owned staging build.
Record the final `buildId` from `dist/build-manifest.json`.

The manual GitHub `Full Release Verify` workflow performs the same gate and retains the verified `dist/` artifact for 30 days. Its artifact name is derived from `package.json`.

## 3. Deploy an isolated release candidate

Choose a unique channel containing the version and short commit:

```bash
npm run preview:release-candidate -- release-400-COMMIT
```

This deploys to a preview channel inside the production Firebase project but does not change the live site. Record the exact preview URL returned by Firebase.

Run the staging-only account-retention and operational endpoint checks against an equivalent staging candidate. Never point destructive retention tests at production.

## 4. Accept the candidate

On the exact candidate URL, verify:

- `build-manifest.json` has the expected `buildId`, commit, production environment, and production project.
- Desktop and mobile critical journeys pass without fatal console errors.
- Representative dense city, mountain, desert, water, bridge, tunnel, Moon, Mars, space, editor, and multiplayer flows pass.
- Provider-outage fallback, authentication, account deletion, privacy cleanup, and operational health checks pass in their authorized non-production environments.
- The release notes, known issues, rollback build ID, and responsible release operator are recorded.

Do not promote while any required gate is skipped, flaky, or unexplained.

## 5. Snapshot and promote

First perform a read-only dry run:

```bash
npm run preview:promote -- release-400-COMMIT \
  --preview-url https://EXACT-PREVIEW-URL.web.app \
  --dry-run
```

After explicit deployment approval, rerun without `--dry-run`. Promotion first clones the current live release to the `rollback` channel, then clones the verified candidate to live:

```bash
npm run preview:promote -- release-400-COMMIT \
  --preview-url https://EXACT-PREVIEW-URL.web.app
```

Record the previous and new build IDs printed by the command.

## 6. Post-release verification

Fetch the live no-store manifest and confirm the expected build:

```bash
curl --fail --silent --show-error \
  https://worldexplorer3d-d9b83.web.app/build-manifest.json
```

Repeat the critical smoke journey on the live custom domain. Monitor fatal client errors, function errors, latency, account flows, and multiplayer joins.

## 7. Roll back

Use the exact rollback-channel URL reported by Firebase and the recorded previous build ID. Verify first:

```bash
npm run preview:rollback -- \
  --expected-build-id PREVIOUS_BUILD_ID \
  --rollback-url https://EXACT-ROLLBACK-CHANNEL-URL.web.app \
  --dry-run
```

After rollback approval, run the same command without `--dry-run`. The command refuses a channel whose production project or exact build ID does not match.

After rollback, verify the live manifest and critical journey again. Preserve logs and open an incident record before attempting another promotion.
