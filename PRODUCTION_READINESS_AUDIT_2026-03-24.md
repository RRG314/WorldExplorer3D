# Production Readiness Audit — Post-Edit State

**Date:** 2026-03-24
**Branch:** steven/continuous-world-full-rnd
**Current build:** bootstrap.js v=190 / world.js v=158 / terrain.js v=127 / physics.js v=86 / hud.js v=61
**Constraint:** Read-only audit — no edits, no patches

---

## Plain-English Summary

Think of the game as a house you are trying to move into. The foundation (road contact, terrain sync, camera) was crumbling before your edits. You have now poured a new foundation and reinforced the main walls. The house is significantly more stable — the camera does not shake, the car stays on the road, the road system respects the terrain correctly. But two rooms are still unusable: the building loading system runs out of memory when you travel far, so new areas show up empty, and the startup clock is so slow that we cannot tell whether the big performance work from earlier today actually held after all the subsequent changes. Those two things are what stand between you and a shippable build.

Everything else is either fixed, acceptable, or a cosmetic issue that does not block shipping.

---

## What Your Edits Fixed (Confirmed)

### ✅ Dual road-contact authority — DONE
The old code had two independent "which road is the car on" systems in physics.js and ground.js that could silently disagree. You consolidated them: `structure-semantics.js` now owns the shared helpers (`retainRoadSurfaceContact`, `shouldLockRetainedRoadContact`), `ground.js` exposes a single `resolveDriveRoadContact()`, and `physics.js` calls that instead of running its own version. Confirmed in source code at `physics.js` line 416–417.

Impact: The ghost-height bug (car technically on bridge but drawn at ground level) should be resolved. The stale ramp-contact-audit (March 20, pre-fix) showed 31 cases of this; those should be gone. The test needs to be re-run to confirm the new number.

### ✅ Surface sync no longer resets on every streaming add — DONE
Before: every time interactive streaming added new roads, the entire road-height reconciliation queue reset. With 45 streaming steps in New York, the sync was always restarting. Sync request count: 199. After: scoped road-mutation tracking. Sync requests: 19–20 across all three tested cities. No road drops in any city.

Impact: Seam jumps at terrain tile boundaries are significantly reduced. `roadsNeedRebuild: true` still appears at every sample (see below) but the sync no longer cascades.

### ✅ Camera no longer jitters or pulls with speed — DONE
Speed-linked chase distance is removed. Fixed-distance clamp is live. Test results: chase distance stays in a 9.99–10.36 range (was blowing out to 10.8+), maxCameraYStep 0.0451 (smooth). `onRoadRatio: 1.00`. Tests passing.

### ✅ Startup road and building shell — DONE
Startup now shows 181 road meshes and 705 buildings before the player can move. Previous pre-fix startup showed 54 road meshes and effectively no buildings. The game is visually populated when the player first takes control.

### ✅ Debug residency reduced — DONE
ENV HUD no longer always active. Road debug visuals scoped to local actor radius. No debug regression.

### ✅ Ramp drive-surface failures: 8 → 0 in most recent test
The drive-surface-stability ramp probe went from 8 failures to 0. Note this is on a slightly older build (v=170) so re-run will confirm, but the trend is correct.

---

## What Is Still Broken (Current State)

### 🔴 BLOCKER 1 — Far-region buildings load 0 roads when driving

**Test:** `continuous-world-building-continuity` — FAILING
**Error:** `"drive far-region roads too thin: 0"`
**Report date:** March 24 00:34 (most recent test)

When the player drives far from the spawn location, the new destination area loads zero roads. This is the single most player-visible bug in the game right now. The player would drive off the edge of the loaded world into a barren zone.

**Root cause (confirmed from progress log):** The actor-region load path can fail to land before the probe window closes in drive mode. The actor-gap recovery was improved (it now distinguishes missing road shell vs missing building shell and can preempt low-value prefetches) but the fetch timing in drive mode is still not reliable. When driving fast, the covered-region cursor gets ahead of the fetch queue.

