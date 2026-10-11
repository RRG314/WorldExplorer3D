# Research vessel interior delivery

October 11, 2026. Local work; production remains the released 5.5 build.

## Owner request and acceptance boundary

Replace the exposed deck workstations with a coherent ship players can walk
through. Include a galley, science and crew spaces, a real bridge connection,
and a ship map comparable in purpose to the spaceship map. Preserve submarine
custody, research progress, the working deck and swimming. The owner will test
before approving production.

## Design basis

The licensed RCRV model is Oregon State University Extension Service / Alan
Dennis, CC BY 4.0. Oregon State's [design documents](https://ceoas.oregonstate.edu/regional-class-research-vessel-ship-design)
and [principal equipment](https://ceoas.oregonstate.edu/sites/ceoas.oregonstate.edu/files/2024-07/rcrv-particulars.pdf)
distinguish working deck, wet and main labs, scientific storage, meeting space
and accommodation. We use that functional separation. The interior, stairs,
scale and gameplay placement are an authored game adaptation, not an exact
replica of Taani or a certified marine layout.

## Implemented arrangement

- Main deck: wet lab with sink and live regional-condition display; dry lab;
  galley with fixed cabinetry, sink and cooktop; mess/lounge. Central passage
  connects the stern entrance to the internal companionway.
- Three pairs of physical stair flights connect the main deck, intermediate
  landing, crew deck and bridge. No room teleport or invisible floor authority.
- Crew deck: quarters and briefing room. Bridge: helm and chart workstation.
- Working deck: submarine cradle and dive ladder retain their locations.
- Ship map: deck tabs, named stations, current position and walking route;
  native modal focus, close/Escape, phone layout and input lock while open.

The wet-lab briefing/scans/report remain owned by marine research and the
Journal. The galley consumes carried snacks/water using the same Backpack and
condition consumer as Earth. No new food, health or reward store. Mess/dry lab
open the existing Journal; briefing opens the existing Field Guide; quarters
use the existing surface-voyage checkpoint. Rooms do not invent survival meters,
crew tasks, survey evidence, currency or supplies.

## Construction and lifetime

`interior-plan.js` defines deck/station/room identity, connection graph and
licensed hull cuts. `scripts/build-research-interior-hull.mjs` reproducibly cuts
only the adapted playable volume and openings from the retained licensed source
GLB. The original exterior model and LOD are kept; derived provenance records
both hashes. Geometry and UV attributes are retained during clipping.

The exact rendered hull, sole plates, bulkheads and treads feed the ship-local
triangle index. Furniture uses bounds measured from its loaded geometry.
Published catalog models and the existing licensed ship surface library supply
furnishings/materials. Galley cabinetry, stairs and partitions are authored
architectural meshes. Every lease, texture, geometry, material, UI and pending
load is owned and released by the existing vessel/session lifecycle.

The geometry gate caught an over-budget first attempt at exact furniture
triangles. Measured furniture envelopes keep navigation near the previous hull's
triangle count. Walking queries stay local to the existing spatial grid. Routes
use a small connection graph and cached shortest-path fields; map rendering is
throttled and only runs while open. At most three nearby interior lights run.

## Evidence and remaining verification

- The full furnished mesh admits every station. All authored graph edges have
  been walked in both directions by the triangle controller in browser probes.
- Browser iteration 1 found an inherited header rule covering phone map tabs.
  Scoped map layout fixes it. Iteration 2 found a delayed modal-close notification
  retaining movement lock inside a same-task controller test; close now releases
  the lock synchronously as well as handling native Escape.
- Visual review corrected stretched UVs and a bridge camera pushed into the
  avatar. Tight rooms now use an unobstructed eye-level view with hysteresis.
- Current journey, source and packaged evidence will be entered after completion.
  Probe success is not a substitute for the full application journey or a release
  matrix. No production readiness claim is based on these probes.


### Earlier assembled-app evidence

The full app survey journey passed 8 cases at
`output/research-interior-20261011/full-app/browser.json`: actual interior briefing,
deploy, first-scan reload, partial recovery/redeployment, three scans, lab report,
Scanner II and a follow-up using its range, with desktop/phone ocean controls.
No page errors or local HTTP failures. Local reCAPTCHA warnings remain explicitly
outside this controlled-provider journey's attestation scope.

Focused source checks pass 21 tests. The furnished fixture's 18-case journey
passed at `journey-3`; subsequent visual review fixed a coplanar display frame and
added inner accommodation lining. `journey-4` reached all 18 journey cases but
failed final disposal: a later animation frame recreated the already-disposed
HUD. The deck controller now rejects updates/entry after disposal; a source
regression verifies that terminal state. The final fixture rerun subsequently passed; see the final checks below.

The prior habitat gate's environmental HTTP 503s were emitted intentionally by
`scripts/place-lookup-preview.mjs` because no local Functions origin was configured.
They were not proof of a live provider outage. Controlled gameplay gates now
install explicit weather/marine fixtures and retain separate provider acceptance.

### Final source and furnished-vessel checks

Full `verify:pr` passes **2,455 tests**, including dependency, module identity,
ownership, boundary types, runtime names, inventory and mutation sensitivity.
Receipt: `/tmp/we3d-research-interior-full-source-final.log`. The first full run
caught a furnishing test limited to Sketchfab; it now also verifies the exact two
reused Poly Haven sources and their CC0 licenses without weakening model budgets.

`output/research-interior-20261011/final-fixtures/` passes the existing **11-case**
deck regression and new **18-case** interior journey. All 55 graph connections
are traversable in both directions with furnishings loaded. The final disposal
check passes, model leases return to zero and no ship map survives. The measured
95th-percentile movement/camera query is about 0.1 ms in this controlled fixture;
this is not a whole-game frame-rate or phone performance measurement. Screenshots
were inspected, including the galley, phone map and reduced-light wet lab.

The original GLB and its license are retained. The ship map is a simplified game
arrangement, not a navigational chart. The separate bridge chart opens the actual
world map. Shipboard food must already be carried in the Backpack. Engine-room
simulation, cooking recipes and a full crew-management game are not implemented
or advertised by this delivery.

The expanded full-app journey passes **16 checks** at
`output/research-interior-20261011/full-app-rooms/browser.json`, including the
survey loop, actual Journal/Guide panels and pause, quarters save, world chart,
ship map on desktop/phone, carried provisions and surface reload followed by
walking to the helm. No page errors or local HTTP failures. This run uses
controlled environmental providers and retains local AppCheck warnings; ordinary
hosted attestation is a separate acceptance class.

### Review package

Candidate: `5.5.0+fcb8c70305f1.83820089a4eff4ba.staging`, in
`output/hosting-validation/research-ready`. All seven selected gates pass:
capabilities, marine habitat, marine research/rooms, diving, local marine entry,
weather/location UI and artifact integrity. Receipt:
`/tmp/we3d-research-interior-ready-gates.log`. Their component/provider scope
remains explicit; this is not the entire production release matrix.

Continuous-ocean/fallback acceptance passes **11 cases** at
`output/research-interior-20261011/continuous-final/report.json`. It verifies
geographic rebasing, nine-tile residency, resource plateau, outage handling,
remote reload, diver reboarding and same-parent recovery. The old released save
is preserved byte-for-byte. The actual retained d877 staging package can resume
and write its old voyage; the new candidate subsequently reads that write and
can resume its retained continuous voyage.

The licensed-fish extension passes **28 local-entry cases** at
`output/research-interior-20261011/packaged-fish/entry-browser.json` on identical
game bytes. Four regional visits check modeled ranges, real asset movement,
detachment, exactly-once disposal and bounded renderer resources. These are
controlled ecology/depth inputs, not live animal observations.

Verification repairs were necessary: two older checks expected the retired deck
chart/instant helm, and a diagnostic tried importing development-only files from
the bundle. They now walk the current ship and inspect actual runtime ownership.
One runner completed gameplay but retained its Playwright control connection;
explicit client disconnect before closing its owned browser server fixes shutdown.
The stopped runner is retained as failed execution evidence, not a passing gate.
No app behavior was changed by these verifier repairs. All final manifest payload
files are byte-identical to the initial passing ship package; see
`final-payload-parity.json` in the delivery evidence folder.

Review preview (expires October 18):
https://we3d-staging-20260712--ship-review-1011-pb8x1l4l.web.app/
Production is unchanged. User approval is still required before promotion. Wider
facility, creative, career and visual-realism roadmap work remains open; this
ship/ocean delivery does not complete those separate milestones.


### Preview host and artifact housekeeping

The initial hosted run completed all four room/map journeys but received HTTP 401
from marine and reverse-place endpoints. An ordinary user-profile Chrome session
confirmed the AppCheck reCAPTCHA failure; it was not dismissed as automation noise.
The exact new preview hostname was absent from staging's reCAPTCHA domain list.
It was registered using a field-specific update; existing domains, enforcement and
production settings are unchanged. Receipt: `preview-domain-registration.json`.
The [Google Cloud key-update reference](https://docs.cloud.google.com/recaptcha/docs/reference/rest/v1/projects.keys/patch)
describes the scoped update mask. Every future new preview hostname needs this
configuration check before ordinary hosted provider acceptance.

Generated validation roots `ocean-482`, `research-39bf` and `research-review` were
retired only after full content-hash verification and confirming their commits
are ancestors of the current checkout. Both manifests and a receipt for each are
under `output/research-interior-20261011/retired/`. The final `research-ready`
package, production `dist`, all four saved packages, source/history and player
records are retained.


### Offshore place-name repair found by hosted acceptance

Once the domain change propagated, all hosted ship checks completed and AppCheck
401s stopped. The stricter all-network check then failed on one reverse-geocoder
502. A direct, bounded diagnostic at the public Coral Shelf coordinates returned
HTTP 200 with `Unable to geocode`. Nominatim's [reverse API documentation](https://nominatim.org/release-docs/latest/api/Reverse/)
identifies no-coverage coordinates as a normal possible result; ocean coordinates
need not have a street/city address.

The gateway now recognizes only that specific no-coverage result (200 or 404),
returns an empty place object and caches it for one day. Existing coordinate/name
fallbacks remain in charge; no fabricated address or water classification is
introduced. Other failures, throttling and malformed coordinates still fail.
Focused tests cover negative caching/expiry, genuine provider errors, valid land
addresses, search isolation and AppCheck-before-budget enforcement: 12 pass.
The failed hosted receipt is retained separately; it is not relabeled a pass.


The complete source chain was rerun after this backend repair: **2,459 tests
pass**, with inventory and mutation sensitivity checks also passing. Receipt:
`/tmp/we3d-research-interior-geocoder-source.log`. The frontend package remains
byte-identical; the geocoder repair is a separate backend commit, `dfa42e6c`.

The ordinary Firebase deploy command stopped before upload because discovery
requested unrelated payment/email/admin parameter values. No values were invented
or cleared. The staging-only follow-up uses Cloud Functions' documented
[source update mask](https://docs.cloud.google.com/functions/docs/reference/rest/v1/projects.locations.functions/patch)
with the committed Functions archive. Only `sourceUploadUrl` is sent; the running
function's environment, secret bindings, service account, runtime, resource limits
and networking settings are compared before/after without logging their values.


Staging `getPlaceLookup` is now version **4**, updated successfully with the
source-only operation. The before/after configuration comparison passed.
`geocoder-staging-deploy.json` records the source archive hash, commit, operation
and safe metadata. Production was not changed. A future approved production
release must include this backend fix as well as the reviewed frontend package.


### Final hosted acceptance and handoff

`output/research-interior-20261011/hosted-ready/report.json` passes **five cases**
on the actual hosted package, with no provider interception, debug attestation,
seeded saves or source overlays. Room traversal uses the real controller; the
separate prescribed keyboard fixture verifies input. Galley provisions, internal
stairs, actual bridge chart and desktop/phone ship maps work. Live weather showed
76°F, 82% humidity and SE wind; reverse-place, marine and weather gateways all
returned HTTP 200. No page errors or failed HTTP requests were captured. The
runner exited normally with code 0. Final galley/map screenshots were inspected.

One preceding run completed the same gameplay/provider assertions but its Node
controller retained a loopback listener after Chrome exited. That run's receipt
records manual termination of only the identified controller, zero remaining
browser children and no whole-run pass. Inspection of installed Playwright 1.61.1
showed asynchronous launchServer listener shutdown. The owned-browser helper now
awaits its available test-only disconnect hook with a deadline. Five focused
cleanup tests pass, including a real TCP listener and error propagation, plus a
real Chrome probe confirms browser exit and closed listener with natural Node
exit. Receipt: `controller-cleanup.json`. These are verification-only changes;
frontend game bytes remain unchanged. The full 2,459-test source chain predates
this final helper change; those five scoped cleanup tests cover the latter.

The preview is ready for the owner's ship/ocean review. The test guide is
`output/research-interior-20261011/TEST-GUIDE.md`. Physical-phone acceptance and the
full production matrix are still separate. No GitHub push, production Hosting
promotion or production Functions deployment occurred during this delivery.
