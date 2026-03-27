# Road, Bridge, Terrain, Overpass, Tunnel & Culvert Behavior Audit

**Date:** 2026-03-23
**Branch:** steven/continuous-world-full-rnd
**Scope:** Read-only audit — no edits, no patches, no commits
**Files examined:** structure-semantics.js, ground.js, physics.js, terrain.js, world.js, and test reports from elevated-driving-surfaces-global, ramp-contact-audit, drive-surface-stability, continuous-world-terrain-road

---

## Plain-English Summary (Read This First)

Think of your road system like a puppet with three separate puppeteers pulling different strings at the same time. `structure-semantics.js` reads the map data and decides "this road is a bridge, this one is a tunnel, this ramp connects them." `ground.js` is supposed to be the single source of truth for where the ground is. `physics.js` runs the car every frame and decides whether the car is on a road.

The problem is that the puppeteers are not talking to each other cleanly. Physics picks one road, then independently hands it to ground.js, which may pick a DIFFERENT road. Both systems have their own retention logic with slightly different tolerances. When everything works perfectly (car smoothly on a flat at-grade road) you don't notice. The moment there is an elevated road, a ramp transition, or a terrain height update happening mid-drive, the seams show up as the car sinking, teleporting, or losing contact.

The test data confirms this is not theoretical: 84 out of 110 elevated-road samples in the ramp-contact-audit fail. The drive-surface-stability test shows vertical seam jumps up to 3.85 world units. And every single sample point in the terrain-road test shows `roadsNeedRebuild: true` — meaning the road-to-terrain reconciliation is perpetually behind.

---

## 1. How Each Structure Type Is Currently Working

### 1.1 At-Grade Roads (the normal case)

**What happens:**
- OSM tags with no `bridge`, `tunnel`, or `layer` → `terrainMode = "at_grade"`, `verticalOrder = 0`
- `updateFeatureSurfaceProfile` samples terrain tile height at each road vertex and writes those values into `surfaceHeights[]`
- Road mesh ribbon follows the terrain contour
- Car uses `GroundHeight.driveSurfaceY`, which prefers road profile over raw terrain raycast

**What goes wrong:**
- `roadsNeedRebuild: true` appears at every sample point in the continuous-world-terrain-road test. This means the reconciliation pass (matching road Y to terrain Y) never finishes before the next streaming batch resets it. Road vertex heights and terrain mesh heights can disagree by up to the vertical resolution of one tile boundary — confirmed at 3.85 world units in the drive-surface-stability test.
- Root cause: every interactive streaming add increments `appCtx.roads.length`, which triggers `roadCountChanged = true`, which resets the sync queue. With 45 streaming steps loading New York streets, that is 45 resets.
- The fix in `primeRoadSurfaceSyncState()` only guards two explicit handoff points in world.js, not streaming adds.

**What it should do:**
Roads should always be within one sync cycle (< 18ms) of the terrain height at their vertices. Seam jumps over 0.3 world units should not be visible to the player.

---

### 1.2 Bridges

**What happens:**
- OSM `bridge=yes` (or `bridge=viaduct`, `man_made=bridge`) → `terrainMode = "elevated"`, `structureKind = "bridge"`, `gradeSeparated = true`
- `deckClearance = baseClearance + (verticalOrder - 1) * 3.4`. For a simple layer=1 bridge this is typically around 5–6 world units above terrain.
- `buildFeatureStations` finds crossing points with at-grade roads or waterways below and creates elevation target "stations" that define how high the deck should be at each crossing.
- `buildFeatureTransitionAnchors` runs on the at-grade approach roads connecting to the bridge, adding blend anchors so they slope up to meet the bridge deck.
- The road ribbon is rendered as a flat deck at the elevated Y, with road skirts disabled (`shouldRenderRoadSkirts` returns false for `elevated` non-transition roads).
- Structure visuals: support columns are generated. Motorway-class roads also get portal arch meshes.

**What goes wrong:**

First problem — contact failure at the foot of the bridge. When the car approaches from an at-grade road and the bridge deck is say 8 world units above terrain, the `isRoadSurfaceReachable` vertical threshold for `elevated` roads is 2.8 world units. If the car is at ground level and the bridge is 8 units up, the check fails. The car can only "find" the bridge when it is already climbing a ramp that feeds onto it. If a ramp is missing transition anchors (2 cases found in newyork_auto), the approach is completely blind to the bridge.

