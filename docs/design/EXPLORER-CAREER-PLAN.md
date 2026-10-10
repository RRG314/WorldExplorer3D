# Explorer career, campaigns and a world worth returning to

Design baseline: October 9, 2026. Implementation begins from `eb18b9c7` on
`steven/visual-quality`. This is an implementation specification, not a statement
that the later features already work. Delivery evidence is kept in
`EXPLORER-CAREER-DELIVERY.md` beside this document.

October 10 expansion: [Research careers and CERN](RESEARCH-CAREERS-AND-CERN.md)
defines broad specialist campaigns, mining, physical asset admission and reuse of
the existing Collision Lab. This extends the sequence below without resetting
existing progress or adding a separate progression authority.

## 1. Product direction

World Explorer is a browser sandbox in which a player builds a personal history
through travel, discoveries, practical challenges and places they make their own.
Earth, the ocean and space share that history. They retain distinct controls,
conditions and kinds of adventure. Live GPS is an optional way to explore Earth.

The repeatable loop is: choose a lead → travel and make a decision → perform an
observable action → keep the result → use or display what was earned → choose
the next adventure. Walking, driving, flying, swimming, building and free travel
remain available without completing the campaign. Existing saves, possessions,
qualifications and earned tools are preserved.

The opening campaign, **From the Harbor**, begins with an approachable field
record. Its first optional careers are Explorer, Pilot and Maker. Later chapters
connect a useful home, coastal research and planetary exploration. A player may
specialize; completing all careers is not a prerequisite for ordinary travel.

Target first experience: understand one objective, perform a real activity, see
its saved result and know what to try next. Target durations below are design
hypotheses, not measured performance or promises to players.

## 2. Current foundations and actual gaps

Source inspected directly for this plan:

| Existing owner | Retain and extend | Gap to address |
| --- | --- | --- |
| `discovery/profile-store.js` | IndexedDB transactions, event identity, Journal, backup/import, session-only fallback | Persist campaign progress with the underlying evidence; never depend on the most recent 100 rows |
| `discovery/explorer-events.js` | Six ranks, six badges, six activity paths | Campaign achievements need understandable requirements and durable receipts |
| `character/progression.js` | Specialty practice, deduplication, diminishing repetition rewards | Explain specialty progress separately from overall Explorer rank |
| `discovery/explorer-goals.js` | Existing earned tool thresholds | Its sequential suggestion can send everyone through collecting; campaign choices must not force an unrelated career |
| `tutorial/current-journey.js`, `tutorial/tutorial.js` | Movement → meaningful action → result → Journal teaching | Connect instruction to a persistent opening chapter without another overlay or tutorial store |
| `activity-discovery/completion.js` | Journal acceptance, retries, stable completion identities | Careers need authored tasks with decisions, reachable routes and clear outcomes |
| `expedition/campaign.js`, `universe/mission-catalog.js` | Voyage lifecycle, destination missions, evidence analysis | Many missions share four stages; field actions and outcomes need greater variety |
| `real-estate/connected-property-authority.js`, `housing-model.js` | Server-acknowledged property changes, local homes, wallet and inventory owners | A starter home needs useful, complete interactions before expanding the market |
| `live-gps/field-session-authority.js` | Foreground permission, accuracy/speed gates, no stored raw route | Public-access curation and mission content; personal GPS records are not verified competitive proof |
| `product/capabilities.js` | Honest availability and limitations | Mission offers must check live capability and target availability, not merely catalog membership |

The research vessel/multideck asset upgrade, remaining fleet/ship art and final
release videos are still open dependencies. A campaign description cannot finish
those systems. Regional scenery streaming does not certify interactive roads,
interiors or mission targets at arbitrary worldwide coordinates.

## 3. Player-facing structure

