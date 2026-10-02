# Sequential implementation evidence

Baseline: `1532bdfbb5c11e002d278b058d1ebdba88384f60`, active worktree `architecture-evaluation`, branch `steven/visual-quality`. Production is unchanged. Audit documents describe the baseline, not the repaired state.

## P01 — ocean entry eligibility: implemented and focused checks passed

Selected coordinates now require modeled submerged-elevation evidence before launch. Land, shallow water, unknown/provider failure and polar entry are rejected with a recoverable message. Reverse-geocoded names alone cannot admit water. Entry is pinned to the exact selected coordinates and checked again by the ocean runtime before replacing a session. Existing mapped-water boat entry retains its existing offshore-clearance policy; the curated no-coordinate reef entry remains explicit in the runtime. Shared/title launches also validate coordinates. Asynchronous starts are awaited.

The browser test exposed an additional bug: late lookup rendering erased manual coordinate edits. Dirty edits are now retained, and the pending launch is rejected. Lookup cache keys no longer group nearby coastal coordinates into a rounded cell.

Evidence:
- `node --test --test-concurrency=1 tests/ocean-entry-current.test.mjs tests/maritime-sandbox-current.test.mjs`: 9 passed.
- `node scripts/verification/ocean-entry-current.mjs`: actual source application UI, land rejection, provider outage, edit-during-request, valid coastal entry, submarine movement assertions, unchecked runtime rejection retaining active session; 5 cases passed, zero page exceptions. Provider responses are fixtures, not live-service validation.
- Prescribed develop-web-game client: title/globe screenshot inspected. Local Firebase AppCheck reCAPTCHA errors were recorded in this uncredentialed client; it is not an authenticated-service pass. No page exception reported by the journey runner.
- `npm run verify:source`: passed; 1,225 JavaScript files parsed, no broken module links or duplicate identities.
- Screenshots inspected: stale selection, coastal arrival/movement and prescribed client menu. Evidence under ignored `output/verification/ocean-plan/`.

Limits: GEBCO is a coarse modeled elevation source, not a coastline survey or navigation guarantee. Regional scientific fidelity, swimming, ship launch/recovery transactions, and visual replacement remain later items. This is not production release certification.

## Next

P02: preserve missing bathymetry cells and coverage bounds. Do not start P03 until its component and browser checks pass.
