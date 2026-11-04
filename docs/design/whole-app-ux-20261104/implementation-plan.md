# Bounded implementation and validation plan

The owner has selected NOVA and authorized implementing the full working redesign and a staging candidate. [NOVA delivery](../NOVA-DELIVERY.md) records that decision, its image policy and current fixed stops. The architecture/ownership requirements below remain; old Roam appearance and design-selection holds are superseded. **Production deployment is prohibited for this redesign.**

## Definition of done and scope control

The redesign is complete when every retained feature has a reachable, understandable destination; navigation means the same thing across domains; the intended task and its real save/result state are clear; controls and layouts meet the agreed access contract; and affected real journeys and compatibility checks pass on one identified candidate. A working card, source presence or attractive mockup does not satisfy those exits.

Use the 172-entry feature inventory and72-surface crosswalk as parity inputs. Keep all 20 careers,3 selected racing venues/pits, existing real vehicles, garage/condition/upgrades, rivals/crews, races/results/leaderboards, track methods, location-based play, optional regional exploration, Ocean, Space, buildings, creation, saves, mobile, VR, Portal and native integrations. No new career, venue, currency, cloud-sync promise, engine or purchased asset belongs to this redesign.

Each phase ends at its explicit exit. Record the source change, affected evidence, preserved evidence and remaining limits in a short receipt, then close it. A failure reopens its affected boundary; it does not restart earlier career/venue acceptance. New functional defects are triaged to the original owner with a bounded fix and separate acceptance. Do not keep adjusting a feature after its exit to avoid moving to the next phase.

## Delivery slices

| Phase / deliverable | Specific implementation boundary | Acceptance and hard stopping point | Main audit links |
| --- | --- | --- | --- |
| 0 · Select and validate the design | Choose A/B/C/default; agree global labels, audience, guidance and first-use/returning flow. Test grouping before moving UI. | Written selected direction and disposition of each critical task/label issue. End design iteration after two planned comparison rounds unless a documented structural blocker warrants another. No application implementation in this phase. | UX01–08,17 |
| 1 · Feature parity and presentation contracts | Reconcile inventory to existing entry/action IDs and catalog adapters. Add only missing presentation metadata and a read-only navigation/task model. Audit all 72 current surfaces; classify panel vs modal vs instrument. | Every inventory row has an owner, entry/remedy and destination; no duplicate IDs, unowned actions or intentionally hidden legacy controls exposed. Context, save-scope and readiness types are explicit. No new gameplay, save, input, scene or reward authority. | UX06,12–16 |
| 2 · Shared navigation and panel framework | Extend existing ScreenLayout, focus/modal handling and Roam components. Standardize global destinations in selector, Earth, vessel/sub and Space; provide phone/landscape/spatial adapters. Preserve callbacks/aliases while migrating one group at a time. | Same section/action semantics in all context fixtures; one intended foreground panel; Back/Escape, focus, pause and world input restore correctly. Account/world replacement cancels stale UI work. Stop before restyling all content or changing gameplay. | UX01,04,07,13,15 |
| 3 · Start, Explore and destination hierarchy | Implement new/returning start, readable world shortcuts, atlas/list/search, compatible-place summaries and clear inspect/travel boundaries. Compose existing place/body/portal policies. De-emphasize recruitment and specialist coordinates. | New player can enter free exploration or a supported guided start; returning player can distinguish Continue, Return and Resume voyage. Planet/system names are unambiguous; unsupported landing/travel has an honest remedy. Map/list, denied GPS, loading/cancel/failure and phone primary actions work. No coordinate or streaming rewrite. | UX02,03,05,07,11,16 |
| 4 · Activities, objective and career workspaces | Add interest grouping and a small honest starting set plus Browse all/search. Use all 20 existing adapters. Apply shared task/result summaries and optional specialist instruments. Compose with the existing tutorial/objective visibility policy. | All20 IDs retain their procedures, original progress and readiness. One chosen next action; other work can pause and resume. A genuine existing report/result links to Journal and a valid next step. Check one representative changed workspace pattern, then component/parity coverage for the rest; do not replay every accepted science case or full lap. | UX02,08,10,12 |
| 5 · Journal, kit, progression and save health | Make Journal direct everywhere; connect records/photos/collections/skills/companions. Show contextual kit, original result benefit and local/account/room persistence. Reuse existing save-status and backup/commerce recovery UI. | Genuine separate saved histories, original photos and custody survive navigation/reload/export/import at the changed boundary. Pending/failed saves and unknown online commands remain retryable without duplicate reward/charge. Login does not imply local-to-cloud sync. No destructive migration or photo pruning. | UX06,08,14,18 |
| 6 · Create and Together | Recompose existing track methods, Blocks, home/workspace/capture and submission status; room/friend/invite/roles/safety flows. Keep private, room-shared and reviewed-public states clear. | Every existing creation/share entry remains reachable; draft/cancel/validation/revision/acknowledgement and permission denial are truthful. Overhead, drive-recorded and roadless track methods retain clean layouts and barriers. Test only affected editor/permission/room transitions; no new track engine or server authority. | UX07,14,15 |
| 7 · Context HUD and specialist domains | Apply shared hierarchy/tokens to movement, marine actors, ship/interior stations, planetary survey, solar/deep-space navigation, racing and editors. Adapt information by active task/actor, not by hiding global navigation. | Required instruments, condition/health, air, course, vehicle identity, current input and recovery stay readable. No conflicting touch zones or unnecessary persistent panels. Units and modeled/live provenance remain correct. Ship/pod/sub/rover roles and existing render/lifetime owners stay intact. No physics or game-scale changes. | UX03,04,09,10,16 |
| 8 · Accessibility and actual usability | Evaluate the affected shell, tasks and controls with relevant users/inputs/devices. Finish text/contrast/target/keyboard/screen-reader/non-drag/hold alternatives, short viewport and motion support. Adapt native/Portal/widget/XR surfaces through their existing platform owners. | Critical tasks succeed to the agreed thresholds; no unresolved critical task blockers, focus traps, inaccessible primary actions or unreadable essential state. Actual phone/controller/headset/native checks are recorded separately; a desktop mockup cannot close them. If access to a required device/cohort is missing, record that exact limitation rather than claim universal access. | UX09,13,17 |
| 9 · Review and exact candidate | Required repository checks; targeted integration of changed navigation/save/lifecycle boundaries; clean PRs, one immutable candidate, exact images/release review, rollback compatibility and hosted identity. | Accepted old evidence is explicitly retained. New candidate identity and changed-journey evidence agree; user review and existing release guards pass. Preserve current production artifacts/user data/history. Stop at a documented qualified release or a concrete blocker; never deploy the design study or manufacture human/hardware acceptance. | All |

