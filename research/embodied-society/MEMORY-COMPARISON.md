# Stated-intent feedback comparison

Protocol `WE3D-M1-v1` · deferred before execution; not externally preregistered.

The September 12 [design review](RESEARCH-DESIGN-REVIEW.md) identifies inadequate needs pressure and sparse action opportunities. The original plan below is retained for provenance. Do not execute it as the next study without a revised time-policy protocol.

## Question

Does returning a resident's earlier stated intent alongside its observed action outcomes change its progress toward the supplied tool objective?

The fourth tool probe repeatedly described collecting food or water before making an axe, but completed no crafting. Those statements were recorded for the observer and were not returned in the resident's recent memory. This motivates testing feedback of the statements. It does not establish that their absence caused postponement, or that adding them will solve it.

## Conditions

Both conditions use the same code revision, Gemini 3.1 Flash-Lite, structured action schema and brief-summary output contract. Both receive the tool objective, current needs, inventory, known recipes, finite resource observations, recent action outcomes and remaining allowance.

- **Recent outcomes only:** prior model-generated summaries are omitted from the next observation.
- **Earlier stated intent and outcomes:** the same recent-outcome entries also carry their original brief `decisionSummary`, when recorded.

No route, recipe sequence, extra resource, success hint or operator-written plan is inserted. A summary is untrusted model commentary. An outcome marked rejected remains rejected even if the summary predicts success. Memory is limited to the most recent 20 outcomes; each summary is capped at 240 characters. This is bounded feedback within one run, not long-term memory or restart recovery.

Select the condition before starting. The server freezes it in the manifest and enforces it for each dispatch; the model cannot change it. Checkpoints, private observations and exported reports identify the condition. No model output can execute a summary as an action.

## First exploratory pair

Plan two new attempts, outcomes-only first and intent-and-outcomes second, run sequentially. This fixed order is a potential time/provider confound. Use the same mapped Baltimore start procedure and `resource-use-v1` profile, with empty inventory and no starter tool. Record actual spawn, supplies, source fingerprint, model alias and contract for each attempt. External geography is not fully frozen, so compare manifests and disclose differences rather than calling the pair deterministic replay.

Each attempt retains the existing limits: 20 provider decisions, at least 60 seconds between completed requests, 900 simulated seconds and 20 minutes wall time, with no connection probe, in-run edits, automatic retry or paid fallback. Infrastructure failures remain in the pair and are not silently replaced. Do not extend a run to obtain a pass. Further attempts require a newly recorded study decision before dispatch.

## Outcomes and interpretation

The primary outcome is the existing same-run manufacturing-and-use requirement: gathered inputs, matching crafting escrow, timely completion, tool custody and subsequent tool-dependent timber acquisition with tool wear. Apply the frozen evaluator equally to both conditions.

Secondary descriptive outcomes are raw crafting materials acquired, recipes started and completed, consumption events, repeated gathers, rejected actions, completed movement distance, time/call limit reached and summary availability. Publish the sequence of statements and actual actions, not a subjective score for how convincing an explanation sounds.

This two-attempt developmental comparison cannot establish a reliable effect, model ranking or general planning ability. A pass must be repeated under a new frozen protocol before expanding the capability claim. A failure remains useful if the records show where progress stopped. Distinguish source/component verification, live execution and behavioral success throughout the report.