Use the existing Explorer panel, Journal, map and profile. The Today view shows
one selected chapter and one next action. Completed milestones appear in the
Journal and badges in the profile. Details and secondary objectives expand on
request. Existing compact control teaching keeps ownership of movement prompts.
No new always-open quest window, duplicate waypoint or row of currencies.

An offer shows its purpose, approximate length, available approaches, required
equipment, actual reward, save behavior and a way to leave. Ineligible missions
explain what is missing; absent or unfinished content is not offered as playable.
During play, show one objective and distance only where a valid target exists.
Use the existing navigation owner. Pause, retry, abandon and resume must be clear.

Completion shows what happened, what was saved, what was earned and two or three
real next choices. Distinguish saved-on-device, session-only and server-pending
states. No reward toast may claim a durable save before its transaction commits.

## 4. Opening campaign: twelve authored missions

Each card below specifies an implementable experience. H01 is the first delivery;
the other cards remain planned until their physical interactions and checks pass.
Times exclude world loading and can be adjusted after player observation.

### H01 — First Bearings (Explorer introduction; 3–8 minutes)

- Offer in an eligible loaded Earth location; Baltimore is the recommended start.
  Let an existing player participate without resetting their character.
- Accept the chapter explicitly, select an available local field lead, use its
  real interaction and produce one new Journal record in the accepted region.
  Observation and collection both qualify; buying, mere arrival and automatic
  world-visit records do not. A player can roam or choose a different local lead.
- Open the exact saved record, then explicitly finish the chapter from that
  record. Review cannot be satisfied by opening an unrelated Journal filter.
- Reward: permanent **First Bearings** chapter badge and completion memory.
  The discovery keeps its existing points; no extra currency or repeatable XP
  farm is introduced by the chapter. Follow-ups lead to existing fieldwork,
  routes/games and building entry points.
- Pause/resume retains the accepted region and result identity. The result must
  remain retrievable after it leaves the recent-history page. Save failures keep
  the chapter retryable. Completion and badge commit atomically and only once.

### H02 — Harbor Run (Pilot branch; 6–12 minutes)

- Accept a virtual delivery between validated curbside loading zones. Choose a
  shorter constrained route or a longer easier route; compare distance and turns.
- Load a visible case, drive the selected vehicle, stop inside the destination
  zone and unload. Passing through at speed is not completion.
- Result records delivery, arrival and optional handling distinction. Ordinary
  completion has no countdown; a separately chosen challenge can score time.
- Reward: Harbor Driver badge, a tested vehicle finish and further transport
  offers. Route validation must reject inaccessible buildings and disconnected
  roads; bridge/tunnel traversal uses the existing physical surface owner.
- On interruption, persist cargo custody and stage. Never duplicate the case or
  charge a second deposit. No personal data from real businesses is required.

### H03 — A Place in Three Views (Explorer branch; 5–12 minutes)

- Photograph a place from three different viewpoints: street context, a detail
  and its relationship to water, vegetation or the surrounding district.
- Use actual capture/framing, distinct viewpoints and visible subjects. Guidance
  explains what is missing; three identical captures cannot pass.
- Reward: a three-image album layout and photo display for the home. Retain
  user-selected images under bounded storage with delete/export controls.
- Photo access/storage refusal supports a clearly labeled observation variant
  with its own record, never a fabricated photograph.

### H04 — Make a Useful Place (Maker branch; 8–15 minutes)

- Enter a personal building space, choose a reading corner, workshop or display
  area, place a small functional arrangement and use its resulting interaction.
- Teach placement, rotation, undo and one spatial constraint. A chair or work
  surface must be reachable; counting arbitrary overlapping blocks is insufficient.
- Reward: Maker badge and the saved arrangement as a reusable local design.
- Undo before completion removes the qualifying object. Reload must restore both
  placement and usage. Shared room publication remains an explicit later action.

### H05 — A Place to Return (home chapter; 5–10 minutes)

- Available after H01 plus any one branch. Show eligible starter-home options
  with honest previews, arrival access and storage limitations.
