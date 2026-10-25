# Earth world modes: feasibility and product scope

October 24, 2026. Current-source assessment requested by the owner, who wants to
avoid repeating a failed continuous-world approach. This is an architectural
decision and a small model-level check, not a new worldwide gameplay certificate.

## Recommendation

Keep **selected-location Earth gameplay as the browser game's foundation**.
Preserve the optional Earth scenery extension and the separate continuous ocean
option. Retain arbitrary supported location selection, Live GPS, progression,
assets, activities, personal rooms and the canonical weekly room.

The inspected stack has no demonstrated fundamental incompatibility with bounded
geographic streaming. The existing Earth scenery streamer covers only part of a
complete playable world. Extending that option into seamless city-to-city walking,
driving, landing, interiors and activities is substantial additional world work.
It is not a setting change or another renderer's installation.

The current default already matches this recommendation. No game code, defaults,
saves, room rules, provider settings or deployments changed in this assessment.
This finding does not promise that location mode alone fixes current loading or
performance defects.

## What the current implementation actually does

| System | Current source evidence | Implication |
| --- | --- | --- |
| Location mode | `readRegionalSceneryPreference` returns false for absent/denied storage; saved explicit on/off is respected. The Settings copy describes its limited scope. | New players retain the fixed-location foundation; the optional mode already exists. |
| Earth moving scenery | `far-field.js` moves a replaceable terrain/building/water/road-overview window. Terrain has a height sampler; the detailed district and its building/entrance/activity indexes retain separate ownership. | Visible new scenery is insufficient evidence of complete interactive gameplay there. Terrain sampling does not establish building collision or interior admission. |
| Physical roads/structures | `load-roads.js` loads selected-location transport, including fixed regional context. `planTransportRegions` partitions those supplied tiles; the moving detail window compiles/evicts within that finite source. | Moving road mesh residency is implemented. Fetching an unlimited succession of new playable geographic sources is not established by that planner. |
| Coordinates and resume | `earthCoordinateFrame` converts from a selected origin. `earth-session.js` captures local poses and restores the loaded selection. | Geographic conversion is useful groundwork. It is not an atomic Earth rebase of actors, cameras, physics, navigation, saves and peers. The moving scenery path also explicitly rejects unsupported projection bounds. |
| Multiplayer | `room-world-policy.js` shares one Earth origin; choosing another location leaves the room and mismatched Earth-frame poses are withheld. | Personal and weekly rooms fit selected locations. This is an origin rule, not an enforced distance fence or worldwide multiplayer partitioning. Interior/marine/space frames retain their own contracts. |
| Ocean | The depth owner limits windows to at most nine tiles and two requests. Its own reprojection and separate voyage-save version preserve geographic position. | This is an actual bounded continuous subsystem. It is simpler than carrying Earth streets, buildings, entrances and activities together and does not certify Earth worldwide gameplay. |
| Resource use | Earth scenery replaces a large window while retaining the accepted old publication through staging. Source/window/region caps and leases exist. | One job at a time is useful but does not by itself prove acceptable whole-app peak memory or mobile frame pacing. |

Current source: [Earth preference/scheduler](../../app/js/terrain/regional-scenery-scheduler.js),
[scenery publisher](../../app/js/terrain/far-field.js),
[transport planner](../../app/js/terrain/transport-detail-plan.js),
[selected source](../../app/js/world/fixed-regional-context.js),
[world loader](../../app/js/world/load-roads.js),
[Earth coordinates](../../app/js/earth-core/coordinate-frame.js),
[Earth resume](../../app/js/earth-session.js),
[room policy](../../app/js/multiplayer/room-world-policy.js),
[ocean depth owner](../../app/js/ocean/stream-depth.js), and
[ocean frame handling](../../app/js/ocean/stream-runtime.js).

## The earlier fallback and the new loading failure