Phases 2 and 7 are related but intentionally bounded:2 establishes interaction/navigation behavior with retained content;7 completes domain-specific presentation. Do not call the entire app redesigned after only Phase 2. Phases 3–7 should each use small reviewable PRs grouped by a real journey, not repeated button patches without the shared contract.

## Interfaces and architecture decisions to settle before code

| Presentation contract | Facts supplied by existing owners | Must not do |
| --- | --- | --- |
| Navigation target | Section, view, portable record ID and return location | Store a renderer/DOM object or hijack geographic navigation state. |
| Task summary | Experience ID, actual phase, next action, existing readiness and save scope | Advance the task, grant a reward or guess that a place is suitable. |
| Context action | Resolved action ID, label, enabled/reason, current input prompt | Duplicate physics/boarding/permission logic or consume input behind a modal. |
| Result view | Original result/report/media IDs, confirmed benefit and next valid choice | Create a synthetic completion, merge independent histories or show pending online results as accepted. |
| Save-status view | Device, account, room, queued/unknown, confirmed or failed state | Treat Firebase sign-in as whole-save cloud synchronization. |
| Platform presentation | Existing input/lifecycle/capability facts plus the same action IDs | Make a second game loop or infer hardware qualification from web screenshots. |

Use existing catalogs/adapters and `ui/screen-layout.js` as the composition points. Keep current `session-coordinator.js`, gameplay registry, world publication, action-input, interaction resolver, profile/Backpack/voyage/character stores and server authorities. The CSV and prototype are review artifacts, never new runtime permission or progression registries.

## Acceptance matrix and preservation rules