Second problem — `belowCapturedWrong`. The ramp-contact-audit flags 31 cases where `onRoadOk=true` (car is technically assigned to the road) but the Y position is wrong — the car is at ground level instead of deck level. This happens in `GroundHeight.roadMeshY` when the mesh raycast returns a value "too far" from the profile, triggers the `_shouldUseRoadMeshHeight` fallback, and falls back to a terrain Y instead of the elevated profile. The tolerance for elevated roads is 2.4 world units. On a 9-unit bridge that tolerance is far too tight if there is any vertical drift in the mesh sample position.

ramp-contact-audit summary: 110 elevated-road samples, 84 failures. 53 with `onRoadOk=false` (car falls off or never finds bridge). 31 with correct `onRoadOk=true` but wrong Y (ghost driving at terrain level beneath bridge deck).

**What it should do:**
On a bridge the car should be held at deck level. Approaching the bridge via a ramp, the car should smoothly rise up the ramp and be locked to the bridge deck. Driving off the end should release to the at-grade road on the far side. The car should never appear to sink through the deck or float below it.

---

### 1.3 Overpasses (one at-grade road crossing over another)

**What happens:**
- In OSM, an overpass is represented by putting `layer=1` (or higher) on the road that goes OVER, and `layer=0` (default) on the road below. Sometimes (but not always) `bridge=yes` is also present.
- If `layer > 0` is present: `verticalOrder = layer`, `deckClearance = baseClearance + (layer-1)*3.4`, `gradeSeparated = true`, treated the same as a bridge.
- If NEITHER road has a layer tag or bridge tag (common for simple at-grade crossings that happen to be at different elevations due to terrain): **both roads are treated as at-grade**. Both snap to the same terrain height. Both compute `onRoad=true` when the car is at that point. The system cannot distinguish "car is on the upper road" from "car is on the lower road."

**What goes wrong:**
When the overpass has layer tags: same issues as bridges above — contact failures and wrong-Y captures.

When neither road has layer tags (the more common real-world case for two roads crossing at a natural grade difference): `verticalGroup` for both is `"at_grade:0:at_grade"`. `isRoadSurfaceReachable` sees both roads as equally valid for the car's Y position. The wrong road may win. This shows up as the car randomly "choosing" to follow the lower road when it is physically on the upper road.

**What it should do:**
At a tagged overpass, the upper road should be the only road the car can be on when approaching from above. The lower road should be unreachable when the car is on the deck. At a natural terrain grade crossing without tags, the system should prefer whichever road is vertically closest to the car's current Y.

---

### 1.4 Tunnels

**What happens:**
- OSM `tunnel=yes`, `tunnel=flooded`, `location=underground`, or `location=underwater` → `terrainMode = "subgrade"`, `structureKind = "tunnel"`, `gradeSeparated = true`, `verticalOrder = -1`
- `cutDepth = baseDepth + (|verticalOrder| - 1) * 3.2`, minimum depth defined by `baseDepthForCategory`
- `buildFeatureStations` creates elevation targets that dip below terrain at crossing points
- Road profile: surface Y values drop below the terrain surface Y in `updateFeatureSurfaceProfile`
- `shouldRenderRoadSkirts` returns `true` for subgrade — skirts render at the road edges going down into the cut

**What it looks like in practice:**
There is no visual tunnel geometry. No walls. No ceiling. No portal mouth at the entrance. The car physically drives into the terrain mesh and sinks below it. The player sees the terrain surface but the car has gone underground. The road profile dips and the car follows it, but visually the car disappears into solid ground. Skirts mark the edges of the cut but do not form a tunnel shape.

This is a structural gap in the visual layer, not the physics layer. The physics (surface contact, locking) works reasonably well for tunnels because subgrade follows the same lock/retention system as bridges. But visually it is completely broken for a game context.

**What it should do:**
Tunnels should have portal entrance geometry and at minimum a ceiling mesh over the cut. The terrain in the cut zone should either be hidden or the road should have a cover. The car should not be visible sinking through an unbroken terrain surface. This requires generating tunnel-specific geometry, which currently does not exist anywhere in the codebase.

---

### 1.5 Culverts

**What happens:**
- OSM `tunnel=culvert` or `culvert=yes` → `structureKind = "culvert"`, `terrainMode = "subgrade"`, `cutDepth = max(baseDepth, 2.4)`. Treated identically to tunnels in physics and contact.

