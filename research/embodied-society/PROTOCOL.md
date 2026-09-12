# Prospective protocol: single-resident survival and construction acceptance

Protocol ID `WE3D-S1-v1`, prepared September 11, 2026. **Status: developmental acceptance underway; no frozen three-run cohort completed; not externally preregistered.** This protocol follows the debugging pilot; it must not be retroactively described as that pilot's design. It is an engineering acceptance study, not a powered population experiment.

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

Keep the current maximum 900 simulated seconds and 20 total provider calls, with at least 60 seconds between free-tier requests. The live controls enforce a separate 20-minute wall limit, starting when the resident starts. The controller also enforces the simulation limit; report which stopped the run. Do not silently extend limits to obtain a success.

Stop on condition failure, leaving the permitted world, changed world identity, malformed action, exhausted allowance, unresolved provider failure, unsafe workstation load or operator request. Record terminal cause, elapsed wall/simulation time and remaining allowance. Pause/Resume, manual provider recovery, model switching, prompt edits, supplies added and repositioning are interventions. Provider probes are separately labeled and included in cost/call totals.

## Measures and analysis

For each run report: attempted/completed/failed/unresolved provider calls; proposed/accepted/rejected actions by kind; net resource acquisition/consumption; needs before/after consumption; path distance and out-of-bounds events; completed crafting chains; useful structures; terminal cause; interventions; wall time; simulated time; observed token usage and whether cost is measured or estimated.

Use exact counts and per-run trajectories. Report missingness and infrastructure failures alongside behavioral outcomes. Do not remove a failed run because its model did nothing. Do not treat actions from the same resident as independent study participants. No significance test, leaderboard or universal success-rate claim is planned for this acceptance series.

A later comparative study may use wait-only and resource-seeking baselines, memory ablation and construction-enabled/disabled conditions with matched starts and budgets. Those are prospective controls, not currently executed benchmarks. Determine sample size using measured variability before confirmatory claims. Keep acceptance fixes separate from frozen evaluation cohorts.

## Review and progression

Archive records, generate summaries with the exporter, inspect actual state changes and reconcile every claimed outcome with evidence. Have a second reviewer inspect outcomes when available; until then label self-review. Advance to two residents only after repeatable body/needs/tool behavior and memory/custody isolation. Negative results and protocol deviations are first-class findings. No outcome requires an agent to form a society or invent a particular tool.

## Amendment S1-A: resource-use acceptance setup (September 11)

Before the first S1 live attempt, add an explicit selectable `resource-use-v1` initial-condition profile: water 0.45, food 0.55, rest 0.90; empty inventory; no kits/tools; finite supplies on verified sites at least five horizontal metres from spawn. This differs from the full-needs developmental pilot and must be reported as a new treatment. It makes consumption observable within the existing 900-simulated-second/20-provider-call bounds without accelerating need decay. It does not assign actions or occupations. A 20-minute wall deadline now ends the run automatically. Movement guidance discloses actual movement axes, nominal speed and reach; it is an affordance description, not a policy.

Record a separate immutable start manifest with model/limits, research-source fingerprint, world publication, supply positions and initial needs. Keep it separate from rotating checkpoints. Checkpoints now include per-decision before/after resource, inventory and needs evidence. Movement is explicitly queued, completed or interrupted and records horizontal path length; accepting a move command is not evidence that it ran. These records remain private until reviewed and exported. Tool-to-workbench manufacturing may exceed the current call/time bound; failure to complete within it is a recorded limitation, not permission to silently extend it.

S1-A first attempt ended after six decisions: 6.216 m completed movement, two balanced water gathers, two out-of-reach rejections, no consumption. The operator stopped it for diagnosis. Inspection found inherited health-only item descriptions omitted research need restoration. The next source revision corrects those descriptions, derives effects from the same declared metadata, reports full 3D resource distance/reach and fixes nominal speed units. Starting needs, supplies, quotas and authority remain the same. This is a developmental correction between attempts, not an unchanged confirmatory cohort. First-attempt evidence is retained.

S1-A second attempt ended on an infrastructure defect before its second provider dispatch: the browser measured spacing from local decision start, earlier than actual server dispatch. One movement completed; no consumption occurred. The correction measures the next interval from completion of the previous request/checkpoint, conservatively preserving at least one minute between server calls. Tests include delayed dispatch/response and failed decisions. This is another development correction, not a behavioral failure or unchanged replicate.

## Next capability gate: useful tool production

After the first movement/gather/consume observation, freeze and repeat the corrected setup before claiming reliability. Preserve the general survival instruction and distinguish provider availability from behavior. The next capability outcome is an axe assembled from resident-gathered fiber, branch and stone, followed by authorized timber acquisition that previously required that tool. A tool appearing in inventory alone does not pass usefulness. Record ingredient escrow, completion time, output identity, capability check and durability change.

The shortest designed material chain requires at least nine nonmovement decisions: four raw gathers, cord start/finish, axe start/finish, and one tool-dependent timber gather. Travel, consumption, errors and waiting add decisions. A full workbench requires four timber gathers, four plank jobs (start/finish), a workbench job (start/finish) and placement in addition to the axe. That exceeds the current 20-call bound even before travel. Therefore the next bounded target is useful tool production; workbench/construction requires a separately declared budget or a reviewed change to job handling. Do not promise a full construction result under a budget that cannot accommodate its minimum action chain. No finished-tool or kit reserve is part of this end-to-end gate.

A completed developmental observation is not a completed three-run acceptance series. Report all corrected repetitions and failures before expanding the population. Any changed objective, initial needs, material allocation, model or action scheduler must identify a new configuration rather than being pooled into a claimed success rate.