| Boundary | New evidence required when changed | Accepted work to reuse |
| --- | --- | --- |
| Navigation framework | Route/action parity; modal/nonmodal distinction; Back/Escape/focus; selection and draft retention; cancel during async load; world/account replacement | Existing unchanged domain gameplay rules and source ownership checks. |
| Responsive/access | Desktop,390×844 portrait,844×390 short landscape, reduced viewport/keyboard and100/200% text; actual input/assistive checks | Earlier layout acceptance only for untouched surfaces. Browser emulation is not physical-device evidence. |
| Context play | Enter a representative current Earth/interior, vessel/sub/diver, Space, planetary and editor context; open/use/close only changed controls and return safely | Earlier full laps/pits, scientific cases, traversal, shared authority and condition mechanics unless a changed boundary affects them. |
| Data/results | Genuine existing progress/photos, failure/retry, reload, export/import and old/new reader compatibility where UI touches it; compare original IDs/bytes | Accepted separate histories and version fences; no fabricated combined checkpoint or QA account churn. |
| Creation/social | Existing private draft/room/publish scope, permission denial, reconnect and late acknowledgement at changed entries | Accepted geometry, track smoothing/barriers, wallet/custody/reward and server lease contracts when unchanged. |
| Platform | Qualified deep-link/return, orientation/native widget semantics; physical seated/recenter/menu/exit/comfort for changed XR presentation | Existing platform/backend evidence at untouched boundaries, with its original limits. |
| Release | Required CI, technical review, immutable artifact/source identity, exact images, rollback and live configuration | Current deployed release as preserved fallback; no deletion of source/assets/player data/history/failed evidence. |

## Uncoached research and decision criteria

Run a small initial qualitative round across mixed experience/age/reading/input needs, then a second round on the selected corrections. Suggested initial recruitment is 8–12 people across relevant cohorts, not a statistically representative claim. Include novice adults, returning players, older/low-vision or motor-access participants, mobile users and appropriately supervised younger readers. Add focused screen-reader/controller/XR participants where those experiences are promised; one small group cannot represent every access need. Use the same tasks in each option; rotate option order.

Critical tasks, without telling participants which menu to use:

1. Start exploring a chosen Earth place without signing in; find help with movement.
2. Choose an interest, understand a career's next step and locate missing equipment.
3. Leave and later resume work; explain where it is saved and whether another device has it.
4. Find a kept photograph/report and understand the benefit earned from the actual task.
5. Reach an Ocean vessel/dive option and identify how to return safely.
6. Inspect a star/system/body, distinguish observation from course/landing, and cancel travel.
7. Find all three track creation methods, inspect the clean layout and explain who can see it.
8. Join or leave a room, understand the shared role and find block/report.
9. Increase text size/remap an action and return to play without losing the task.
10. Open a saved place/task through a supported Portal/native entry and understand the return context.

Record task success, first wrong destination, assists, time to useful choice (excluding loading), backtracking, comprehension of save/publication scope, control fatigue/comfort and confidence in the next action. Proposed targets:at least 80% unassisted success per critical task/cohort as an initial formative gate; no participant blocked from an essential action by a confirmed accessibility defect; clear agreement on save/sharing meaning. These are planning targets, not current measured results. Investigate small-cohort failures individually instead of hiding them inside an average.

## Progression and return measurement

First establish the baseline from the existing consent-aware analytics and small user studies. Reuse `platform/product-telemetry.js` and its sanitizer. Use allowlisted IDs/states; do not add raw locations, emails, room codes, messages, media or another analytics SDK.

| Question | Proposed measure / interpretation |
| --- | --- |
| Can people start? | Start intent → valid readiness → actual entry; separate choice time, load time and denial reason. |
| Do they understand the task? | First meaningful action and help/backtrack observations; do not count opening a card as gameplay. |
| Is progress meaningful? | Original result successfully saved/acknowledged → evidence reviewed → next task chosen. Separate local, online and room outcomes. |
| Can people return? | Actual resumable work opened and continued; compare control/draft/save recovery and abandoned attempts. |
| Do they want to return? | Optional feedback and consented D1/D7/cohort behavior, if the current identity/consent model supports it; no invented baseline or predicted percentage lift. |
| Does UI stay light? | Profile cached panel interaction and changed HUD update costs on supported devices. Proposed target:cached UI response within 100 ms where feasible, no new per-frame catalog/database work, no new retained scene/listener growth. Loading states remain honest. |

Success is useful, understandable continued play—not more menu clicks or longer forced sessions. Prioritize saved projects, mastery, optional discovery and collaboration. Defer additional content, attendance rewards and new economy systems until real evidence shows they solve a player problem.
