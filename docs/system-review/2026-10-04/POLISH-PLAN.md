# Finite architecture polish plan

This plan follows the fresh October 4 review. It keeps the existing features and data and pauses feature expansion. The historical phase numbers are not used as proof of architectural quality. There are **six bounded work packages**, followed by a separate visual-quality decision. They are planned work, not implementation completed by this audit.

Complete and verify one package before moving to the next. A package closes when its stated outputs and tests pass. Unrelated discoveries enter a separate backlog; a reproducible regression in the package's scope must be fixed before closure. Do not continually redefine a package to include worldwide content improvement.

## 1. Repair the demonstrated synchronization failures

**Addresses F01–F02. First implementation work.**

1. Replace the marine heartbeat/pose FIFO with a transport owner that separates replaceable motion from discrete commands. Bound motion work to one in-flight sample and a latest pending state. Use sample identity, server acknowledgment and reconciliation to avoid accepting old deployment data or presenting rejected movement as current.
2. Preserve server movement checks. A latest-only queue alone is insufficient: a delayed acknowledgment can still leave the client too far ahead. On a long delay, suspend or reconcile from the acknowledged pose and present a recoverable connection state. Never silently enlarge the accepted movement envelope.
3. Use a monotonic server-relative lease clock with an uncertainty margin. Test clock skew, expired leases, reconnect, room changes and takeover. Discrete recovery/report commands must not wait behind obsolete movement history.
4. Make condition synchronization single-flight, preserve the newest pending revision when an older request fails, and surface unsaved state. Define revision/conflict behavior on the backend. Dispose/account-switch cancels adoption of obsolete responses; a dispatched mutation has explicit reconciliation semantics.
5. Turn the audit reproductions into registered behavioral regressions that expect correct behavior after repair. Keep the original audit evidence unchanged.

**Close when:** delayed/lost/reordered response tests preserve latest condition; valid bounded marine motion recovers without permanent loss of control; ±60-second client clock skew does not invent lease ownership or expiration; the actual two-client SDK/emulator voyage completes deploy → travel → scan → recovery → report, including a delay/reconnect case. Test anonymous/local and account-backed save boundaries separately. No production deployment is part of this package.

## 2. Establish session and state ownership

**Addresses F04–F05 and part of F10.**

Refactor five boundaries, not the entire repository:

| Boundary | Single owner | Other code may do |
|---|---|---|
| Active environment and transition | Session coordinator | Request entry/exit; observe committed identity/state |
| Controlled actor and travel mode | Actor/travel authority | Send semantic input; read pose/capability snapshots |
| Camera and render target | Active presentation owner | Request view mode; contribute owned scene layers |
| Pause/overlay control | Existing pause-reason authority | Acquire/release named reasons; never overwrite a shared boolean |
| Persistent player mutations | Store/synchronization owner | Issue versioned commands; consume success/failure receipts |

Use a session identity containing generation, environment and world/room identity. Async operations receive that identity and an abort signal. Every continuation checks ownership before publishing. Prepare resources before committing where possible. Failure after departure must reach a known recoverable state; document whether the previous environment resumes or the location menu becomes the recovery point.

Use the existing lifecycle scope to own timers, listeners, subscriptions, workers, DOM and leases. Global app-lifetime listeners may remain global with a declared owner. Add a transition matrix for Earth, Ocean, Space, planetary surfaces and nested ship interiors; test interruption at every await. Shared marine stage updates must converge after an in-progress transition rather than relying on a future publication.

Keep a compatibility facade for legacy context readers. Freeze or copy public snapshots as appropriate, expose commands instead of mutable internals, and enforce an explicit allowlist of remaining legacy writes in CI. Add no new context keys during this package except reviewed compatibility replacements. Measure reductions in the selected boundaries; do not set an arbitrary target of zero shared state across all 957 files.

**Close when:** each of the five boundaries has an interface, owner and failure contract; migrated writes cannot bypass it; rapid transition/cancel/reenter/account-change tests pass; no old session publishes scene/state after disposal; ten sequential transition cycles settle to a documented resource baseline. Existing controls, personal voyage, ship traversal and saves remain compatible.

## 3. Make simulation and presentation timing coherent

**Addresses F03 and part of F06.**

Define one clock policy for active simulation, paused time, hidden-tab time and network/server time. They have different purposes and should not be substituted for one another.

- Choose one accepted simulation interval per frame and a bounded catch-up policy. Player and nearby NPC/traffic simulation consume the same accepted time. Capture input before simulation. Interpolate presentation from prior/current poses without changing collision authority.
- Convert Space camera position and orientation damping to elapsed-time parameters calibrated to retain current 60 Hz feel. Migrate Earth/Ocean timing through their adapters only after measured parity; separate render cadence from network heartbeat cadence.
- Define behavior after 100/250/1,000 ms stalls and background/resume: no unbounded catch-up, expired local key state, large camera jump or mistaken server lease.
- Treat nearby road preparation as an explicit movement-readiness condition. Show why movement is waiting, make retry possible, and prefetch enough ahead of the controlled actor. Never allow movement through unavailable collision just to hide a loading pause.

**Close when:** camera convergence is equivalent at 30/60/120 Hz; seeded movement paths remain within predeclared tolerances across cadences; player/NPC relative motion does not diverge because they use different clocks; pause and background/resume tests preserve game timers; actual driving, walking, flight, swimming and ship-interior journeys remain coherent.

## 4. Remove measured stalls and budget active work

**Addresses F06 and the performance consequences of F04/F08.**

