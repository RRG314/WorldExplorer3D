# Prospective useful-tool capability probe

Protocol `WE3D-T1-v1` · prepared September 11, 2026 · three developmental attempts executed; not externally preregistered. See RESULTS.md for outcomes and amendments below.

This is a focused capability test following the corrected resource-use repeat. It is not a claim that an unprompted resident spontaneously invents tools or develops a human-like life. Keep it separate from the general-exploration runs and their outcome counts.

## Question and task

Can the resident obtain a tool-dependent resource using a tool manufactured from raw materials that it gathered itself?

The operator task is: **“Obtain timber using a tool you make from gathered raw materials. Maintain your needs. Choose your own route and actions.”** The model receives the available designed recipes and physical affordances. It receives no prescribed action sequence, no finished tool and no construction kit. This evaluates use of supported transformations, not invention of new recipes.

The task is explicitly labelled in the start controls and immutable manifest. The general action contract, permissions, budgets and safety boundaries continue to apply. The original general-exploration option remains available.

## Conditions and limits

Use one resident in the mapped Baltimore environment, `resource-use-v1` initial needs (water 0.45, food 0.55, rest 0.90), empty inventory and the same finite supply definitions and placement procedure as the corrected resource-use trial. Use Gemini `gemini-3.1-flash-lite` on the configured Free tier. Record actual placement and source identity; do not assume external world inputs are fully frozen.

Bound the trial to 20 provider calls, at least 60 seconds between completed decisions, 900 simulated seconds and 20 minutes of wall time. There are no automatic provider retries or paid fallback. A failure, timeout or exhausted limit remains a result. Do not extend the bound to obtain a pass. Do not run a second renderer or test suite alongside the live world.

Freeze the task text, material/recipe definitions, model, source fingerprint, initial manifest and limits before dispatching a resident decision. Record any changed condition as a new configuration. No in-run instruction edits, manual actor actions, extra supplies or teleportation are permitted.

## Required evidence

Passing requires all of the following within the same run:

1. Finite supply depletion paired with matching raw-material inventory gains.
2. Ingredient removal paired with a matching job escrow and known recipe.
3. Completion no earlier than the job's declared ready time, with the expected output and no retained active job.
4. A manufactured tool held by the same resident, followed by an accepted timber gather requiring that tool.
5. Matching timber depletion/acquisition and the expected tool-condition decrease.

A starter tool, model assertion, accepted craft request without completion, failed gather or manufactured tool never subsequently used does not pass. The evaluator must report absent frozen rules as unavailable evidence, not silently infer them from later source. Mixed tool stacks with ambiguous custody are conservatively excluded from the useful-tool claim.

Report every action, consumption, rejection, completed transformation, terminal cause, wall/simulated duration and observed token usage. The evaluator is a state-transition self-check; independent review and full external-world replay remain outstanding.

## Interpretation and next gate

A pass establishes a narrow designed manufacturing-and-use capability under a supplied objective. It does not establish spontaneous invention, efficient planning, sustained survival or construction. A failure may expose model choices, missing affordances or infrastructure defects; diagnose from records without rewriting the trial.

The shortest material chain requires at least nine nonmovement decisions, leaving a limited allowance for navigation and needs. A full workbench exceeds the current call budget before travel, so workbench/building is outside this probe. Repeat a successful frozen tool configuration before expanding scope or population.

## Development amendment T1-A

The first probe stopped after three provider decisions: the third returned `lookYaw=-1.45`, which the body correctly refused because all five movement/look controls are normalized axes in [-1,1]. The provider schema had described those fields as unrestricted numbers. No material gathering or crafting occurred. This is retained as a failed developmental attempt.

The corrected schema declares numeric bounds for every control and the 1–300 frame duration. Instruction text distinguishes relative control inputs from observed absolute angles, and server-side normalization also rejects invalid values rather than clamping them. The next attempt keeps the task, initial conditions and limits unchanged but records a new source revision. Numeric minimum/maximum support is documented in [Google's structured-output announcement](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-structured-outputs/); [the API guide](https://ai.google.dev/gemini-api/docs/structured-output) also calls for application-level value validation. Schema support does not replace host validation.

## Development amendment T1-B

The movement-schema-corrected attempt completed 13 provider responses. It collected eight snacks but did not craft. Its final consume request used an inventory instance ID rather than the required catalog ID and stopped with `not-consumable`. The full failure is retained.

Inspection also found that enforced decision/time budgets were absent from resident observations. This is a missing task constraint; whether it caused stockpiling is unknown. For the next developmental revision, observations explicitly report further decisions after the current reservation and remaining simulation/wall time. Material and recipe schema fields enumerate valid catalog/recipe IDs. Unusable-item and unknown-process choices become recorded nonmutating rejections with feedback within the remaining allowance, while malformed movement remains refused. Closing a failed run preserves its failed state.

The local server now durably archives the exact observation, instruction and schema before each provider dispatch, with bounded per-call storage. These raw observations stay private. Failure to save an observation prevents dispatch and conservatively retains the reserved allowance. This improves diagnosis beyond later checkpoints without granting the model any new action. The wall deadline is anchored in the start manifest and shared with the model's budget observation. The same 20-call/900-simulated-second/20-minute maxima and raw-material tool objective apply; no action sequence is supplied. This is a new development configuration, not an unchanged repetition.
