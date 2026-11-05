# November 5 — Interactive globe correction

The original game globe replaces the static screenshot, with arbitrary point/coordinate selection and intro location carry. A/B/Field is the owner's preferred preview configuration. Affected functional, visual and lifetime evidence, preserved failures and the local named-search service limitation are recorded in [GLOBE_REVISION.md](GLOBE_REVISION.md). No new deployment or whole-game acceptance is claimed.

---

# R&D verification receipt

## November 5 landing/introduction revision

Owner asked to replace the exposed comparison strip with a simple gender/career/first-car introduction and a fuller landing. This is review-prototype work only. The latest presentation is documented in [Introduction revision](INTRODUCTION_REVISION.md); original full-app/gameplay evidence below stays accepted.

- `introduction-1793882476403`: initial full desktop and native-touch sequence passes. Both original character models, four real car assets, family filters, Back/Edit and name/gender/career/car carry-through, free exploration, no localStorage write and model lease release. All10images opened. Functional acceptance retained; initial raw multi-car BMW and pale floor images invalidated for presentation.
- `introduction-1793882685584`: corrected original single-car E34 preparation and dark showroom, scoped desktop/phone visual checks pass. Corrected BMW and character images opened. Existing loader/model-owner code reused, not a new source-asset transformation policy.
- `introduction-1793882823951`: retained phone verifier failure. It hit-tested an offscreen gender control after focusing the name; failure message incorrectly attributed this to the footer. No page or console error. Corrected verifier explicitly scrolls the target into view.
- `introduction-1793882898681`: native touch/visible-control hit test passes with separate mobile content/action rows. Image review also motivated preserving the content scroll position when a selection rerenders.
- `introduction-1793883090400`: affected phone-only sequence passes after scroll preservation, including native selection of Woman/Racer/BMW M3, correct Begin values, no page/console errors and released leases. It checks that choosing a car does not jump the selection list.
- `introduction-1793882987740`: focused keyboard-step focus, preview Reset and rapid leaving-during-load checks pass; all original model leases release. Reset changes only disposable preview state.
- The source guard then caught an asynchronous `waitForFunction` predicate in the lease verifier. Earlier lease-wait assertions are superseded, while their UI/choice/image observations remain valid. The helper now resolves its import first, uses a synchronous predicate and explicitly reads the result. Focused resource/reset/late-load recheck `introduction-1793883304598` passes with no page/console errors. This verification-only correction does not replay accepted gameplay.
- The prescribed skill client `intro-official-loop` reports the correct Woman selection, but its direct WebGL canvas export is black because the on-demand renderer does not preserve its drawing buffer. That image is **not** accepted model evidence; actual browser page captures above show the models. A separate `intro-official-navigation` run exercises the new landing’s Earth entry with a page image/state.

No new production/staging candidate, account, item grant, purchase, character/profile write or deployed render loop. Original accepted science/racing procedures were not repeated. Publication/source gate results for this revision are recorded with the exact commit in CURRENT-STATE.md and the local ledger.

---

Baseline source98dbf5d4, branch `steven/career-world-rnd-20261105`, based on the completed TRAIL staging branch. This is a research review packet plus an independent local tutorial presentation repair. No major career architecture selected, no live player writes, no staged replacement or production deployment. Existing accepted careers, venue laps, steady-driving, save/media, backend and platform evidence remain accepted at their original scopes.

## New evidence

All local evidence below is under `output/research/career-world-20261105/`; generated raw files are excluded from GitHub publication.

| Check | Evidence and result | Limits |
| --- | --- | --- |
| Source inventory | `source-census.json`, documented census |1496runtime/backend/platform modules indexed; not manual every-line audit |
| Ordinary desktop first session | `onboarding-1793848688278`, summary | Real result/Journal/badge observed.46actions include6driver failures; not a whole-run pass or human study |
| Ordinary phone first objective | `onboarding-1793849790589` |12normal touch/UI actions accepted; not full phone completion |
| Independent repair, actual source phone | `onboarding-1793851132061` |7actions, card/details/dismiss/actual touch/menu suppression,0pageerrors; images opened |
| Guidance original UI/layout | `guidance-layout-1793851392185` retained failure; corrected landscape `…1492228`; actual200% `…1520522` | Desktop/phone100% boundaries retained; landscape menu overlap fixed; initial “200%” fixture was not scaled and was explicitly superseded by real token-scale check. Final six large-text compact/details cases pass, images opened |
| Preview functional flow | `preview-1793850855276` | Four models, three intros, catalog/focus/kit/result/review/switch, main screens, world contexts and native contracts passed before hidden-nav **driver** selector timeout. Run not marked wholly passing |
| Preview responsive images | `preview-1793851005996` | Three compositions ×three sizes, no page overflow/missing images; inspected |
| Stronger Atlas/Desk layouts | `preview-1793851561175` | Atlas rail and light Desk visual check; Desk hero contrast then found by image review, invalidated for contrast |
| Final Desk correction | `preview-1793851697818` | Three sizes pass, final image opened; previous invalid images retained |
| Official game skill client | `official-preview-loop/shot-0.png`, `state-0.json` | One preview instruction action, image/state opened; simulation only, no app clock acceleration in ordinary audit |
| Native prototypes | `native-prototypes.json` |26grouped assertions +4existing server lease assertions; original owners, disposable controlled data; no new connected co-op task |
| Provider read-only probes | `geology-service-probe.json`, MRDS/USMIN notes | Literal endpoint/point schema and public pages checked; failed access/parser attempts kept distinct; no production source upgrade |
| Dependency/source/ownership/types | `gates.log`, `source-final.log` | PASS:2250JS parsed,0syntax/graph failures,214context writer files, boundary types. Source rechecked after cache-version references changed |
| Required artifact files/links | `packet-check.json` |32requested documents, substantive-content guard/local relative-link check; not semantic proof or gameplay acceptance |

The final native browser-only receipt `preview-1793852223850` passes with zero page errors and rechecks strengthened B’s preserved-study/practice contract without replaying accepted app gameplay. Its screenshot was opened. Independent runtime repair commit: `fe8ad826`. Exact research publication commit/PR is recorded in CURRENT-STATE.md and the local ledger when published. Full required remote CI may run for the draft PR; no new whole-game playthrough is inferred from it.

## Preservation and stopping point

Ordinary Chrome, source4192 server, assets/player data/media/history/rollback builds and failed evidence remain. Owned QA browsers close after each bounded process. No account census repeated, no cleanup restarted, no new full project copy. Public GitHub changes are organized docs, interactive source, read-only/owned verification helpers and four small runtime/cache files for the independent repair; raw player/evidence JSON is not committed.

The final stopping point is **owner architecture selection** as explicitly required in the pasted request. Post-approval actual implementation/release rows are listed in the overall/onboarding acceptance matrices and are not reported as complete.