- Claim one personal starter home, enter it, choose a display position and show
  an earned record/photo. Set it as a return destination and test that return.
- Reward: functional personal base with display, storage and journey board.
  Connected property ownership uses its server authority; solo home state uses
  the local housing owner. Neither grants rights over a real building.
- Avoid global scarcity for the starter home. No fake claim while a server write
  is pending; interrupted grants recover with the same transaction identity.

### H06 — Coastal Departure (ocean introduction; 8–15 minutes)

- Board the completed research vessel, walk to the chart, choose an eligible
  coastal survey site and review visibility/current conditions and an alternate.
- Moor at the survey area, prepare the deployed sub and identify the return
  ladder/cradle. Deck movement, doors, camera and transfer are acceptance gates.
- Reward: coastal voyage record and access to the next survey assignment. Free
  ocean play remains available. Real data includes source/time; modeled fallback
  is labeled and never represented as a live measurement.
- Reload resumes through the existing vessel/voyage owner; the same vessel and
  sub survive deployment/recovery. No second hidden ocean scene remains allocated.

### H07 — Read the Seabed (ocean investigation; 8–15 minutes)

- Search an area with incomplete information. Read actual sonar contacts and
  choose which to investigate; include distinguishable rock, habitat and artifact
  targets with observable evidence, rather than random success on a button.
- Maneuver and scan from a suitable angle/range; select a target for closer work.
- Reward: saved local survey chart and a working scanner enhancement such as
  contact annotation. Existing scanner-range progression is preserved and reused.
- Seed targets by stable geographic/site identity. Data failure retains the last
  valid target or offers an alternate; it cannot move a goal through solid ground.

### H08 — Outside the Hull (diving; 8–15 minutes)

- Park within a supported depth, choose a suitable dive opportunity, leave the
  sub, document the selected target and return to the same vehicle.
- Automatic equipment follows the existing water/depth rules. Third-person and
  underwater camera views keep the diver and target readable. Oxygen, depth and
  current change decisions without making an early return erase all evidence.
- Reward: Diver badge and a tested equipment option with a concrete benefit.
  Wildlife should have readable behavior and habitat-appropriate placement.
- Surface/board/recover paths, pause/resume and missing-vehicle recovery must work.
  Spearfishing is a separate later activity with actual aiming, projectile,
  underwater drag, hit/catch state and context restrictions—not a renamed survey.

### H09 — What the Coast Revealed (ocean conclusion; 4–8 minutes)

- Return to the vessel lab, compare contacts and observations, choose a supported
  conclusion and file the report. Distinguish observed, modeled and uncertain.
- Partial evidence produces a partial report with a clear route back, not a
  forced success. Different findings lead to different follow-up offers.
- Reward: Coastal Explorer badge, expedition display and a reusable coastal
  survey assignment. Reports are personal game records, not scientific claims.

### H10 — Preparing for Another World (space introduction; 8–15 minutes)

- Optional after a completed investigation; direct free-space access remains.
  Board Solis Reach, find briefing/lab/pod bay, and select a reachable destination.
- Prepare the actual instruments, learn return-to-ship/Earth controls, and choose
  an approach compatible with the destination and available equipment.
- Reward: saved expedition plan. No fake unlock for a controller that is missing.
- Ship traversal and Earth return must pass before this chapter is exposed.

### H11 — A Different Kind of Shore (planetary fieldwork; 10–20 minutes)

- First authored destination: Moon, using its implemented landing and geology
  tools. Compare two reachable sites and choose an observation/sample strategy.
- Land, perform distinct observations, manage return resources and reach the
  pod. Later planetary missions use their own hazards/actions; replacing the
  planet name in the same scan sequence is insufficient content variation.
- Reward: planetary field record, Lunar Surveyor badge on complete evidence and
  partial recovery when returning early. Scientific uncertainty stays explicit.
