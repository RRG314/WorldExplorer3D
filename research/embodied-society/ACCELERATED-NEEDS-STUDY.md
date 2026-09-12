# Accelerated needs observation

September 12, 2026. Protocol fixed before the first accelerated resident dispatch. This is a single exploratory trial, not a controlled comparison or evidence of general capability.

## Question and starting conditions

Does a resident choose to replenish needs when it experiences several simulated hours, rather than the previous fifteen-minute window? Use General exploration, the resource-use-v1 starting profile (water 45%, food 55%, rest 90%), and outcomes-only memory. Supplies remain finite, operator placed and governed by existing material rules. No tool-making task is assigned. No operator movement, supply addition or action coaching is allowed after start. Preserve unsuccessful outcomes and interruptions.

## Time and decision opportunities

The `fast-needs-6h` window stops at the first of 21,600 simulated seconds, 3,000 wall seconds (50 minutes), 380 decision attempts, condition exhaustion or a terminal failure. It targets twelve times real time by processing 48 fixed physics frames per 15 Hz browser cycle. Each physics frame still represents 1/60 simulated second. Resident movement, needs and workshop jobs share this clock; need rates and crafting durations are unchanged.

World Explorer's external weather, base day/night presentation and live geographic inputs do not share this accelerated clock. This is an accelerated resident/workshop study, not an accelerated complete ecosystem. Model requests freeze simulation while pending. Browser throttling, rendering, storage and model latency can reduce achieved simulated time; report actual time and the ending reason rather than assuming six hours completed.

The first decision is immediate. Subsequent decisions require both a completed movement and at least 60 simulated seconds since the preceding dispatch, plus 5,000 wall milliseconds since its settlement. This preserves approximately sixty opportunities per simulated hour. Movement remains limited to five simulated seconds per command: persistent interruptible activities are still missing. No hidden script chooses actions between model responses.

## Provider and interruption policy

Use Gemini 3.1 Flash Lite on a confirmed Free-tier project. The operator's active AI Studio quota view showed 15 requests/minute, 250,000 tokens/minute and 500 requests/day on September 12. These are project limits, not guaranteed remaining daily capacity or limits for every account. The configured maximum is twelve requests/minute; input/output bounds also apply. Other model/window combinations retain their existing slower pacing. Check [Google's rate-limit guidance](https://ai.google.dev/gemini-api/docs/rate-limits) and the intended project's current quota before reproducing.

Run one attempt with no connection probe, automatic retry, paid fallback or restart after failure. The wall limit is not extended to obtain a favorable outcome. Use one low-graphics world and stop owned resources after the trial. Record early interruption if hardware becomes unresponsive.

## Records and interpretation

Freeze source identity, initial conditions, objective, memory, clock and allowances before dispatch. Retain the manifest, exact model observations, provider reservation/completion ledger, workshop journal, checkpoints and brief model decision summaries. Summaries describe stated immediate intent, not private reasoning or proof of causation.

Report actual simulated and wall duration, decision counts and failures, inventory movements, consumption/restoration events, sampled reserve minima, condition changes, recipes, tool use and ending reason. Distinguish action-boundary samples from continuous measurements. Rest currently lacks verified mapped shelter, and rest depletion does not drive health damage; nonzero health alone cannot establish complete self-maintenance. A single trajectory cannot isolate effects of acceleration, memory, stochastic choices or initial conditions. The deferred memory comparison remains unrun.