The [October 14 continuity record](../road-continuity/EVIDENCE.md) documents a
failure matching the owner's recollection: road-readiness checks could reject
contact retained by another surface owner; a failed moving job terminated its
worker, and recovery prompted a world/menu reload. The owner authorized the
location-based fallback. The scoped repair corrected surface ownership/retry
within the existing finite source and preserved bridges/tunnels and progress.
That historical repaired bug is not asserted to remain present today.

The [October 6 readiness record](../continuous-world/WORLDWIDE-READINESS.md)
separately records the unfinished global source, coordinate, interaction and
resource boundaries. The October 20 publication/portable-cell cleanup improved
ownership within the supported scope. Its finite-area route evidence did not
turn that scope into worldwide interactive Earth gameplay.

The October 24 San Francisco initial load and its displayed Retry both returned
`Street source superseded`. Those captures used fresh isolated browser contexts,
and the capture driver never enabled Earth scenery extension. Together with the
current off-by-default preference, this supports classifying it as a separate
selected-location loading fault, not proof that continuous scenery caused it.
Its root cause remains unestablished. Preserve and repair it without relabeling a
mode switch as the fix.

## Practical endpoint and a finite future go/no-go check

The browser product endpoint is reliable selected-location gameplay, personal and
weekly rooms sharing their selected origin, optional Earth scenery extension,
and the existing separate ocean option. Preserve existing assets, accepted road/
bridge/tunnel surfaces, location choice and saves. Do not grow the full-world
promise simply because more distant geometry can be drawn.

If seamless ground travel is pursued, prove **one real route through three
neighboring newly sourced playable areas and back twice**, outside the original
source domain. Reuse existing session, frame-queue, cell-publication, actor and
lease owners. Completion requires all of the following in that slice:

- New geography supplies terrain, physical roads/structures, building contacts,
  entrances/POIs and an activity coherently before the player uses them. Include
  a bridge, tunnel and an interior/landing admission path.
- Returning preserves edits/progress; movement never invokes full location reset
  or forces a page/menu reload. Provider failure retains a safe published state.
- One origin-change exercise preserves geographic poses, camera/physics state,
  compatible save records and two peers' agreement.
- The second equal route cycle stabilizes retained resources. Measure residents,
  staging/source/worker data and GPU allocations together, with existing gameplay
  budgets on desktop and a real target Android device.
- Provider use is permitted and bounded. Free geographic data is not an unlimited
  guaranteed tile-hosting service.

Until that slice passes, keep the current product boundary. A failed slice calls
for a diagnosed bounded repair or retaining location mode, not expanding regions
and repeating the entire release sweep. This assessment does not begin that
larger implementation or the Godot port.

## Verification and evidence limits

Both live manifests were freshly read: production
`5.6.1+b48f27561a9c.b114089627016e66.production` and staging
`5.6.1+b48f27561a9c.414b57dc65f2c2f5.staging`, compiled source
`b48f27561a9c751405e0b2b4437391c23763dd8b`. The tracked tree was clean at entry.

Seven focused scenarios using actual current modules passed in one small Node
run: default/opt-in preference, scenery-versus-finite-road-source behavior,
high-flight/landing detail admission, returning the scenery anchor to the chosen
location, room origin compatibility, ocean pose reprojection and bounded ocean
window keys at representative polar/date-line coordinates. The transport example
uses five controlled source regions. It is model evidence, not a real-city trip,
provider test, phone benchmark or worldwide acceptance run.

Receipts and source hashes are under
`output/research/world-mode-feasibility-2026-10-24/`. Prior October 20 finite-area
integration and October 23 release gameplay evidence retain their original scope.
No full-city load, historical release sweep or physical-device test was repeated.

Two current external references support the constraints, not this game's
completion: [MDN WebGL memory budgets](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#estimate_a_per-pixel_vram_budget)
recommends explicit resource budgeting across differing hardware;
[OSMF vector service policy](https://operations.osmfoundation.org/policies/vector/)
states limited capacity, best-effort availability and restrictions on advance
bulk downloading. The source currently uses that Shortbread service. This is not
a new finding of provider-policy noncompliance or an infrastructure change.
