# Interactive design review

**Latest owner correction:** the main preview is now a fuller player landing plus a four-step gender/name, career, original-car and departure introduction. The earlier exposed top comparison strip is removed; review settings are collapsed below the app. Actual models rotate, choices survive Back/Edit and Begin carries them forward in preview memory. [Introduction revision](INTRODUCTION_REVISION.md) supersedes the entry-screen presentation described in the original evidence below. No live saves or grants are changed.

Open [the local preview](http://127.0.0.1:4192/docs/career-world-integration/index.html). Source is [index.html](index.html), [preview.js](preview.js), [preview.css](preview.css). It runs through the existing4192 source server; no build/deploy or player save is needed. It uses the app’s TRAIL font/tokens, imported career/background catalog and genuine existing gameplay/reference imagery. No AI image generation or replacement of original player photographs.

## Three visual compositions

| Composition | Visual hierarchy / suitable use | Desktop and mobile behavior |
| --- | --- | --- |
| **Field / cinematic** | Large genuine world/reference image, one task/direction, restrained controls; menu holds depth | Recommended default. Phone stacks the concise direction and optional details; gameplay should keep world/control space rather than permanent panels. |
| **Atlas / map and route** | Persistent large-screen route index, map/current-task emphasis and geographic context | Wide desktop rail; phone uses deliberate menu and stacked map/task. Schematic routes in preview are explicitly labeled, not fake live POIs. |
| **Desk / journal and tools** | Light TRAIL workspace with records, preparation and evidence side by side; compact image header | Optional research/review composition. Phone uses one readable column. Light surfaces retain dark text; hero/action contrast was corrected after image inspection. |

These are complete alternate compositions within the existing design language, not three new runtime UI frameworks. The gameplay screenshot backgrounds are references, not a second 3D renderer. The globe remains a concrete destination-selection screen in every approach.

## Four models × three introductions

Progression model selector changes entry emphasis and CTA: starting direction (A), immediate place/exploration and practiced skills (B), optional tracked focus (C), or qualifications/pathways (D). First-session selector independently demonstrates career-first (A), universal foundation (B) and explore-first (C). Model selection is not persisted into the app. The owner can evaluate progression and layout separately.

## Screens and working preview actions

| Area | Demonstrated interaction | Scope |
| --- | --- | --- |
| Entry / returning player | Guidance route, no-focus route, returning-player Continue | Simulated navigation, no profile mutation |
| Worlds | Original globe gameplay image; Earth/Ocean/Space/planetary context switching | No new actual world travel; original world acceptance reused |
| Career browser/detail | Twenty imported entries; family filter; task/media/preparation detail | Current catalog, real imagery credits; unavailable content not fabricated |
| Character | Eight original backgrounds, recommended equipment and scope | Read-only, no duplicate character creation |
| Focus/switching | Track, clear, choose another; preview record stays | Ephemeral page state, not implemented focus schema |
| Backpack/preparation | Required-tool check, provided-vs-owned explanation | No grants, equipment writes or purchases |
| Gameplay objective | Current task, Next instruction, deliberate help/travel | Simulated sequencing, not physical task completion |
| Journal/progress | Preview result→review→next choices; related skill connections | Clearly labeled preview record/illustrative bars, no real XP |
| Qualifications | Basic access and advanced readiness explanation | Existing rules referenced; no new award curriculum |
| Geology/mining | Actual public point response with citation/scale; distinct virtual training chain | No reference-to-ore grant or real extraction rights |
| Stores/materials | Owned/provided first, preview request feedback | No commerce dispatch, charge, delivery or wallet copy |
| Activities | Quick games/assignments from actual catalog | Original owners retained; preview enters layout only |
| Together | Join/leave preview crew, different interests/personal credit | Explicitly not a live room or joint research backend |
| Workspace/travel/controls | Included-room concept, environment-specific modes, optional learning | Existing functionality/reference layouts; no new furniture/controller/VR owner |

Buttons execute their labeled preview action; none is a disabled decorative purchase masquerading as functional gameplay. Outer review chrome identifies simulation; player-facing app changes do not include internal planning copy. The preview may explain implementation constraints because it is a review tool, not deployed gameplay.

## Original-source prototypes A–E

Run **Run native prototypes** in the preview or `node scripts/research/career-native-prototypes.mjs`. Browser module imports actual app owners. All fixtures are disposable memory, not live player data.

| Prototype | Real source exercised | What is established / what is not |
| --- | --- | --- |
| A career preparation | Original character creation/capabilities, catalog/offer/versioned intent/profile updater | One character, valid coordinates and no selection-only item grant. Adapter is controlled; no new physical course playthrough. |
| B switch | Original admitted Geology domain state + prior Journal/practice + entry cancellation | Activity switch keeps prior study/earned practice; late cancelled travel cannot install. Focus metadata architecture is still unimplemented. |
| C cross-career | Original claim transaction, skill projection and Backpack projection | One planetary sample/event, Space+Geology credit, one nontradeable item despite repeat. Controlled sample, not a new physical collection. |
| D old player | Original conservative legacy migration/backup/rollback | Unknown future domain/extension, original item/progress survive. Not a live account/database migration. |
| E shared context | Original room-frame policy + two personal receipt stores; server lease checks in CLI | Different personal practices can respect same frame, reject foreign origin and retain separate credit. No newly implemented connected cooperative research task/payout. |

Final native checks total26 grouped assertions plus4 server membership assertions; the first prototype run had25 before strengthening B’s prior-work preservation case. Keep exact result versions separate. Existing accepted physical career procedures are the gameplay evidence; isolated contracts are the integration feasibility evidence.

## Visual/interaction verification

Initial functional pass reaches all four models, all three intros, catalog count/filter/selection, focus→kit→task→preview result→Journal→switch, navigation, shop request, crew toggle, four world contexts and native browser contracts. It then failed on a **driver selector choosing hidden navigation**, before visual captures; preserved `preview-1793850855276`, not a whole-run pass.

Affected visual checks: `preview-1793851005996` three original compositions ×1440/390/844, no page overflow/missing images. Stronger Atlas rail/Desk light composition rechecked in `preview-1793851561175`; image review found Desk hero contrast failure, corrected only at that boundary; final Desk three sizes `preview-1793851697818` pass/opened. Earlier images remain. Atlas play, Desk Journal and Field/phone images opened. Official game skill client performs one preview Next instruction and captures state/image under `official-preview-loop`; it is a design simulation, not gameplay timing evidence.

Full implementation must use original action forwarding, focus/escape/return, text scale, touch/VR mapping and task lifecycle. A clickable review screen does not close a release gate or prove retention. Acceptance is split explicitly in [matrix](ACCEPTANCE_MATRIX.md).