**What goes wrong:**
Culverts in OSM are typically small drainage pipes under roads — 60cm to 1.2 meters in diameter. They are not driveable. However the system has no size check. A culvert tag on any road creates a subgrade road profile and the car can "drive through" it as if it were a tunnel. In practice this means small farm drainage channels show up as tunnels the car can drive into.

**What it should do:**
Culverts that are below a minimum width (e.g. narrower than 3 world units) should not create a driveable profile. The car should treat them as impassable terrain. At minimum, they should not generate a road contact surface for the vehicle physics.

---

### 1.6 Ramps and Highway Links

**What happens:**
- `highway=motorway_link`, `highway=trunk_link`, etc. → `rampCandidate = true`
- `ramp=yes` tag or `placement=transition` also sets `rampCandidate=true`
- `buildFeatureTransitionAnchors` creates blend anchors at each endpoint where the link connects to an elevated road, targeting the deck height
- Surface profile: Y transitions smoothly from terrain level to deck level over the length of the ramp using smoothstep easing
- Retention lock: `shouldLockRetainedRoadContact` keeps the car on the ramp while `rampCandidate=true` (as long as not at an endpoint and not in a non-transition zone)

**What goes wrong:**
The ramp-contact-audit is the most telling test. 84 of 110 elevated-road samples fail. The Jones Falls Expressway (Baltimore motorway) and its motorway_link ramps appear repeatedly in the failure list.

The core issue: `maxAnchorOffset = 8.96` (the maximum height difference at a transition anchor, as reported for Jones Falls). At this offset, `roadSurfaceSameRoadTransitionRetentionThreshold` gives extra tolerance of `8.96 * 3.2 + 2.5 = 31.2` world units near the transition. But the base `roadSurfaceAttachmentThreshold` for a ramp (elevated rampCandidate) is only `2.8 + 1.15 ramp bonus = 3.95`. If the car is not already inside that retention zone, the 8.96m bridge is effectively invisible to `isRoadSurfaceReachable`.

In other words: the system works IF you drive smoothly from the at-grade road, onto the ramp, and up to the deck. It fails if you teleport to near the bridge mid-span, reload the world with the car near the bridge, or if a streaming update replaces the road contact while climbing. In those cases the car loses the elevated road entirely.

The second failure type (`belowCapturedWrong=true`): 31 cases where `onRoadOk=true` but the car Y is captured at terrain level. This means the physics says "you are on this elevated road" but `GroundHeight.driveSurfaceY` has returned a terrain-level Y. The car drives along the bridge invisible — it is physically there but drawn at the wrong height.

**What it should do:**
Driving onto an on-ramp should smoothly raise the car from at-grade to deck height. Mid-ramp the car should never lose contact or snap to ground. Approaching from the other direction (off a highway onto an exit ramp) should smoothly descend. Streaming reloads should not interrupt a ramp traversal.

---

## 2. The Dual Authority Problem (Root Cause of Most Bridge/Ramp Failures)

This is the single most important structural issue.

Both `physics.js` and `ground.js` independently implement road surface retention. They run in the same frame, on the same car, with different parameters.

`physics.js` (lines 483–510):
- `retainCurrentRoadContact(previousRoad, x, z, currentSurfaceY)` — `extraVerticalAllowance: 1.45`
- `shouldLockRetainedRoadContact(retainedRoad)` — locks elevated/subgrade/ramp
- Decides which road object to track

`ground.js` `_retainedRoadSurface` and `_shouldLockRetainedRoadSurface`:
- Same structural logic, `extraLateralPadding: 0.95` instead of `extraVerticalAllowance: 1.45`
- Has its own internal `_retainedRoad` state
- Called from `GroundHeight.driveSurfaceY` every frame to decide surface height

What this means: Physics may retain Road A (the bridge). Ground.js may independently retain Road B (the at-grade road below). Physics says car is on Road A. Ground.js returns the Y of Road B. Car height is wrong. This is the `belowCapturedWrong` failure mode.

The diagnostics snapshot (`getContinuousWorldValidationSnapshot`) calls `appCtx.GroundHeight.driveSurfaceY` to measure surface attachment — it sees Ground.js's retained state, not Physics.js's retained state. The two systems can silently disagree and no test currently catches it.

---

## 3. Terrain-to-Road Reconciliation (Why It Is Always Behind)

