# Accelerated needs study: 84 minutes and an action-rejection defect

September 12, 2026. Run `free-1789236888624-bcf86d` completed **85 real Gemini responses over 84 simulated minutes** before an invalid gather quantity stopped the controller. Water fell from **45% to 10%**, food from **55% to 37.5%**, and rest from **90% to 72.5%**. No need was replenished and no recipe was completed. The six-hour target was not reached.

## Conditions and duration

The owner authorized a new attempt after the previous pre-dispatch loading interruption. Browser communication and loading progress were checked; the low-graphics Baltimore world reached its ready signal. No physics or model-interface changes were made between those attempts. The runtime matches public research commit `fa5b86c1` (private source checkpoint `6e11d910`). The original failed launch remains in its separate report.

This attempt used the [accelerated protocol](../ACCELERATED-NEEDS-STUDY.md): General exploration, resource-use-v1 initial needs, outcomes-only memory, one resident and finite supplied resources. The operator did not assign a tool-making goal, move the resident, add supplies or coach actions. The observer was minimized during observation.

The run lasted approximately **13 wall minutes**, based on manifest creation time and the retained final checkpoint file time, for about **6.46 simulated seconds per wall second**. The latter timestamp is a local filesystem measurement, not an independently journaled endpoint receipt. Model response delays and browser/storage work reduce the nominal 12× target. The declared limits remained six simulated hours, fifty wall minutes and 380 calls; the action error stopped the run first.

## What the resident did

| Recorded behavior | Result |
| --- | --- |
| Movement | 68 commands completed; 524.985 cumulative horizontal metres, not net displacement |
| Material acquisition | 16 balanced gathers emptied the stone supply; final inventory contained 16 stone |
| Other acquisition | No water, snacks, branches or fiber transferred |
| Needs restoration | No consumption or rest actions |
| Manufacturing | No craft or finish action; no tool produced |
| Final action | Fiber gather requested quantity 2; host rejected it before transferring material |

After collecting stone, the resident repeatedly described plans to reach fiber and make an axe, but changed stated targets and made many movements without acquiring another resource. Water continued falling. Some explanations described needs as stable or deferred maintaining them until after crafting. These are model statements, not reliable explanations of causation. All **85 brief summaries and action records** are available in the [decision report](accelerated-needs-2-decisions.md).

The final observation did place fiber within reach (2.361 metres). This was not a reach failure: the model requested two units, whereas the workshop permits one unit per gather. The prompt said one, but the Gemini action schema did not enforce that quantity. The workshop correctly refused the transfer; the controller incorrectly treated `gather-batch-too-large` as terminal instead of an ordinary rejection. Its original action record remains `proposed`, with no after-state; the error and unchanged workshop establish that it was not applied. The record has not been rewritten to match the later fix.

## Changes after the trial

Gemini's gather schema now restricts quantity to exactly one. The controller now records an oversized gather as a rejection, preserves the attempted quantity, leaves material balances unchanged and supplies the rejection to the next decision. It does not silently turn two requested items into one or retry the model call. A regression test reproduces the two-unit request and verifies that a subsequent one-unit request can succeed. Persistence and provider failures remain terminal. **93 Node tests and 24 Python record tests pass.** This repair has not yet been tested in another live AI trial.

## Interpretation and next study

The longer observation revealed sustained navigation difficulty and no replenishment as water approached depletion. It does not establish behavior at zero reserve or six hours. Nor can one changing trajectory establish that the model is incapable of navigation or needs maintenance.

Control feedback merits a focused review. The body exposes accumulated yaw (about −119.77 radians in the last observation), while the model sees normalized input axes without a quantitative turning-rate description. The actual integrator turns at 2.6 radians per simulated second at full input; a five-second command can rotate through more than two full turns. This is a plausible contributor to the observed wandering, not a demonstrated cause. A future interface amendment should expose calibrated controls and interpretable bearings, validate them against real physics and preserve model choice rather than script a successful route.

Keep the next trial separate, declare the changed schema/rejection handling, and assess navigation feedback before claiming sustained life. Shelter/rest, continuous activities, renewable resources and restart support remain incomplete. See [machine-readable evidence](../evidence/accelerated-needs-attempt-2.json), the [design review](../RESEARCH-DESIGN-REVIEW.md), and the [retained inventory](../records/development-runs.json).
