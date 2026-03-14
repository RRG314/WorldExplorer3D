# Known Issues

Last reviewed: 2026-03-02

Current risks and follow-up items for this branch.

## High Priority

### 1. Cloud Functions Runtime Upgrade

Functions are still configured for Node 20 in repo settings.

Required:

- move to Node 22
- revalidate billing and webhook paths
- re-run rules/runtime/release checks after upgrade

### 2. Mirror Drift Risk (`app`, landing/account roots vs `public/*`)

Canonical runtime is edited in `app/*` and canonical landing/account roots live outside `public/*`, but deployment serves `public/*`.

Risk:

- behavior mismatch if mirror sync is skipped

Mitigation:

- always run `npm run sync:public` and `npm run verify:mirror` before deploy

## Medium Priority

### 3. External Geocoding Dependence

Custom location reverse lookup depends on external providers.

Risk:

- occasional timeout/rate-limit can degrade place naming quality

Mitigation:

- keep fallback naming path and local favorite-city fallback
- monitor for repeated provider failures

### 4. Local Firestore Offline Noise During Browser Automation

Some Playwright runs can surface Firestore offline warnings in local environments.

Risk:

- false-negative automation pass flags if logs are treated as strict failures

Mitigation:

- separate environment/network failures from functional assertions
- keep targeted feature assertions in reports

### 5. Stripe Environment Mismatch

Incorrect price IDs or webhook/secret values break donation flows.

Mitigation:

- verify all `WE3D_STRIPE_*` variables before deploy
- verify logs after checkout and webhook events

## Low Priority

### 6. Additional Mobile UX Polish

- tighter layout tuning in account/social cards for smaller screens
- optional hint text for advanced room rules

### 7. Post-Deploy Automation Coverage Expansion

- add automated smoke for signup -> create room -> invite -> accept invite path
- add automated verification of globe selector favorites delete behavior
