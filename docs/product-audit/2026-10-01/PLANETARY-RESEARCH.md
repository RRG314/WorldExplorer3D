# P14 — a completed planetary research loop

October 3, 2026. Local development; production unchanged.

The bounded slice completes the existing **Under a Restless Sun** Proxima b mission and demonstrates its earned equipment on **Copper Dawn**, an explicitly fictional world. The audit's earlier Moon/Mars first-mission suggestion was a proposal; implementation uses the existing Proxima campaign/pod/analysis connection to finish one complete path without inventing a second campaign. Moon/Mars visual work remains P15. This phase does not claim all 66 catalog missions have equivalent playtesting or depth.

## Completed behavior

Briefing explains the three instrument sites, return route and useful improvement. The player departs Solis Reach through the Pod Bay, lands, operates the panorama, sample and environment stations, returns in the same pod and publishes from the Analysis Lab. Each station retains its existing distinct instrument and three-step procedure. Field records use the existing Journal/Field Guide and destination-mission ledger.

The player may return with a partial survey. Saved findings remain; the ship's current objective leads back to the Pod Bay. The recovered pod's expedition/body/system identity authorizes resuming the survey. Relaunch restores its planet course, which docking had cleared. A different body or system cannot reuse that permission.

Analysis requires the correct returned pod, expedition, ship deck and physical Analysis Lab interaction range. The report is saved to the Journal before the mission becomes complete. Stable event identity, an in-flight guard and a retained pending outcome make retries and double-clicks safe. If the Journal or final ledger write fails, the mission remains retryable without granting the upgrade or a second Journal reward. The store no longer updates its memory copy before a storage write succeeds. Field stations also wait for save confirmation before showing their completed procedure.

Completing a surface report installs **Field Link II**, derived from the existing completed mission ledger. Photo and environment stations accept remote operation within **30 m instead of 18 m** on supported later worlds. Sample collection retains its 18 m approach requirement. The field HUD names the active link. There is no new currency, store schema, mutable entitlement flag or server authority. Existing valid completed surface reports also qualify. Direct supported-world entry reads that same saved ledger if the space runtime has not initialized.

The Analysis Lab offers a read-only completed report with the three findings and equipment effect. Desktop and phone layouts preserve readable text and the close action. A follow-up recommendation is described as a report recommendation; the UI no longer promises a higher-value return mission that does not exist.

## Evidence and boundaries

- Six registered contracts cover failed-write memory/storage agreement, correct lab access, persistent equipment, interrupted Journal/final-ledger writes, duplicate submission, original outcome on retry and recovered-pod resume eligibility.
- The registered suite passes **1,719 tests**, with zero failures/skips/todos. Source graph/syntax checks pass.
- Actual assembled-app browser journey: mission briefing/course, Pod Bay launch, landing, three field procedures, partial return/docking/redeployment, lab publication, completed report on desktop/390×844, useful remote operation at **24 m** on Copper Dawn, then a real app reload with the same upgrade and exactly one completion report.
- The browser also injects one field-store failure: no mission evidence or completed station is shown until retry succeeds. Journal/final-ledger failures are separately exercised in registered tests.
- This harness starts from an authored arrived-expedition fixture and positions the actor/craft at relevant approach and station boundaries. It exercises real transition/controllers/actions and stores; it does **not** certify an uncoached full interstellar voyage or walking every metre. Earlier stale station coordinates and sky assertions were corrected against the current ring-layout and horizon-clipping source. Expected aborted asset loads on scene disposal are listed separately from failures.
- The prescribed game client opens the real Copper Dawn scene using an explicitly seeded completed-ledger fixture; its state and screenshot are inspected. Local unsigned App Check warnings are retained as harness limitations. Physical-phone, comprehension and release acceptance remain P20.

Evidence: `output/verification/product-plan/phase14-*.log`, `planetary-research-client/`, and `output/verification/destination-mission-proxima-surface/report.json` plus screenshots.

The report and upgrade are local-device progress, not cross-device or independently verified competitive achievements. Interstellar travel and shared ownership keep their existing authorities. P14 is finite: this connected mission, recovery and useful progression; broad planetary art is P15 and more mission families are later content.