`terrain.js` uses a staged rebuild system: 48 roads per batch, resuming every 18ms. When finished, each road's `surfaceHeights[]` array has been rewritten to match the current terrain tile heights.

The trigger for a full reset is `roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount`.

Every call to `kickContinuousWorldInteractiveStreaming` that adds new roads increments `appCtx.roads.length`. With the interactive streaming interval at 260ms and a coverage cap of 10, in an active area you get roughly one streaming add every 260–900ms. Each add resets the sync.

The `continuous-world-terrain-road` test (driving East McComas Street) showed:
- `roadsNeedRebuild: true` at every single sample point (12 of 12)
- `lastSurfaceSyncSource: "terrain_tiles_pending"` at the first two samples (sync not yet started)
- Up to 199 sync requests during the drive

This means the roads under the car are frequently being reconstructed while the car is driving on them. The sync batch has 48 roads per pass, and the roads closest to the actor get priority, but a reset mid-batch means those roads may not be reprocessed until several more streaming events complete.

At terrain tile boundaries — where one tile's height data meets another — a road that spans the boundary has `surfaceHeights` computed from the older tile on one side and the newer tile on the other. This produces the seam jump (up to 3.85 world units confirmed in `drive-surface-stability`).

---

## 4. Visual Gaps by Structure Type

| Structure | Road Profile | Road Mesh | Structure Visuals | Tunnel Geometry | Car Contact |
|---|---|---|---|---|---|
| At-grade | Terrain-following | Yes, rebuilt with terrain | None | N/A | Works; seam jump at tile boundaries |
| Bridge | Flat elevated deck | Yes, at deck height | Supports + portals | N/A | Works mid-bridge; fails at approach if no ramp or missing anchors |
| Overpass (tagged) | Same as bridge | Yes | Supports | N/A | Same as bridge |
| Overpass (untagged) | Terrain-following | Snaps to terrain | None | N/A | Both roads compete; wrong road may win |
| Tunnel | Dips below terrain | Yes, below terrain surface | None | None | Physics works; visually car sinks into solid terrain |
| Culvert | Dips below terrain | Yes | None | None | Physics works; any width treated as driveable |
| Ramp/Link | Blended transition | Yes, transition shape | None | N/A | Works when smoothly approached; fails after reload/teleport |

---

## 5. What Each Failure Looks Like in the Game

**Bridges**: Car drives up to bridge, loses contact, drops to terrain level, then suddenly snaps to deck when the lock kicks in. Or: car is "on the bridge" but visually floating at the wrong height (3–9 world units below deck).

**Overpasses**: Car switches between upper and lower road randomly. Oncoming traffic appears to drive through the overpass deck. At unmarked crossings, car may snap down to the lower road mid-crossing.

**Tunnels**: Car drives toward tunnel entrance, appears to drive into an unbroken terrain surface, disappears. No portal, no ceiling, no walls. From outside the tunnel the car is invisible (underground). From inside it looks like driving on a floating road with no environment around it.

**Culverts**: Car can "drive into" a 60cm drainage pipe under a country road because the culvert has a subgrade road profile that is technically driveable.

**Ramps**: Smooth on a cold boot when the world loads cleanly. After any streaming reload near the ramp (interactive streaming, city change, session reset), the car may lose the elevated road entirely. 84/110 test probes fail. This is a persistent, reliable failure mode on any highway interchange.

**Terrain seams on flat roads**: Occasional 0.3–3.85 world unit vertical jump at the boundary between two terrain tiles. More visible at speed.

---

## 6. What Is Working Correctly

- The OSM tag classification in `classifyStructureSemantics` is comprehensive and correct. It handles bridge, tunnel, culvert, layer, level, min_height, placement=transition, ramp=yes, indoor, covered, building_passage, skywalk, and location tags properly.
- The lock retention mechanism (`shouldLockRetainedRoadContact` / `_shouldLockRetainedRoadSurface`) correctly identifies when to hold a car on an elevated or subgrade surface during mid-span travel. Once locked, mid-bridge driving is stable.
- The transition anchor blending (smoothstep easing) for ramps produces the correct shaped profile. The math is right; the failure is in whether the anchor computation fires for every approach.
- Structure visual generation (support columns, portal meshes) works for bridges that do have geometry loaded. Baltimore Biddle test: 23 supports correctly placed.
- Terrain streaming and surface sync architecture is sound — the staged partial rebuild with bounds-scoped pruning is the right approach. The failure is in the trigger condition (every streaming add resets it), not the rebuild logic itself.