- All objectives persist through pod/ship transfers and bounded scene unloads.

### H12 — Bring the Journey Home (campaign conclusion; 5–10 minutes)

- Analyze the actual planetary evidence, publish a game expedition report,
  return to Earth and install a record at the player's base.
- Review a map of meaningful campaign decisions and choose a career to continue.
- Reward: From the Harbor campaign badge and a display set assembled from the
  player's real saved results. Full completion requires H01, one of H02–H04,
  and H05–H12; optional branch badges remain independently available.
- Campaign replay changes scenarios without paying the original one-time reward
  again. No deletion of old worlds, property, Journal entries or earned tools.

## 5. Careers and repeatable content

Explorer offers investigation, photography and habitat/geology comparisons.
Pilot offers road deliveries, precision landings and marine navigation. Maker
offers useful room layouts, vehicle/home customization and reviewed public
contributions. Each has short, medium and expedition-length choices. Existing
fishing, Flower Sprint and Paint Town remain optional games with their own rules
and shared Journal recognition; they are never mandatory research prerequisites.

Author six reusable assignment families after the first campaign works:
delivery, precision route, photographic comparison, field investigation, sonar
search and useful construction. Each template declares target requirements,
decision points, physical success conditions, partial outcome, reward and retry.
Procedural selection changes valid places/conditions/content, not just numbers.
Reject offers with missing targets instead of producing unfinishable missions.
Do not generate cinematic dialogue or factual claims at runtime as a substitute
for authored, reviewed content.

Regional authored packs add distinctive landmarks, materials, sound and stories.
Browser memory remains bounded: mission state stores identifiers and evidence,
not meshes, textures or retained scenes. Only the current mission target set is
active; distant goals resolve when their region is loaded and verified.

## 6. Rewards, balance and compatibility

- Overall Explorer rank recognizes breadth through the existing points owner.
  Specialty practice recognizes meaningful repeated skill through the existing
  character owner. UI explains the distinction without presenting ten meters.
- Badges recognize demonstrable achievements. They show requirement, earned date
  and related record. Do not award them for mere time online or opening menus.
- Equipment changes an action: annotation, visibility, operating range, storage
  organization or a new supported approach. Test the benefit in its actual scene.
- Cosmetics include vehicle finishes, suit details, ship flags and home displays.
  Assets must have provenance, correct scale/materials and browser-sized payloads.
- Credits retain their existing owner. Connected valuable grants require server
  acknowledgement and idempotency; offline personal chapter badges are not money.
- No new currency, paid data requirement, loot box or expiring daily streak.
  Missed days do not remove progress. Seasonal content should remain replayable.
- Balance targets for review: a first recorded achievement within the opening
  session; one useful choice per short chapter; optional distinctions for mastery.
  Measure these before promising fixed completion times.
- Keep old earned tools/qualifications. Any threshold change includes an explicit
  migration test and preserved backup; never silently relock the old inventory.

## 7. Homes, property and a useful economy

Personal homes provide safe arrival, bounded storage, record/photo displays,
vehicle presentation, a workshop and a journey board. Deliver each interaction
before advertising it. Personal instances avoid first-comer land monopolies.
Shared rooms and communal facilities are opt-in, permissioned and moderated.

After starter homes work, add themed room upgrades, garage functions, supported
docks and expedition equipment stations. Then evaluate rentals/trading with
server-owned transactions, cancellation, stale listing handling and concurrent
purchase tests. Do not turn homes into mandatory rent or upkeep chores.

Real listing data, GIS parcels and game valuation remain separate. Never invent
market listings or silently treat demo prices as real. The existing legacy
property API's demo fallback must be audited at its callers before a market
refresh. Claims and edits use stable property IDs, not transient stream-chunk IDs.
Player edits cannot obstruct core public travel or another player's campaign.

## 8. Live GPS and live Earth

