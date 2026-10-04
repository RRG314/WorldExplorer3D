# Verification design for architecture polish

The purpose is to detect the failures players experience: stalling, losing control, entering the wrong state, losing progress and not knowing what to do. Test totals are supporting information. Tests must establish behavior for the artifact and environment actually being accepted.

## Evidence collected during this audit

| Check | Result | What it proves / does not prove |
|---|---|---|
| Fresh Babel inventory | 957 runtime JS files parsed; no parser failures | Literal graph and direct-context syntax; not runtime performance or line-by-line correctness |
| Marine timing reproduction | Expected defect reproduced | Actual client queue + server reducer reject valid delayed motion; fake DOM/time/transport, no live-service claim |
| Marine clock skew | Expected defect reproduced | Local clock prematurely expires a still-valid server lease in the actual client |
| Condition write reproduction | Expected defect reproduced | Current sync module loses newer queued state after an old request fails; imports/timers/subscriptions are controlled |
| Space camera reproduction | Expected defect reproduced | Actual camera implementation changes response with cadence using pinned Three math; no renderer or FPS benchmark |
| Contract inventory | 364 selected; all six separately owned files parse | Test ownership and syntax, not all tests executed today |
| Public manifests and production Functions list | Read successfully | Current release identities and 78 Function entries; not all endpoint health or runtime configuration |
| Existing matching-source release receipts | Re-read, not rerun | Prior 82/82 candidate, 3/3 backend and performance results retain their original scope |
| New full browser/emulator/performance acceptance | Not run | No runtime changes in this audit; new release readiness is not claimed |

Reproduction commands, from the reviewed workspace:

```sh
node scripts/architecture-evaluation/system-review.mjs
node scripts/architecture-evaluation/reproduce-marine-timing.mjs
node scripts/architecture-evaluation/reproduce-condition-save.mjs
node scripts/architecture-evaluation/reproduce-space-camera.mjs
node scripts/verification/contract-inventory.mjs
```

The inventory requires the existing isolated Babel install under `output/architecture-evaluation/tooling/node_modules`; its pinned package manifest is in `scripts/architecture-evaluation/tooling`. The diagnostic assertions currently expect the audited defects. After a runtime fix, preserve these dated receipts and add normal regression tests expecting the repaired behavior.

## Test layers and what belongs in each

1. **Pure domain tests:** units/coordinate conversion, movement math, provider normalization, state transitions, revision rules, idempotency and save projections. Inject time and randomness. Use boundary/property cases, not only hand-picked happy paths.
2. **Owner/lifecycle tests:** instantiate the actual owner with controlled dependencies. Inject failures at every await; cancel, dispose, replace or switch account. Assert no stale publication, bounded requests/resources and explicit recoverable status.
3. **Packaged browser journeys:** use the built app and real UI/input. Diagnostics may observe state; they should not manufacture the success being asserted. Inspect screenshots, console errors, failed assets and focus/touch behavior. Record providers that were controlled and why.
4. **Actual SDK/backend journeys:** use isolated emulator fixtures for concurrent users, rules, retries, role/seat changes and receipt deduplication. Test dropped responses after a committed mutation as well as rejected mutations. Keep fixture cleanup explicit.
5. **Ordinary hosted staging journeys:** use normal app attestation and actual hosted configuration. Verify cold/warm startup, location search, sign-in, shared entry and save recovery. Debug-attested tests stay a separate class.
6. **Physical-device and human acceptance:** physical iOS Safari and Android Chrome, plus the supported desktop. Touch emulation does not establish memory, thermal, viewport or browser-engine behavior. A fresh player must complete a meaningful exploration loop without coaching.

## Required behavioral matrix

| Risk | Cases | Required invariant |
|---|---|---|
| Marine network | 0/100/500/2,500/5,000 ms latency; dropped reply; reordered snapshot; delayed command completion; expired deployment | One motion flight plus bounded latest state; no obsolete deployment applied; valid player movement recovers; one command effect per ID |
| Shared seats/time | ±60 s local-clock offset; 15 s lease expiration; tab hidden; pilot leaves; two simultaneous claims | Server owns lease; no double pilot; visible reconnect/takeover; stale client stops safely |
| Condition writes | Older write fails while newer is queued; replies reorder; offline/reconnect; dispose/account switch mid-write | Latest authorized revision retained; errors do not masquerade as saved; no response adopted into another user |
| Transitions | Rapid Earth→Ocean→Earth; Space→ship→Space; planetary return; leave during import; failure during prepare/commit | One committed active environment/actor/render owner; recoverable destination; no stale UI/scene publication |
| Timing/input | 30/60/120 Hz; 100/250/1,000 ms stalls; pause reasons nested; focus loss; held key/touch on modal open | Equivalent elapsed-time response; bounded catch-up; no stuck input or resumed paused challenge |
| Collision/streaming | Bridge/ramp/seam, interior door/floor, shoreline/deep-water entry, unavailable nearby road detail | Visual and collision frame agree; no fall-through; explicit recoverable wait when required geometry is absent |
| Saves | Existing v1/v2 backups; corrupt import; quota exceeded; two tabs; interrupted transaction; local/account switch | Atomic commit or preserved old data; visible failure; stable receipt identity; no silent cross-account merge |
| Long histories | 0/1,000/10,000/50,000 Journal records in disposable DB | List query work proportional to page size; accurate totals/progression; usable UI and bounded memory |
| Assets/renderers | Repeated enter/exit; slow/failed GLB; abandoned load; lost WebGL context; repeated cached entry | No stale mount; shared textures survive other owners; one disposal per ownership contract; bounded steady-state resources |
| Providers | Timeout, 429, malformed/oversized body, stale data, no coverage, revoked access | Deadline settles; fallback and freshness are visible; gameplay truth is not fabricated; no retry storm |
| Authority/security | Anonymous, wrong owner, expired/revoked auth, wrong room, replay, duplicate receipt | Protected data/actions rejected; permitted local sandbox still works; client claims not promoted into trusted rewards |
| Activity coherence | Begin, pause, cancel, fail, complete, save failure, retry, replay, return to world | One active activity; one result receipt; understandable next action; controls/focus restored |
| UI/accessibility | Keyboard-only, remapped controls, touch, reduced motion, zoom, landscape, modal stacking | Controls remain reachable/labeled; focus returns; HUD does not hide required actions |

