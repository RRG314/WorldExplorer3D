# Prospective protocol: single-resident survival and construction acceptance

Protocol ID `WE3D-S1-v1`, prepared September 11, 2026. **Status: specified, not executed, not externally preregistered.** This protocol follows the debugging pilot; it must not be retroactively described as that pilot's design. It is an engineering acceptance study, not a powered population experiment.

## Questions and primary outcomes

Q1: Can the resident reach a resource through permitted world movement? Pass requires a measured position change, remaining inside bounds, a host-authorized gather and matching inventory/node changes. Teleportation, remote gathering or operator repositioning do not count.

Q2: Can it consume a gathered supply with a useful effect? Pass requires the item decrement and the corresponding need increase in authoritative state, accounting for elapsed decay. A textual assertion or a full rounded HUD bar does not count.

Q3: Can it use a transformation chain? Record ingredient custody, elapsed crafting time, tool wear, workstation requirements and resulting item identity. Pass requires actual resources to be consumed and an output usable in a later action. A supplied finished kit is an explicitly different treatment, not end-to-end manufacturing.

Q4: Can it construct something useful? Pass requires a paid-for placement plus a measured capability: collision for a wall, reachable storage transfer, or a verified workstation. Shelter/rest is blocked until the host recognizes actual sheltered occupancy; visual roofing alone fails that claim.

## Design and run eligibility

Use one resident, one renderer and one request at a time. Freeze a source commit, protocol version, exact prompt/action-schema hashes, model identifier, recipes, limits and initial state before each run. Record the actual mapped publication identity, destination at approved public precision, resource placement/grants and world-input coverage. If the full inputs cannot be frozen, label the run partially reproducible.

The initial acceptance series is three bounded runs using the same declared configuration. Three is a feasibility choice, not a power calculation or a basis for generalized performance claims. All three attempts, including provider failures, appear in the inventory. Runs may contain zero successful decisions. Supply the agent a general survival objective and its available affordances, not an action sequence. Record the exact instruction. Any intervention or configuration change creates a deviation record and, if behaviorally material, a new configuration cohort.

Prepare this record before starting: run ID; protocol/version; source commit; model and provider; instruction/schema/rules hashes; resource/start manifest; wall and simulation limits; call/output-token caps; condition failure limits; operator identifier using a nonpersonal code; permitted interventions; environment version; expected private output location. Missing fields are null with reasons, never invented after the run.

## Time, stopping and interventions

Keep the current maximum 900 simulated seconds and 20 total provider calls, with at least 60 seconds between free-tier requests. Set a separate 20-minute wall limit for the prospective run and enforce/observe it explicitly; the present controller's simulation limit alone does not enforce that wall limit. Until automated, the operator must end at that bound and record the intervention. Do not silently extend limits to obtain a success.

Stop on condition failure, leaving the permitted world, changed world identity, malformed action, exhausted allowance, unresolved provider failure, unsafe workstation load or operator request. Record terminal cause, elapsed wall/simulation time and remaining allowance. Pause/Resume, manual provider recovery, model switching, prompt edits, supplies added and repositioning are interventions. Provider probes are separately labeled and included in cost/call totals.

## Measures and analysis

For each run report: attempted/completed/failed/unresolved provider calls; proposed/accepted/rejected actions by kind; net resource acquisition/consumption; needs before/after consumption; path distance and out-of-bounds events; completed crafting chains; useful structures; terminal cause; interventions; wall time; simulated time; observed token usage and whether cost is measured or estimated.

Use exact counts and per-run trajectories. Report missingness and infrastructure failures alongside behavioral outcomes. Do not remove a failed run because its model did nothing. Do not treat actions from the same resident as independent study participants. No significance test, leaderboard or universal success-rate claim is planned for this acceptance series.

A later comparative study may use wait-only and resource-seeking baselines, memory ablation and construction-enabled/disabled conditions with matched starts and budgets. Those are prospective controls, not currently executed benchmarks. Determine sample size using measured variability before confirmatory claims. Keep acceptance fixes separate from frozen evaluation cohorts.

## Review and progression

Archive records, generate summaries with the exporter, inspect actual state changes and reconcile every claimed outcome with evidence. Have a second reviewer inspect outcomes when available; until then label self-review. Advance to two residents only after repeatable body/needs/tool behavior and memory/custody isolation. Negative results and protocol deviations are first-class findings. No outcome requires an agent to form a society or invent a particular tool.
