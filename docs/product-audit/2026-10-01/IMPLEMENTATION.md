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

## P02 — missing bathymetry and coverage: implemented and focused checks passed

Both local and global interpolation reject null, nonnumeric and nonfinite contributing samples. Exact valid nodes/edges remain usable beside missing cells. Sampling beyond the grid returns unknown instead of stretching the last row/column. Removed the rounded cache that reused a sampled edge outside coverage. A late request cannot publish into a replacement session, even at the same coordinate. Debug text now exposes the actual seabed evidence and procedural fallback.

- Combined entry/bathymetry/maritime component batch: 15 passed, including missing corners, malformed samples, local and global bounds, stale cache, complete interpolation, provider outage and same-coordinate session replacement.
- Source check passed.
- Extended real-source browser journey: all prior P01 cases plus admitted ocean with subsequent GEBCO outage; unknown depth evidence, procedural collision and submarine movement verified; 6 cases, zero page exceptions. Provider failure is deliberately injected.
- Outage gameplay screenshot and rerun prescribed-client menu screenshot inspected. Prescribed client still has the known local uncredentialed AppCheck limitation; no authenticated-service claim.

## P03 — sampled seabed map: implemented and focused checks passed

Removed decorative sine-wave contours. The map now samples the collision seabed and draws 10 m gameplay contours with a north-up heading marker, scale bar and working zoom. Geographic missing-data areas are hatched, and modeled depth/datum are separate from simulated player depth. Submarine depth now uses the same world-unit conversion as its speed. The evidence sampler and collision sampler now use the same blend in both readiness states.

Raster generation is cached and bounded to five updates per second while moving, reusing its canvas; marker movement is continuous. Provider/grid/site/zoom changes invalidate it immediately. Pointer zoom returns keyboard control to the game; keyboard activation retains accessibility focus. Clicking the ocean map gives its instructions instead of opening Earth map/teleport actions. A full-screen ocean chart is still a future capability, not an Earth chart presented as ocean navigation.

Evidence:
- Combined ocean/maritime focused batch: 20 passed.
- Full registered current-contract suite: **1,600 passed; zero failed/skipped/TODO**. Component/source evidence, not full release certification.
- Real-source browser journey: 7 cases passed, zero page exceptions; map zoom, actual turn heading, depth labels, collision/evidence agreement, wrong-Earth-map prevention and outage representation added to P01/P02 regression checks. Provider responses remain controlled fixtures.
- Prescribed develop-web-game client against `tests/fixtures/ocean-navigation-map.html`: real map and seabed modules, partial missing-data grid, movement/turning, screenshot and text state inspected; no client error file. This isolated visual check supplements the actual application journey, not a substitute for it.
- Source check passed after cache identity updates: 1,226 JS files parsed; no missing or duplicate module identities.
- Gameplay map, zoom/heading, outage and isolated mixed-coverage screenshots inspected.

## Next

P04–P05 are now implemented below. P06–P20 remain pending; the research ship, swimming/diving and asset upgrades have not been implemented by these foundation fixes. No production deployment has been performed.

## P04 — capability inventory and player guidance: implemented and focused checks passed

Quick Start now has a searchable capability guide backed by the same 98-entry registry as [CAPABILITIES.md](CAPABILITIES.md) and [capabilities.json](capabilities.json). It covers main worlds/travel, creation/progress/account surfaces and every current route-template, discovery activity/tool and Live Earth layer. Each entry declares scope/status, runtime owner, persistence boundary and acceptance limits; JSON retains 36 owner-source hashes. This is descriptive ownership metadata, not a replacement permission or save authority.

Corrected virtual dive tool/activity and Marine Surveyor descriptions, submarine entry/help copy, and explicit boundaries for swimming, research ship deployment, local versus connected progress and reference ship tracks. Available status does not claim every device or location is certified; source-only evidence is identified rather than upgraded to a test pass.

Validation: 20 focused capability/discovery/character component tests passed; source check passed; actual Quick Start desktop and 390×844 touch-context search/filter/empty-state/layout checks passed with zero page exceptions. Prescribed-client capability presentation fixture passed without client errors. Desktop, phone and fixture screenshots inspected. Evidence: `output/verification/product-plan/`.

Next: P05, objective/navigation coherence. Production remains `5.4.0+1532bdfbb5c1.319d215f60318297.production`, freshly read October 2. No deployment.


## P05 — current objective and navigation coherence: implemented and checked

Current guidance is scoped to the active world, so retained pod/expedition history cannot publish space instructions on Earth or in the ocean. Current Solar System and deep-space courses outrank inactive voyage history; active transit retains priority. Surface fieldwork and returned analysis use the destination mission's actual objective and open that mission. Earth movement onboarding does not suppress space guidance. Activity-owned HUDs keep priority.

Dismissal and brief-notice timing now follow objective identity rather than changing distance text. Reviewing a finding no longer uses a button that implies it saves the finding. Completed reports retain zero scores and never invent a default 100 points. Read-only diagnostics expose the derived objective for verification. Wayfinder now reads the active Solar System travel session rather than contradicting its HUD with “No course set.” Existing Explore/Build/Together and game entry paths remain.

Validation: all **1,613 registered component tests passed**, no failed/skipped/TODO; source verification passed. Actual-source Space launch, Mars/Moon destination changes, dismissal, retained-completion fixture, action opening and Wayfinder course agreement passed with zero page exceptions. Screenshots inspected. Prescribed-client isolated objective fixture passed, screenshot/state inspected and no error artifact. Evidence: `output/verification/product-plan/`. The browser initially exposed a Wayfinder contradiction; it was repaired and the journey rerun successfully.

Limits: no new mission, save authority, landing eligibility or physical-phone certification. P13 retains the deeper travel/landing work. P06 save/reward consistency is next. Production and preserved dist unchanged.


## P06 — local profile consistency repaired; account/reconciliation work remains

Replaced stale whole-profile preference writes with synchronous updates inside the latest profile transaction. This protects earned progression during tool, tutorial and companion updates; companion encounters merge against current storage. Memory-store stable-key validation now matches IndexedDB. See [SAVE-CONTRACT.md](SAVE-CONTRACT.md) for actual persistence boundaries and the remaining ordered gates.

Validation: **1,616 component tests passed**, zero failed/skipped/TODO. Final focused save/starter/character and source checks passed after encounter merging. Two real browser IndexedDB tabs verified duplicate claims, concurrent preference updates, reload, backup replay and idempotent legacy migration with a retained backup (20 records, zero page exceptions). Prescribed-client storage fixture passed and screenshots inspected. Actual-source Space regression rerun passed. These are controlled local records, not authenticated account or cross-device certification.

P06 remains open: durable account-scoped retries, paginated hydration, receipt association and cross-store recovery require implementation/verification. P07–P20 have not been started. No production deployment, backend change or player-data migration.
