# Sandbox walkthrough implementation

September 30, 2026. Current source on `steven/visual-quality`, following the [game-design review](SANDBOX-GAME-REVIEW-2026-09-30.md). Existing production and `dist` remain unchanged.

## Player experience

Today now offers three optional directions: **Explore**, **Build**, and **Together**. Each has a persistent walkthrough, a clear start action above the instructions, and a way to change direction or roam freely. The chosen direction survives reloads. Nearby routes/games and Homes & Property are reachable from the same place.

First Journey ends with an earned result and review of its matching Journal record. Opening menus, changing travel modes or joining a room does not finish it. Unrelated fieldwork cannot finish the building path, and a solo action cannot finish Together. Earlier completed tutorials remain completed; unfinished journeys migrate without deleting game progress. A pending review record is brought to the front of the current Journal results.

Building explains placement, removal and Undo before mapped-building operations. Save status distinguishes device storage, pending room writes and disconnected rooms. Building records are directly accessible. A returning builder between fixed milestones can receive a zero-point outing receipt. Phone building controls have 44 px minimum targets.

Fieldwork, general activities, creations and Flower Sprint use a consistent saved-result presentation. It explains the actual storage boundary and offers a Journal action and a return to play. Building no longer claims a Field Guide update. Backpack links to Journal, Guide, and skills/companions. Property naming matches its navigation entry. Credits are explained as in-game spending; balances and prices are preserved.

## Gameplay defects repaired

- Shared building previously announced milestones on optimistic placement. Receipts now wait for the write acknowledgement, include room identity, and cannot be emitted after a rejected write, disconnect or room switch.
- Shared Undo could leave “Saving to room” visible after completion. Both placement and removal now notify the save-status observer when pending work finishes.
- On phones, time/weather controls could cover Multiplayer's Close button. They now hide while that modal is open.
- Flower Sprint called an out-of-scope coordinate helper when reached. It now uses the current world-to-geographic conversion, allowing completion and its Journal receipt.
- Flower completion feedback waited for leaderboard requests. Success now appears immediately, independently of those requests, and late requests cannot overwrite a new challenge's HUD.
- General results could publish twice. Each completed action now publishes one receipt.

## Verification evidence

- **Full source-world walkthrough: passed.** Baltimore field procedure, matching Journal review, desktop and 390×844 layout, touch-sized result action, actual pointer block placement, Undo, replacement, building review, room entry/close, property entry, nearby-games entry, persisted choices/blocks/records after reload, and one Flower Sprint receipt. Zero page exceptions or failed local resources. Field and flower targets used explicit actor placement; this is not evidence of unaided route discovery.
- **Shared-room emulator journey: passed after the final save-indicator repair.** Independent authenticated owner/member, normal UI room creation/joining, actual shared placement, matching Together Journal review, exact block convergence, disconnect/reconnect, a fresh late client, rejected-edit rollback, authorized removal, and protection against mistaking private cached blocks for room data. No production writes. Screenshots inspected.
- **Final Flower completion check: passed.** Actual runtime completion, one Journal receipt, and the successful HUD text already present when the receipt arrives. Zero page exceptions or failed local resources. The final focused capture is desktop; the full walkthrough separately covers phone-size layout.
- Controller checks passed desktop/mobile profiles and five legacy/reload cases. Isolated component checks are distinct from the world/browser and emulator evidence above.
- Final source, component-suite and prescribed action-client results are recorded below.

Reports: `output/verification/sandbox-first-session/`, `output/verification/sandbox-flower-result/`, `output/verification/world-editor-blocks-room/`, and `output/verification/tutorial-controller/`. Failed phone-close and Flower-receipt evidence is retained separately. Emulator setup required the installed Homebrew Java and temporary empty emulator-only payment/email parameters; that temporary file was removed. A stale verifier attempted to select room visibility before expanding Create Room; its sequence was corrected. A later Flower assertion was corrected to allow the UI's uppercase styling, without changing the expected result.

## Limits and release status

This is the walkthrough and core sandbox-flow implementation, not a claim that every system in the broad game review has been rebuilt. Economic rebalance, account-wide Journal synchronization and connected home inventory transfers remain separate product work. The current UI explains device/room/account boundaries and does not promise connected home storage that is not available.

Uncoached newcomer comprehension and physical-phone play remain unverified. The source check is not a production release matrix. No candidate was rebuilt, no GitHub update was pushed, and no production deployment was made during this pass.

## Final checks

- Source syntax, entry graph and authority checks: **passed**.
- Current component suite: **1,578 passed; zero failed or skipped**.
- Final shared-room run: **passed**, including the acknowledgement/Undo status assertion; screenshot confirms the settled save message.
- Full Earth walkthrough and final focused Flower feedback run: **passed**; reports distinguish their scopes and viewport evidence.
- Prescribed web-game action client: **passed** after the last gameplay change. Current Earth renderer and driving input ran; screenshots and game-state output were inspected. This is a startup/control smoke check, not a new sustained hitch-rate acceptance measurement.
- Diff whitespace check: passed. Owned browsers, static servers and emulators closed; temporary emulator configuration and staging attestation were removed. Ordinary browser sessions and production artifacts were preserved.