**Why memory makes it worse:** Base-world buildings from the original startup load are hidden but NOT disposed. Memory stays high even when those buildings are out of range. When the streaming system tries to load a new area's buildings, there is less heap budget available. The user observed this directly: "memory is still observed as high even when newly needed visual content is missing." This is confirmed in the code audit.

**To fix:** Two changes need to land together. First, drive-mode actor-region fetch timing needs a guaranteed prefetch slot that runs ahead of the car's movement, not reactively after the gap opens. Second, the base-world hidden-not-disposed buildings need an eviction path so memory is reclaimed when the camera moves far enough away (roughly 2× the playable-core radius).

---

### 🔴 BLOCKER 2 — Performance startup time: unknown current state

**Test:** `performance-stability` — report is STALE (March 23 17:35, build v=170)
**Stale result:** firstControllableMs = 57,201ms (nearly at the 60,000ms FAIL threshold)
**Last known good result from progress log:** ~13,600ms (after "startup roads-ready load-order pass")

The performance test has NOT been re-run since the major fixes. There have been at least 8 significant code changes since the last test run. The progress log notes "still over budget" at several intermediate checkpoints after the good result, so we cannot assume it is still at 13.6s.

The current build (v=190) is 20 versions ahead of the test (v=170). The report is not valid for shipping. This must be re-run before any production decision.

**Additional concern:** The stale report shows dynamicBudget tier set to "performance" with reason "fps_down." This means the adaptive quality system had already degraded to a lower tier when the snapshot was taken. If that degradation is persisting into the current build, the game would launch in reduced visual quality for all users by default.

**To fix:** Re-run `npm run test:performance-stability`. If it still fails, the most likely culprit is the startup playable-core road preload changes — the wider actor radius and per-tile budget increases added in the road-shell hardening pass increased startup geometry work.

---

### 🟡 HIGH — `roadsNeedRebuild: true` at every sample (but no longer cascading)

**Test:** `continuous-world-terrain-road` — PASSING (but with anomaly)
**Result:** roadsNeedRebuild = 12/12 Baltimore, 12/12 LA, 7/12 NY

Every sample point still reports `roadsNeedRebuild: true`, but sync requests dropped from 199 to 19–20 and roadDrops = 0 in all cities. The flag is being set but the sync is running and completing without the old cascading-reset behavior.

This is no longer a cascade problem but it IS still a continuous workload. Every time the car moves, the system is re-marking roads as needing a rebuild. If scoped sync bounds do not tightly match the actor position, there is a risk of a visible seam when crossing a tile boundary at speed. The seam maxSurfaceJump is 0.92 world units (slightly worse than the previous 0.689 — this report was on build v=170, pre-scoped-sync).

**Impact:** Edge-case height bump at tile edges, especially at speed. Not a crash but visible and feels rough.

---

### 🟡 HIGH — Bridge and ramp contact: needs fresh test

**Test:** `ramp-contact-audit` — STALE (March 20, pre-dual-authority fix, pre-scoped-sync)
**Stale result:** 84/110 failures (53 onRoadOk=false, 31 belowCapturedWrong)

The dual authority fix (Pass 1) should have eliminated all 31 `belowCapturedWrong` cases — those were caused exactly by ground.js and physics.js independently tracking different retained roads. Confirmed eliminated in source.

