# Production candidate audit — scope freeze

September 7, 2026. Audited source: `075ce038`. **Not ready for promotion.**
This pass inspected changes and executed bounded tests; it did not deploy or
claim a complete visual release acceptance. No cloud reconstruction was run.

## Release scope

Finish and validate the existing manual exterior contribution path. Preserve
the rest of the working game. Manual room editing and paid reconstruction are
roadmap/developer work, not requirements to build before this release. Preserve
their code and existing private records; do not expose unfinished room controls
as a completed contribution product. Contribution rewards, featured places and
shared draft worlds are not new release requirements.

## Verified baselines

Live manifests were fetched directly, not inferred from local branches:

| Surface | Identity |
| --- | --- |
| Production | `5.2.0+22b2f4ef4b07.e7aefb0b4d4eb59e.production`, clean source |
| Staging | `5.2.0+ba14127f756c.340d783fc235d491.staging`, manifest says `sourceDirty: true` |
| Local source | `075ce038`, clean at audit start |

There are 28 commits and 181 changed files between production and this source,
including documentation, assets, dependencies and tests—not 181 new gameplay
features. Current staging is an isolated modified snapshot. It is not evidence
that every local change has been accepted.

## Findings requiring correction or acceptance

### P1 — Staging is not the proposed complete candidate

Latest manual-first UI, recovery, access guards and admin feedback are not all
deployed. Backend handlers have also been rolled out selectively. Hosting's
manifest alone cannot prove the deployed Functions/rules/worker versions.

Required: freeze one clean source revision and dependency lock. Build staging
and production-configured artifacts from that same revision; compare manifests
and allow only explicit environment configuration differences. Record the
matching backend handler/rules set separately. Test that staged candidate, not
an older page or a source fixture. Do not deploy all worker exports simply
because they exist in the branch. Production credentials/data must not be used
for staging tests.

### P1 — Resubmitting an approved capture re-enables destructive deletion

`functions/reality-capture-authority.js:isDeletableByOwner` only excludes the
current `approved` status. `submitRealityCaptureHybrid` allows an approved capture
to submit another revision and changes that capture to `review_required`, while
the previous `buildingRepresentations` publication remains approved.
`deleteRealityCapture` then deletes the entire capture Storage prefix and the
capture record without checking those publication references.

The predicate was executed directly: approved → deletion false; approved capture
with a pending resubmission → deletion true. Combined with the inspected handler,
this permits removal of an asset still referenced by the live publication. No
real capture was deleted in this audit.

Required: published immutable revisions must survive pending/rejected edits.
Deletion must check publication references and use a race-safe tombstone/cleanup
protocol; checking only a mutable workflow status is insufficient. Add a
regression covering approve r1 → save/submit r2 → delete attempt and a concurrent
approval/delete race. Do not test this against the user's real house.

### P1 — Release surface still exposes an unfinished interior path

`ui.js` still renders the `One room` capture tab. It saves room photos but does
not implement a stretchable room editor, doorway/collision agreement or playable
manual interior. Keeping this visible as an ordinary finished workflow would
mislead users. Existing private captures must remain protected and recoverable.

Required: keep the public contribution journey exterior-only for this release;
retain room development behind a clearly separate developer/roadmap boundary.
Paid generation must be unavailable both in public UI and backend admission,
not merely hidden in a browser. New local claim checks exist but need coordinated
deployment and direct endpoint rejection checks on the actual candidate.

### P2 — Approval can succeed but the server reports failure

`moderateRealityCapture` commits the review/publication transaction and then
awaits `logAdminActivity` inside the same outer try/catch. If activity logging
fails after commit, the response follows the error path although approval has
already happened. Local frontend refresh handling does not fix this server-side
case.

Required: durable/idempotent activity handling, or distinguish committed approval
from secondary logging failure. Exercise the injected logging-failure case and
ensure the administrator is not told to approve an already published revision
again. This is a code-path finding, not a reproduced live incident.

### P2 — Complex transport presentation is not visually accepted

Transport, terrain, collision, building assembly and chase-camera code changed
since production. The prior transport checkpoint explicitly records unacceptable
entrance terrain bands/retaining-wall joins and remaining exact-provider and
complex-transition coverage. The passing geometry checks do not erase those
findings. Verify the immutable artifact's worker/WASM paths too.

Required: current packaged visual checks at the reported house, Monaco and a
second tunnel/bridge region, including entry/exit, wall contact and camera.
Separate faulty provider geometry from generalized engine rules; preserve mapped
buildings. Do not certify all locations from one fixture.

### P2 — Exterior repeatability and operational gaps

The first approved house succeeded, but the current release still needs a
staged second-revision cycle, rejection retaining the prior approved world,
stale save/review rejection, failed-upload recovery, unauthorized asset checks,
hard-refresh visibility and physical-phone edit/save confirmation. The photo
top-edge correction has local visual evidence, not a fresh exact-house edge
acceptance. Push/email approval delivery is not verified; either finish it or
clearly omit that promise and rely on truthful in-account status for this release.

## Regression scope from the actual production diff

| Changed area | Bounded acceptance needed |
| --- | --- |
| Exterior materials, batching, trim and photo overlays | Generated and photo-covered buildings, non-rectangular footprint, partial coverage, height/roof alignment, disposal |
| Transport/terrain/walking/collision/camera | Road support, tunnel/bridge transitions, walk/drive switching, no cabin/terrain clipping, worker failure behavior |
| Capture phone/UI/storage/revisions/moderation | One-photo manual contribution through approved world; ownership, concurrency, private originals, cross-device reload |
| AR session lifecycle and input interception | Open/close/cancel, unsupported-device fallback, camera/input restored after capture/AR |
| Hosting bundles, dependencies, routes and rules | Packaged loading, lazy worker/assets, account/capture/admin routes and actual backend access |
| Otherwise unchanged space/economy/property/POI/tutorial modules | Short integration smoke because shared world/input/building code changed; do not pretend these feature directories were newly rewritten |

No direct files changed under `app/js/space`, `expedition`, `economy`,
`real-estate`, `poi` or `tutorial` in this production-to-source diff. That narrows
testing but does not eliminate shared-runtime regression risk.

## Tests and their limits

This audit ran once:

- 43 focused facade geometry, capture authority and HTTP-handler tests: passed.
- 31 focused tunnel, camera, consistency, transition and worker-packaging tests:
  passed.
- Direct deletion-policy reproduction: confirmed the pending-revision gap above.

The handler suite uses Firestore/Storage doubles. It is useful and should not be
deleted, but currently misses the published-revision deletion case and post-commit
logging failure. Browser fixtures are not staged Auth/rules acceptance. The
existing `capture-staging-smoke.mjs` is a reconstruction benchmark that can create
an account/capture and queue work; it is not the manual-only release test and was
not run. Do not reuse its success as manual-editor acceptance.

No new whole-game or physical-phone visual pass was performed in this audit.

## Completion order—no feature expansion

1. Fix published-revision lifetime/deletion and committed-approval feedback.
2. Set the release boundary to manual exterior only; retain but do not publicly
   offer unfinished room/reconstruction flows.
3. Freeze and build one clean candidate; record hosting and backend parity.
4. Stage that candidate and execute one isolated full manual contribution cycle,
   including a revision/rejection/reload and permission failures. Keep the user's
   already approved house intact.
5. Resolve or explicitly hold release for remaining transport visual defects;
   run the bounded shared-runtime and phone checks above.
6. Give the owner that exact staging candidate to test. No further changes after
   acceptance without targeted revalidation. Production promotion remains a
   separate explicit action.