The long-history fixture must use disposable data. Never import synthetic histories into the owner's profile or copy private captures into evidence.

## Performance acceptance proposal

These are **proposed product criteria**, not thresholds secretly applied to the old green matrix. Establish them in the performance contract before implementation acceptance. Keep the current average FPS floor and p99 limit as regression protection on the named M1/Chrome tier. The immediate objective is to eliminate large pauses and inconsistent motion, not to require perfect 60 FPS.

| Metric | Proposed criterion / decision |
|---|---|
| Steady-play cadence | Preserve current desktop average ≥43.65 FPS and p99 ≤50 ms under matching world/settings; investigate distribution by mode rather than averaging modes together |
| Severe stalls | No unexplained active-play frame >250 ms in the acceptance routes. A repeatable stall is a failure even with acceptable p99 |
| Smaller hitches | Record counts over 50/100/250 ms, worst frame and total stalled time; initial target ≤1 frame over 100 ms per minute, without clustering |
| Input and UI | Proposed desktop p95 input-to-visible-response ≤100 ms; measure separately from frame cadence. Set physical-phone threshold from named-device evidence, not viewport emulation |
| Loading | Keep 25 s as the stated desktop product target initially; measure cold/warm actual providers. The current 120 s safety ceiling is not a satisfactory user-experience target. A missed target must be reported and resolved or explicitly revised before calling this package complete |
| Streaming | Record duration/frequency of movement blocked by required detail; no unlabelled indefinite stop. Distinguish intentional readiness blocking from browser long tasks |
| Retention | After warm-up, compare at least ten transitions/replacements. Scene-owned roads/buildings/terrain return to the intended retained/disposed baseline; geometry/texture/heap growth must plateau, not merely fit under a large allowance |
| Visual/semantic parity | Keep location IDs, data coverage, traffic/NPC density, collision behavior, asset set and render settings fixed for a performance comparison |

Start with two 90-second input-driven samples for each affected mode and one ten-minute mixed traversal soak after repairs. Expand only if failures or variance justify it. Test loading separately from active play. Retain complete timings and mark backgrounding, OS pressure and instrumentation; do not subtract a stall without evidence. Heap samples and GC traces are diagnostic runs, separate from normal timing acceptance. Cumulative allocation is not retained memory.

## Required release journeys

Use a fresh account and an established disposable account. Begin at the player-visible entry screen; use diagnostic state only to observe and locate a failed invariant.

- Earth: select/search location → walk → interact → drive → enter/exit an interior → complete/save/replay a game → change location → reload and verify progress.
- Marine: enter valid water → board/deck traversal → swim with automatic equipment rules → recover → deploy/dive/scan/recover submarine → reload personal voyage. Repeat shared voyage with two real SDK clients and interruption.
- Space: launch → choose destination → travel/approach/land → surface action → ship interior, doors/floors and observation views → return to Earth with correct pose/controls.
- Live Earth: toggle available layers → browse both supported camera regions → open stills, check source/time disclosure → favorite → reload → provider unavailable → retry/close with no orphan work.
- Creation/account: sign in/out, required entitlement flow, create/save/edit/cancel a supported artifact, applicable capture moderation/visibility and account cleanup on disposable fixtures. Keep payment-provider test mode separate; no real purchase as an audit shortcut.

## Honest release decision

Every receipt records source/build/content identity, test revision, environment config identity, provider mode, device/browser, start/end time, evidence class, result and cleanup. Human/device receipts record reviewer, device, actual observations and artifact identity. Missing entries remain pending.

Run focused checks during refactoring. After gameplay changes settle, build one immutable artifact and run the complete candidate/backend matrix once, repairing and rerunning affected evidence when necessary. Keep original failures and explain any rerun. Then complete ordinary hosted, physical-device, comprehension, entitlement and rollback acceptance. An old artifact's pass never proves new gameplay.

The audit adds only documents and diagnostic scripts, so it deliberately does not rebuild `dist` or rerun the heavy release matrix. Its untracked documents currently change the existing whole-worktree fingerprint; prior receipts remain valid only for their recorded baseline, not a fresh clean-worktree acceptance claim.