---

## 7. Specific Findings by Severity

### CRITICAL

**C1 — Dual authority between physics.js and ground.js for road surface retention**
Files: `app/js/physics.js` lines 483–510, `app/js/ground.js` `_retainedRoadSurface`
Both systems track retained road state independently with different tolerances (`extraVerticalAllowance: 1.45` vs `extraLateralPadding: 0.95`). When they disagree, the car is assigned to one road by physics and gets height data from a different road via ground.js. This is the mechanism producing the 31 `belowCapturedWrong` failures in ramp-contact-audit (car on bridge at wrong Y).

**C2 — Road surface sync perpetually reset by streaming adds**
Files: `app/js/terrain.js` `roadCountChanged`, `app/js/world.js` `kickContinuousWorldInteractiveStreaming`
`roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount` fires on every streaming batch. With interactive streaming adding roads every 260–900ms, the sync queue resets before completing. Every sample in the terrain-road test confirms roads are always in need of rebuild. Seam jumps up to 3.85 world units confirmed.

### HIGH

**H1 — Elevated road approach failure (53/110 probes `onRoadOk=false`)**
Files: `app/js/structure-semantics.js` `isRoadSurfaceReachable`, `roadSurfaceAttachmentThreshold`
Base vertical attachment threshold for elevated roads is 2.8 world units. The Jones Falls Expressway sits 8.96 world units above terrain at its anchor. A car at ground level cannot "find" this road until it is already within 2.8 units vertically. Any interruption to smooth approach (reload, teleport, streaming reset) loses the elevated road entirely.

**H2 — Tunnels have no visual geometry**
Files: `app/js/structure-semantics.js` `shouldRenderRoadSkirts`, world.js structure visual generation
Tunnels generate a subgrade road profile (car sinks below terrain level) but zero visual geometry — no portal, no walls, no ceiling. The car visually sinks through an unbroken terrain surface. This is a complete visual gap for any tunnel in the game.

**H3 — Ramp contact fails after streaming reload (84/110 total probe failures)**
Files: `app/js/structure-semantics.js` `buildFeatureTransitionAnchors`, physics.js retention logic
After any streaming reload near a highway interchange, ramp anchors may not yet be computed against the new set of surrounding roads. The ramp has the right profile shape but the contact zone for picking up the elevated road is momentarily absent. Confirmed across Jones Falls Expressway, Lincoln Tunnel Expressway, and multiple other locations.

### MEDIUM

**M1 — Untagged overpasses produce road contact ambiguity**
Files: `app/js/structure-semantics.js` `classifyStructureSemantics`
Two at-grade roads crossing at different natural terrain heights have no way to distinguish upper from lower. Both get `verticalGroup = "at_grade:0:at_grade"`. `isRoadSurfaceReachable` treats both as equally valid. Car picks the wrong road at natural grade crossings.

**M2 — Culverts treated as driveable tunnels**
Files: `app/js/structure-semantics.js` lines 1165–1167
`tunnel=culvert` → `terrainMode="subgrade"`. No minimum width gate. Any culvert, regardless of physical size, creates a driveable profile. Storm drain mapped as a culvert in OSM becomes a car-accessible underground passage.

**M3 — Camera-only turns do not trigger LOD update**
Files: `app/js/world.js` `updateWorldLod`
Road visibility is gated on `moved >= minMoveForLodUpdate` (8 world units for drive mode). A camera rotation without forward movement never triggers a road visibility update. Roads hidden before a turn stay hidden.

### LOW

**L1 — No bridge sub-type classification**
Files: `app/js/structure-semantics.js` `classifyStructureSemantics`
`bridge=viaduct`, `bridge=aqueduct`, `bridge=cantilever` all collapse to the same `structureKind="bridge"`. No `bridge:structure` tag is read. All bridges get the same clearance formula and the same support visual style regardless of real-world type.

**L2 — No `maxheight` tag consumption**
Files: `app/js/structure-semantics.js` `classifyStructureSemantics`
OSM `maxheight` records the actual physical clearance under a bridge. It is not read. `deckClearance` is computed from a formula (`baseClearance + verticalOrder*3.4`). For structures with known clearances in OSM this produces unnecessary approximation.

