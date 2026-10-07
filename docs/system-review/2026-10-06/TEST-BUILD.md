# Local marine and transport test build

Build: **5.4.0+bf10b392ff59.47bf4be4a6acfde0.staging**. Last game-code commit: **dcb1687fda2c**; packaging includes the final verification-harness checkpoint bf10b392. All 612 application files byte-match the tested dcb1687fda2c artifact; see `output/verification/marine-artifact-equivalence.json`. Branch: `steven/visual-quality`. This is a local test artifact, not a production release. The public staging preview still contains the earlier release.

## What is implemented and verified

- The visible Earth return uses one coalesced transition and awaits a usable Earth world.
- Retained Earth work stops while the ship interior owns play. The final packaged 30-second walking sample records 60.04 FPS, worst frame 18.8 ms and no captured errors. Earth return retains 49,023 buildings and all 18,828 roads in that loaded publication. Earlier source verification covers every ship deck, furnished room, door/lift and 31 observation views. This is not a long-session performance guarantee.
- Fresh Ocean selection starts aboard the research vessel. Deck movement, platform jump, swimming, automatic scuba, same-ship recovery and submarine launch are connected. The launched submarine faces away from the stern. The retained carrier uses vessel-sized wave support with damped heave/pitch/roll.
- Desktop and phone marine panels use the shared styling; the phone diver is framed clear of the controls. Final-artifact browser checks cover the complete connected journey and nine independent dive checks, including actual forward swimming animation, pause/air preservation, boarding, recovery and disposal.
- Occupied tunnel walk-to-drive fallback validates that same tunnel floor and car clearance rather than relocating above ground. Actual Fort McHenry packaged verification passes ten checks. This is an internal-bore handoff, not full entrance-to-exit acceptance.
- Vector road ownership removes buffered overlap, retains directional/access/stack semantics and joins unambiguous tile continuations. Whole-route endpoint classification prevents false underground connections. The continuity gate now includes generalized routes instead of silently skipping them.
- Full source suite: 2,045 contracts plus dependency, source, ownership, types, inventory and sensitivity checks. Final artifact verifies 612 files, 188 bundles and 84 ground files. Candidate → retained 37a12d11 fallback → candidate save/read/write passes all three stages and all 104 changed runtime/configuration files have reviewed byte pins. Existing player storage was not used by these tests.

## Test the connected ocean journey

The dedicated local test window starts with Coral Shelf selected. Choose **Ocean**. It should place you on deck, not inside the submarine. Use the deck destination selector and walk to the indicated station; its action becomes available within reach. At the dive platform, **Space** jumps into the water. **W/S** moves, **A/D** turns, and **Space/Shift** rises/dives. Scuba equips automatically when the swimming controller requires it. **Recover** returns to the same research vessel. Walk to the submarine cradle and select **Deploy submarine**; moving forward must take you away from the ship.

To check space return, select Baltimore in the main menu, enter Earth, open Travel and board Solis Reach. After returning to flight, choose Earth. The original world should resume. The test window uses the staging backend and a separate browser session; the ordinary browser and existing saves remain untouched.

## Still blocked — not completed by this build

The expanded Monaco route audit still finds **237 vertical discontinuities among 859 sampled structure joins**, with a maximum of 18.70 world units. The Baltimore bridge network also fails: **62 discontinuities among 677 sampled joins**, maximum 8.49 world units. A mountain portal remains visually unacceptable. Full bridge/tunnel entrance-to-exit and global route acceptance are not complete. Passing source contracts is not permission to deploy those failures.

The licensed Alan Dennis RCRV vessel was downloaded and inspected, but its several decks/stairs need a matching navigation/collision conversion. It has not replaced the current procedural research ship. New whale/dolphin/squid assets, broad procedural ocean ecology, spearfishing and continuous ocean/worldwide streaming are not installed. The current limited ocean scene is not represented as a completed global ocean. Earth active-play GC stalls remain open.

The complete [audit, R&D, implementation plan and evidence ledger](MARINE-TRANSPORT.md) records these boundaries. No GitHub push or production deployment occurred.