Measure the unchanged accepted baseline before each optimization. The existing 5.2-derived numbers are a regression floor, not proof that those versions were good. Use current artifacts, routes and real player actions.

Trace frame outliers and allocation pressure separately from average FPS. Start with vehicle surface queries, population presentation, world surface/structure queries, minimap/UI refresh and streamed geometry publication. Use the same location identities, density, collision checks and visual settings for before/after comparisons. Cache immutable derived data and reuse bounded scratch storage where measurement justifies it; ensure nested queries remain safe.

Make scene publication, shader warming, texture upload and optional work observable. The current 8 ms cooperative target is useful only where producers actually honor it. Chunk work by measured elapsed time and prioritize actor readiness. A background/idle callback can still run expensive synchronous work; scheduling it later does not make it cheap. Introduce a worker only where transfer/setup cost and a measured experiment justify it.

Add the hitch/retention acceptance proposed in TEST-PLAN. Preserve present content and the existing average FPS floor. No claim of “stutter fixed” may come solely from a faster component benchmark or a green p99.

**Close when:** the named steady-play routes satisfy the agreed hitch criteria; loading and streaming waits are separately measured and recoverable; resource growth plateaus across the longer cycle test; collision, source coverage and visual density have not regressed. A remaining unexplained 650 ms active-play frame keeps this package open.

## 5. Harden persistence, dependencies and service boundaries

**Addresses F08–F12 and remaining F10 work.**

Use indexed bounded Journal reads; prove performance with established players, not just empty profiles. Preserve import/rollback and receipt transactions. Specify local-device versus account-owned state, two-tab behavior, offline mutations, storage quota failure and account switching. Personal voyage/Journal progress must not be silently overwritten by a room session or another identity.

Introduce a field-level authority table: local sandbox pose/appearance; server account identity and entitlements; transactional wallet and shared controls; client-claimed scores/condition; observed versus modeled/derived environmental data. Decide which public scores remain explicitly casual and which require verified run receipts. Do not add a general authoritative multiplayer engine as an incidental polish task.

Create a versioned runtime dependency list that includes CDN scripts and Firebase SDK URLs, plus local lockfiles and generated code provenance. Wire the relevant boundary type checks into CI. Avoid a blanket dependency/renderer upgrade while resolving gameplay defects.

Keep per-asset limits and add aggregate **active scene** budgets: draw calls, materials/programs, texture bytes, skeletons, colliders, animation cost and load lifetime. Use the existing model lease system. Plan visual assets around instancing, LOD, material reuse and navigable collision, not download size alone.

Give provider services explicit freshness, request-body/response limits, abort/retry policy, fallback, quota/cost owner and expiration monitoring. Resolve weather entitlement through the authorized account process before commercial launch; do not place keys in chat or source. Capture-safe diagnostics should identify build, session generation, mode, anonymized provider/error category and failed operation without raw location or personal media.

**Close when:** long-history and multi-tab/save-failure cases pass; checked boundary types run in CI; runtime dependencies have declared ownership; scene budgets have a real baseline; provider outage/429 tests behave coherently; casual versus verified data/score claims are explicit. Known entitlement gaps remain release-blocking if the related provider is required.

## 6. Make release acceptance one honest decision

**Addresses F07 and integration of all repairs.**

Create a machine-readable release acceptance record for the exact artifact with separate statuses for component/static, packaged UI, emulator/shared authority, ordinary hosted user, physical devices, human comprehension and operational entitlement. Missing evidence is pending. A debug token, touch viewport, source fixture or previous build cannot satisfy a different evidence class.

Keep runtime/test/environment fingerprints strict. Add a separately reviewed documentation-input classification so adding a report does not force unchanged gameplay through another full matrix. Include relevant runtime config, build tooling and test changes in their proper fingerprints; test the classification against deliberately changed shipped bytes.

Build once after repairs settle. Execute the complete registered candidate/backend matrix sequentially, preserve failures, and add the new adversarial regressions. Then exercise the deployed staging artifact using ordinary browser attestation and the physical/human test card. Resolve hosted App Check behavior without relaxing security. Confirm rollback artifact **identity** and expiry, backend/index compatibility and save migration compatibility; a hosting rollback does not reverse player data migrations.

**Close when:** there is one current acceptance record, no unresolved high-impact defect from this review, ordinary hosted journeys work, physical-device/fresh-player requirements are actually completed, and rollback is usable. Production promotion remains a separate authorized release action. Green automated totals alone do not close this package.

## Boundary for starting visual polish

Once packages 1–6 close, begin visual refinement using the existing content: one street district, one marine site and one space/ship scene. This is a new art pass, not a seventh prerequisite that expands architectural work forever.

For each reference scene, define scale, material response, lighting/exposure, texture density, LOD transitions, animation quality, object grounding, collision clearance, navigation cues and allowed scene cost. Compare fixed camera views at day/night and intended device settings. Then promote proven reusable patterns to other locations.

For the street reference, use buildings with readable ground floors, meaningful storefront variation, convincing sidewalk dimensions, correctly placed furniture and NPC activity supported by walkable paths. For the marine scene, keep water appearance, visibility/depth, currents and diving rules tied to their declared simulation/data authority. For Space, preserve consistent travel scale, destination cues and scene lighting before adding density. A visual model must not become the source of geographic truth or collision authority simply because it looks better.

The completion criterion is consistent scenes within the browser budget and understandable play. It is not worldwide photographic realism, No Man's Sky scale, or unlimited asset replacement.