**L3 — Diagnostic snapshot uses ground.js path only**
Files: `app/js/continuous-world-diagnostics.js` `roadSnapshot`
`getContinuousWorldValidationSnapshot` calls `appCtx.GroundHeight.driveSurfaceY` to measure surface attachment. This reflects ground.js's retained state, not physics.js's retained state. A `belowCapturedWrong` failure is invisible to the diagnostics — the snapshot sees the car as attached when the visual position is wrong.

---

## 8. Do Not Touch

- The entire `classifyStructureSemantics` function. The tag reading logic is correct and comprehensive. Any change risks reclassifying thousands of roads globally.
- The `updateFeatureSurfaceProfile` profile math. The smoothstep easing and anchor blending are correct. Changes here directly affect road shape across every city.
- `buildFeatureStations` crossing detection. Finding crossing points and building elevation targets is the hardest part of the system. It is working. Do not modify.
- The terrain streaming tile system (`terrain._surfaceSyncMode` batch architecture). The staged rebuild is the right design. Fix only the trigger condition.
- `normalizeStructureEndpointHeights`. This is a subtle but important pass that prevents floating endpoints at bridge-to-road junctions. It is working. Leave it.

---

## 9. Recommended Fix Order

**Pass 1 — Stop the bleeding (low risk, high payoff)**

1. Fix the `roadCountChanged` reset trigger. Instead of resetting on any count change, reset only when roads are REMOVED (count decreases) or when the delta is large (> 50 roads added at once). Streaming adds of 1–5 roads should not reset a sync that is mid-batch. This directly addresses C2 and should resolve the perpetual `roadsNeedRebuild` state.

2. Make the road sync scope aware of the streaming add. When a streaming add fires, trigger only a bounded sync around the newly added roads' extent, not a global reset. The bounded sync machinery already exists (`getActorLocalSurfaceSyncBounds`, `rebuildScopeIncludesRoad`).

3. Gate culverts by feature width. If a culvert road's `width` property is less than 3 world units, mark it as `impassable=true` and skip it in road contact queries. One-line guard in `isRoadSurfaceReachable`.

**Pass 2 — Fix the dual authority (medium risk, required for bridge/ramp correctness)**

4. Unify road retention state. Physics.js should pass its retained road reference INTO `GroundHeight.driveSurfaceY` as a parameter rather than relying on ground.js to independently re-derive it. Ground.js `_retainedRoadSurface` should accept an override: "physics already decided this road, use it." This eliminates the state disagreement.

5. Raise the elevated approach threshold OR use a separate vertical "search radius" for finding elevated roads during the initial approach phase. The current 2.8-unit threshold assumes the car is already near deck height. For approach, a separate "acquisition radius" (maybe 12–15 units vertical) should find the nearest elevated road, after which the standard 2.8-unit lock takes over. This addresses H1 and reduces H3.

**Pass 3 — Visual completeness (higher risk, requires new geometry)**

6. Tunnel portal geometry. At each tunnel endpoint, generate a simple portal mouth mesh: a flat arch shape with the opening matching `cutDepth` and road width. This does not require a full procedural tunnel tube — just the entrance facing.

7. Override terrain visibility in tunnel cut zones. Where `terrainMode = "subgrade"` and the road dip is >= 2 world units below terrain, suppress the terrain tile face at that location. This prevents the visual "driving into solid ground" effect. Terrain tiles do not currently have per-vertex masking, so this may require either a cutout geometry or a transparent material zone.

8. LOD trigger on camera turn. Remove the movement-only gate from `updateWorldLod`. Run LOD evaluation any time camera orientation changes more than a threshold (e.g. 15 degrees since last evaluation), independent of actor movement.

---

## 10. Regression Risks

- Any change to `roadCountChanged` triggers or surface sync timing risks road vertex heights being stale during aggressive streaming. Must be tested with the continuous-world-terrain-road suite after change.
- Any change to the `isRoadSurfaceReachable` vertical threshold affects ALL road contact globally, not just bridges. Changes must be gated to `gradeSeparated=true` only.
- Any change to `driveSurfaceY` parameter passing has a direct effect on car height every frame. Must test across all modes (drive, walk, boat, drone) since `driveSurfaceY` is also called from walk mode in some configurations.
- Tunnel portal geometry will require new Three.js geometry generation. Any error in geometry disposal will increase the texture/geometry counts that are already at the warn threshold.

---

*End of Road/Structure/Terrain Behavior Audit — 2026-03-23*