First GPS pack: two reviewed routes—Local Discovery Walk and Photo Trail—with
short loops, accessible alternatives, explicit public access review and a stop
control. Foreground-only browser behavior and battery limitations remain clear.
Poor accuracy, speed, permission revocation and signal loss pause eligibility.
Do not guide people onto roads, restricted sites or live hazards. Map labels are
not access permission. GPS content does not require real-world collecting.

Real visits and virtual visits share a personal Journal but retain distinct
evidence labels. Provide equivalent worthwhile virtual activities. Browser GPS
does not establish server-trusted presence; valuable competitive rewards and
property claims cannot be based on it. Store minimum aggregates rather than a
public raw route or home coordinates.

Live weather, ocean samples, astronomy, earthquakes and cameras provide optional
context. Provider adapters keep source, timestamp, geographic support, freshness
and modeled fallback. A condition director selects only safe, supported gameplay
variants. Real disasters are not invitations to visit dangerous locations.
Unavailable feeds never block the campaign; static/model variants remain labeled.
Embed cameras only through allowed sources and preserve provider attribution.
Do not add paid subscriptions as a dependency for these chapters.

## 9. State and authority contract

Existing gameplay owners decide whether an action occurred. The Journal owns
accepted personal evidence. Campaign state projects only eligible committed
evidence and remembers stable event IDs; analytics observes the result and never
decides rewards. Wallet, inventory, property, room and voyage owners remain
separate. A central campaign coordinator must not become a second vehicle,
weather, location or inventory controller.

Each authored mission definition has: stable ID/version, eligibility, explicit
prerequisites, stage actions, actual success predicates, target identity,
partial/failure outcomes, reward owner, resume policy and acceptance tests.
Runtime progress has: definition version, accepted location/environment, stage,
evidence IDs, outcome, completion receipt and timestamps. No unbounded event
listener list, per-frame database scan or retained scene pointer.

For local milestones, evidence progression and completion must use the same
IndexedDB owner and transactional semantics as the Journal. Completion receipt,
badge and progress commit together. Duplicate clicks, two tabs, timeout retries
and reload cannot grant duplicates. Memory fallback is explicitly session-only.
Unknown future schema versions must not be silently downgraded. Backup/import,
rollback and older-save behavior require tests before release.

Cross-system connected rewards use server-validated receipts, not a client flag
that a chapter finished. Pending rewards remain visible and retryable. A player
can continue ordinary exploration while a noncritical connected grant is pending.

## 10. Art, performance and accessibility gates

Mission-critical objects need coherent material response, scale, silhouettes,
lighting and readable animation. A polished boat deck requires working stairs,
rails, doors, collision, ladder entry and camera—not just a better mesh. Underwater
targets need depth cues, visibility, sound and habitat placement. Night scenes
must retain character and objective readability without flattening all lighting.

Use existing budgets and measure on the observed 8 GiB host sequentially. Campaign
logic must do no continuous history scan and no extra world loading while idle.
Dispose mission markers/listeners on exit; repeat location changes and compare
retained resources. Streamed target loss pauses/re-resolves through its owner.

Keyboard and touch actions share completion rules. Interactive controls are at
least 44 CSS pixels high; narrow panels have no horizontal overflow. Do not rely
on color alone. Pause, captions/readable text and reduced motion need to survive
mission transitions. A phone-sized browser is not a physical-phone certificate.

## 11. Finite implementation sequence and exit criteria