The 53 `onRoadOk=false` cases (car can't find bridge from ground level) are a separate issue — the vertical attachment threshold (2.8 world units) is still smaller than the Jones Falls Expressway bridge height (8.96 world units above terrain). That threshold was not changed. So elevated-road approach failure is likely still present, just reduced from both angles now resolving through the same path.

**To fix:** Re-run the ramp-contact-audit to get the real current number. Then if `onRoadOk=false` cases remain, raise the elevated-road acquisition radius specifically for initial approach (separate from the lock threshold, which is already working).

---

### 🟡 MEDIUM — Memory not reclaimed after long drives

**Not a test failure — confirmed from code and user observation.**
Buildings from the startup load are hidden when the player moves away, but never disposed or evicted from memory. The JS heap grows throughout a session and does not shrink. On a long drive across a city or into a new city, the game will eventually run out of rendering budget for new content while carrying invisible old content in memory.

This is the second half of the far-region building failure. Even if the fetch timing is fixed, the memory ceiling will cause sparse loading in new areas on long sessions.

---

### 🟡 MEDIUM — LOD does not update on camera-only rotation

**Confirmed from source code — not yet fixed.**
In `world.js` `updateWorldLod`, road mesh visibility only updates when the car moves ≥ 8 world units. A camera rotation without forward movement does not trigger the LOD check. Roads that were hidden before the turn stay hidden. On a stationary stop where the player rotates to look around, half the nearby roads may be invisible.

The camera test passes because the test drives the car forward. Rotation-only visibility is not tested.

---

### 🟡 MEDIUM — Tunnel visual gap (car sinks through terrain)

**Confirmed from source code — not addressed in recent edits.**
Tunnels produce the correct road contact physics (car follows subgrade profile, lock system works). But there is no portal geometry, no tunnel walls, no ceiling. The car visually drives into an unbroken terrain surface and disappears. This is a complete visual gap for any OSM-tagged tunnel in the game.

For production: this is not a crash or a physics failure, but it is a jarring visual artifact in any city with tunnels (which is every major city). At minimum, a terrain-cutout or transparent terrain zone over the tunnel cut would hide the worst of it.

---

### 🟢 LOW — Water system: functional but not recently tested

The `water-dynamics.js` file has a complete wave physics simulation: three sea states (calm/moderate/rough), five water kind configs (harbor/channel/lake/coastal/open_ocean), multiple wave components with direction/frequency/speed/weight/phase parameters, and boat response tuning. This is sophisticated and appears feature-complete.

The boat smoke test was flagged as advisory fail in earlier reports but was not the priority focus. Water dynamics and boat mode have not been explicitly tested in the recent fix passes. No new failures visible in recent test runs for boat/water.

**For production:** Run a focused boat test. The wave system is complex enough that edge cases (boat getting stuck in wave trough, foam rendering glitch, audio not matching sea state) are plausible without recent validation.

---

### 🟢 LOW — Culvert passability (minor)

Small drainage culverts (tagged `tunnel=culvert` in OSM) are treated identically to full tunnels. Car can drive into a 60cm storm drain. No production-blocking crash, but a very minor odd behavior in rural or suburban areas.

---

## Performance Numbers (Current Best-Known State)

| Metric | Target | Warn | Fail | Last Test | Status |
|---|---|---|---|---|---|
| First Controllable | 12s | 20s | 60s | 57.2s (STALE v=170) | ⚠️ STALE — re-run required |
| Frame time | 22ms | 33ms | 55ms | 16.67ms (STALE v=170) | ⚠️ STALE |
| Draw calls | 1400 | 1900 | 3200 | 64 (snapshot pre-load, unreliable) | ⚠️ STALE |
| JS Heap | 500MB | 750MB | 1300MB | 35.6MB (snapshot pre-load) | ⚠️ STALE |
| Surface sync | 35ms | 60ms | 120ms | 46.5ms (v=170) | ⚠️ At WARN |
| Camera maxStep | <0.1 | — | — | 0.0451 (v=190) | ✅ PASS |
| Car Y maxStep | <0.1 | — | — | 0.0514 (v=190) | ✅ PASS |
| Road drops (drive) | 0 | — | — | 0 (v=127) | ✅ PASS |
| Seam jump | <0.5 | — | — | 0.92 (v=170, pre-scoped) | ⚠️ Over target |
| Building continuity | pass | — | — | FAIL (v=190) | 🔴 FAIL |

The performance table has a measurement gap: the most performance-critical tests were last run on build v=170. The current build is v=190. All performance numbers should be treated as estimates until the test is re-run on the current build.

---

## What Needs to Happen to Ship

This is prioritized by impact on real players.

**Must fix before production:**

1. **Re-run `npm run test:performance-stability`** — takes ~5 minutes. Without this you do not know if the game loads in 13s or 57s. This is required before any other production decision.

2. **Fix far-region building/road loading in drive mode** — "drive far-region roads too thin: 0" is the top visible bug. The actor-region fetch path needs a leading prefetch in drive mode. This plus a memory eviction pass for out-of-range startup buildings should resolve both the empty-world and the memory-buildup issues together.

**Should fix before production (within one hour):**

3. **Re-run `npm run test:ramp-contact-audit`** — the dual authority fix eliminated the `belowCapturedWrong` category. Run the test to confirm the bridge failure rate is now materially lower. If `onRoadOk=false` cases (car can't find elevated bridge from below) are still above 20%, raise the elevated road acquisition vertical radius for initial approach.

4. **LOD update on rotation** — remove the movement-only gate from `updateWorldLod`. Add a camera-heading change check (≥15 degrees since last LOD update). This is a two-line fix.

5. **Surface sync warn: maxSync 46.5ms vs 60ms warn** — the scoped sync fix in v=127 should have improved this. Re-running drive-surface-stability on the current build (v=190) will show the real number.

**Acceptable to ship with (known issues, non-blocking):**

6. Tunnel visual gap — car sinks through terrain. Cosmetic but jarring. Can ship with it, flag as known issue.

7. `roadsNeedRebuild: true` at every sample — the cascading behavior is gone. The flag fires but sync completes. Edge-case seam at tile boundaries. Acceptable for launch with a follow-up ticket.

8. Water / boat not recently tested — run a 10-minute boat session before final ship decision.

9. Culvert passability — minor, low-frequency, no crash risk.

---

## Things You Did Not Ask About But Should Know

**Session memory grows without ceiling.** There is no eviction path for base-world geometry that moves out of render range. On a 20-minute drive session the heap will climb. The progress log confirms this is known and coupled to the building continuity problem, but no fix has landed yet.

**The adaptive quality system is already degraded at startup.** The stale performance report showed `tier: "performance"`, `reason: "fps_down"` at first boot. Even on a fresh load, the dynamic budget had auto-dropped to a reduced quality tier. If this persists in the current build, every user launches in a visually degraded state by default. Test the current build and check `dynamicBudget.tier` in the snapshot.

**Interactive streaming coverage cap is hard-wired at 10 entries.** `CONTINUOUS_WORLD_INTERACTIVE_STREAM_MAX_COVERAGE = 10`. With a 0.02-degree region grid and fast driving, 10 entries is limiting. This is one of the factors causing the far-region failure — the coverage map fills up with near-origin entries before the new destination gets a slot. Raising this to 14–16 would reduce the far-region gap without other changes.

**Building-continuity test uses a narrow timing window.** The test fails because the load does not land before the probe closes, not because the load was never triggered. The test is measuring timing correctness, not just eventual consistency. A tighter prefetch lead time in drive mode would fix both the test and the user experience simultaneously.

**The performance test used two different server ports** (4173 vs 4175) for different test runs. If these are configured differently (e.g. different asset serving or caching behavior), the results may not be directly comparable. Confirm all tests run on the same port before making a ship decision.

**No camera smoothness test for walk or drone mode.** The test only covers drive mode. Walk and drone modes have not been formally validated for camera jitter or Y-step smoothness in the recent pass.

---

## Test Re-Run Checklist (For the Next Hour)

```
npm run test:performance-stability              ← REQUIRED before ship decision
npm run test:continuous-world-building-continuity  ← REQUIRED (known blocker)
npm run test:ramp-contact-audit                ← REQUIRED (verify dual-authority fix)
npm run test:drive-surface-stability           ← Run on current build (was v=170)
npm run test:continuous-world-terrain-road     ← Already passing but re-run after any terrain.js changes
npm run test:playable-core-road-residency      ← Already passing, re-confirm after building changes
npm run test:drive-camera-smoothness           ← Already passing, sanity re-run
```

Run these in order. If performance-stability passes (≤20s firstControllable, ≤33ms frame) and building-continuity passes (far-region roads > 0), you have a shippable build. If either fails, fix that one issue first — everything else is either already passing or acceptable to ship with.

---

*End of Production Readiness Audit — 2026-03-24*