| Step | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 | Source/authority inventory and this content specification | Verified owners, current limitations, no lost saves or deployment artifacts |
| 1 | H01 complete local opening chapter | Real field result → exact Journal review → badge; resume/retry/history/backup tests; desktop and narrow browser screenshots |
| 2 | Mission selection and the three H02–H04 career jobs | Each physically playable, distinct decision, durable outcome; invalid-target offers suppressed |
| 3 | H05 starter home and earned display | Claim/enter/display/return/restore; inventory and property authority checks; no duplicate grants |
| 4 | H06 vessel upgrade and coastal departure | Licensed art, every deck route, mooring, sub cradle, ladder/swimming and same-vessel recovery |
| 5 | H07–H09 ocean investigation | Sonar/dive/lab loop, partial return, wildlife readability, water/camera checks and complete save journey |
| 6 | H10–H12 space and campaign conclusion | Ship traversal, distinct lunar fieldwork, evidence analysis, Earth return and home display |
| 7 | Six repeatable assignment families and regional admission | Seed stability, reachable targets, variable decisions, unavailable-provider fallbacks, bounded resources |
| 8 | Two GPS routes and live-condition variants | Access review, permission/accuracy/speed/background tests, virtual alternative, provenance and privacy checks |
| 9 | Career rewards and home/economy expansion | All rewards have actual uses, preserved old entitlements, server transaction and concurrent grant tests |
| 10 | Co-op expedition roles and creator contributions | Shared objective authority, joining/leaving/reconnect, permissions, moderation and reviewed publishing; solo parity |
| 11 | Content/art/performance acceptance and release | Current package matrix, save/rollback, ordinary hosted and physical-device checks, honest known issues, current screenshots/videos |
| 12 | Post-release learning | Verified analytics ingestion, observed first-player sessions, completed seven-day cohorts, decision on the next content pack |

No step is complete because its buttons or catalog entries exist. Later steps may
reuse existing work after revalidation. Finish the acceptance criteria of a
playable slice before expanding its content count. Each step gets a checkpoint
and a specific evidence receipt. Deployment is a coordinated release, not a side
effect of writing this plan.

Co-op roles should combine different useful actions (pilot, observer, diver,
analyst) while allowing solo completion and fair personal credit. Do not require
a populated server for the opening campaign. Creator missions come only after
validation, reporting, moderation, budget limits and malicious-content handling;
player-authored text cannot execute instructions or change authorities.

## 12. Verification and measurement

Required model/storage cases: existing save with earned tools, duplicate events,
wrong region/environment, arrival-only events, aborted transaction, storage denied,
missing referenced record, old evidence outside recent history, repeated completion,
two-tab concurrency, import/rollback and future schema. Scenario checks cover
normal finish, partial finish, abandon/resume and provider/target loss.

Browser checks use actual controls and resulting saved records. Any test-only
actor placement is recorded separately from navigation and usability evidence.
The prescribed Develop Web Game client supplies keyboard bursts and screenshots;
all new visuals are inspected. External provider failures remain failures or
explicit degradation, never silent green results. Existing road/bridge/tunnel
owners are unchanged by campaign work and receive regression checks where a new
mission uses their routes.

Measure launch → first action → chapter accepted → evidence saved → chapter
completed → next chosen, with build/version and no precise player coordinates.
Track loading/failure/abandonment separately from enjoyment. Review first-session
completion, time to useful action, five active minutes and complete seven-day
return cohorts by device and acquisition source. Campaign acceptance is optional,
so free explorers are not automatically failures in that funnel.

Before claiming success, observe new players without coaching: can they identify
the task, perform the action, recognize the save and choose a next activity?
Pre/post observational changes are not automatically causal proof. Avoid paid
promotion until the landing promise, opening experience and measurement agree.

## Design references

- [No Man's Sky: Expeditions](https://www.nomanssky.com/expeditions-update/):
  grouped milestones, a journey and earned rewards. Adapt the structure without
  imposing expiring progress on World Explorer.
- [Sea of Thieves: Trading Companies](https://www.seaofthieves.com/trading-companies):
  several optional careers with their own assignments and recognition.
- [Geocaching placement guidelines](https://www.geocaching.com/play/guidelines):
  access permission and suitable real-world locations matter for GPS content.

These are precedents for design choices, not evidence that World Explorer has
implemented their systems or achieved their production quality.
