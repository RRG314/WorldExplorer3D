# Bounded language-model residents in a mapped 3D world: architecture, resource use and unsuccessful tool probes

World Explorer 3D research project · Technical report 0.3 · September 12, 2026
Status: original project report; not submitted, peer reviewed or independently replicated.

## Abstract

We study a single language-model resident acting through World Explorer 3D's mapped environment. A local server supplies structured observations and receives bounded actions; a host validates physical access while a workshop records resource custody and needs. Thirteen heterogeneous developmental runs are retained. In one resource-use trial, Gemini selected movement, gathering and consumption: food inventory decreased from eight to seven and food reserve increased by approximately 0.30. A matching-configuration repeat gathered but did not consume. Four focused tool probes produced no tool; the last completed its simulation allowance without a terminal interface error. These observations establish a narrow acquisition-to-consumption path, not reliable survival or manufacturing. We describe the architecture, amended protocols, unsuccessful attempts, evidence requirements and a prospective decision-summary instrument. No statistical comparison, artificial-life claim or independent replication is asserted.

## 1. Motivation and research question

A mapped game world supplies geometry, embodied constraints and existing player systems. A research extension can use these as constraints on action rather than constructing a text-only simulation. The long-term question is whether agents can maintain useful lives and develop capabilities through resources, tools and interaction under those constraints. The immediate engineering question is smaller: can a real model act through the existing world authority without bypassing collision, inventory or permissions?

The intended contribution at this stage is an inspectable integration and its evidence record. We do not claim a novel learning algorithm, a validated benchmark, an artificial civilization or conscious entities. “Resident” denotes a software-controlled actor. Needs are game variables, not measurements of subjective welfare.

## 2. Relationship to prior work

Park et al. (2023) describe generative agents using memory, reflection and planning in a social sandbox. Their study motivates treating memory and social behavior as explicit architectural and evaluation concerns. Our current 20-outcome buffer is much more limited; no equivalent reflection system or social evaluation is established. [Generative Agents](https://arxiv.org/abs/2304.03442).

Wang et al. (2023) describe Voyager, a Minecraft agent with an automatic curriculum and an executable skill library. This is relevant to tool acquisition and compositional capabilities. Our current resident chooses bounded typed actions over operator-defined transformations; it has neither Voyager's code skill library nor demonstrated open-ended skill discovery. The settings and metrics are not directly comparable. [Voyager](https://arxiv.org/abs/2305.16291).

Liu et al. (2023) introduce AgentBench for evaluating agents across multiple interactive environments. It provides context for distinguishing multi-step task outcomes from isolated language responses. We do not run AgentBench or claim a score on it. Our proposed study measures concrete world-state changes, failures and interventions instead. [AgentBench](https://arxiv.org/abs/2308.03688).

These references are intellectual context, not reused experimental results or endorsements. Full citations are in the annotated acknowledgements and BibTeX file.

## 3. System and authority

The application compiles external geographic evidence into a bounded scene. A mapped host checks the active publication identity, accepted ground, collision, line of sight, reach and a permitted research region. The resident body uses existing walking/physics code. The workshop owns finite materials, needs, crafting jobs, inventory and research constructions. The controller serializes time and decisions and checkpoints state before model requests.

A loopback Node server keeps the API credential outside the game configuration and sends structured observations to Gemini. The response schema permits one action shape. Parsing is not authorization: the host independently decides whether the proposed action is physically and procedurally permitted. Rejected material actions can become subsequent feedback. Provider or malformed-output failures do not become fake success actions.

The renderer projects state; it is not proof of resource custody. Construction uses existing Block geometry and collision, but its state is isolated from the ordinary player's persistent world. The research-served application disables Firebase account/analytics initialization. This is local experiment isolation, not a hardened public server or an OS sandbox for arbitrary code.

## 4. Observation and action model

The model receives structured body state, needs, inventory, active jobs, recent outcomes, visible permitted resources and placement information. It does not currently inspect continuous camera images. Recent memory is limited to 20 outcomes. Known recipe definitions are disclosed; resources are finite declared starting conditions. Thus successful crafting would demonstrate using supplied affordances, not discovering unknown chemistry or inventing an unrestricted technology tree.

Supported mechanics include movement, waiting, gathering, consumption, crafting, storage and construction. Source/component support must not be mistaken for successful live use. The mapped host currently supplies no verified shelter and no transfer consent. Full restart recovery and complete world-input archival are absent.

## 5. Developmental procedure

This was an integration/debugging pilot, not a preregistered experiment. The operator loaded a Baltimore location, configured a Free-tier Gemini project privately, and started one actor near declared supply piles. The setup was revised between attempts in response to provider errors and invalid action structure. One successful run used Gemini 3.1 Flash-Lite after earlier Gemini 3.8 Flash requests encountered service failures. These changes prevent treating the retained runs as interchangeable replicates.

Default bounds were 20 provider calls, at least 60 seconds between free requests and 2,048 maximum output tokens. Connection probes share the call allowance but do not act on the world. Simulation can wait while a decision is pending; wall-clock duration and simulation time must be reported separately. Provider charge enforcement was not independently measured; the Free tier was observed and billing was not changed.

## 6. Results

The initial integration success, `free-1789158460096-09fbef`, contained one connection probe and two world decisions, gathering one water and one snack. It established that provider output could change isolated resident custody. It did not establish movement or consumption.

The later resource-use profile began with empty inventory, water reserve 0.45, food reserve 0.55 and rest reserve 0.90, with supplies at least five horizontal metres away. Earlier attempts exposed inaccurate consumable descriptions and inconsistent request timing; both were corrected before the successful trial. In `free-1789174500266-c75911`, 20 decisions produced seven movements covering 12.663 metres, eleven balanced gathers, one rejected remote gather and one eating event. A snack was removed and food reserve increased from about 0.53 to 0.83. The unchanged-configuration repeat, `free-1789176286606-8773cb`, completed 20 decisions and gathered eight water and six snacks but did not consume either. This was a bounded repeat of conditions, not complete deterministic world replay.

A separate task asked the resident to obtain timber using a tool made from gathered raw materials, while maintaining its needs. Tool probe 1 stopped on an out-of-range movement control. Probe 2 gathered eight snacks and stopped on a material-instance identification error. After numeric bounds, catalog identifiers and remaining allowances were exposed explicitly, probe 3 completed 16 decisions and 900 simulated seconds. It moved 6.979 metres, gathered eight water and four snacks and received one remote-gather rejection. It neither consumed nor crafted. Sixteen private pre-dispatch observations establish that the task and budget were supplied. They do not explain the model's behavior.

The ledger inventory totals thirteen developmental runs and 105 events: 102 completed, one failed and two reserved. Known usage totals 276,278 input and 5,407 output tokens; three events lack usage. These counts describe adapter records, not successful physical actions or independently verified charges. The complete table and per-attempt evidence are in [RESULTS.md](../RESULTS.md).

A fourth tool probe, `free-1789182975761-e32016`, tested the brief stated-intent instrument in the live world. Sixteen responses produced three completed movements (5.545 metres) and thirteen balanced gathers (eight water, five snacks). No consumption or crafting occurred before the 900-second stop. All sixteen statements and exact pre-dispatch observations were archived. Statements repeatedly deferred the tool task until after supply collection. The observer showed actual inventory quantities while minimized, and automatic termination restored the human view.

The resident received recent action outcomes but not its earlier statements. A two-condition comparison was prepared to test returning those statements alongside outcomes. It is deferred before execution after the September 12 timing review. Both conditions retain the same action and explanation schema; no prescribed sequence is supplied. The implementation is component tested, but the comparison has not run. Neither the observed statements nor a future difference in a single exploratory pair would establish a causal explanation of the resident's internal computation.

## 7. Threats to validity

Selection and operator influence: setup and model/schema were changed during debugging. Starting supplies and known recipes constrain opportunities and may make gathering easy. There was no fixed baseline, random assignment, independent evaluator or planned sample size. Short observation and rounded needs displays do not establish survival. Provider availability and mutable model aliases may affect repetition. Only summary data are published; private raw ledgers and complete external world inputs are not available for full replay. Hashes support later integrity checks, not independent verification of inaccessible data.

Implementation validity: typed actions reduce ambiguity but do not prove all authority checks. Shelter and restart behavior remain incomplete. Existing full-application acceptance and security work is separate. Physical and social fidelity are limited by game rules. No inference about human society, intelligence rankings or consciousness is supported.

## 8. Next study

The [design review](../RESEARCH-DESIGN-REVIEW.md) calculates that the 900-second window reduced water by only 6.25 percentage points and food/rest by 3.125 points. It was not an adequate sustained-needs observation. An eight-hour window now has matching call, wall-time and journal allowances, with reduced idle recording and display-only perception work. These changes are component tested; no full eight-hour live study is reported. The owner selected acceleration first. The [accelerated protocol](../ACCELERATED-NEEDS-STUDY.md) couples resident physics, needs and jobs at a target 12× rate while preserving a simulated-minute decision interval. Ninety-one Node tests and twenty-four record tests pass. The [first launch](../reports/accelerated-needs-1.md) was interrupted during world loading before any model call, so accelerated live behavior remains unverified. Sparse action opportunities still limit interpretation of a future memory comparison. Rest/shelter and continuous autonomous activities remain incomplete.

The next milestone is a completed chain from gathered raw inputs to a crafted tool and subsequent tool-dependent acquisition. Success requires custody, job timing, produced output and tool-wear evidence; a completed provider response or a component fixture is insufficient. The designed recipe chain requires several material actions in addition to navigation, so comparisons must retain the declared allowance and report which limit stopped each run.

A useful next comparison would test an explicitly defined planning intervention against the current resident contract, with identical initial-condition procedures and budgets. Before running it, specify the intervention, number of attempts, primary outcome and handling of interface failures. Report stated intent alongside actions, but do not infer that short memory caused the existing failures. Population expansion, new recipe discovery and user visits are later research questions, not established capabilities of this pilot.

The supported conclusion is that a real model can acquire and consume a finite resource through the mapped-world authority. Repetition was inconsistent, and useful tool-making remains unmet.

## Availability and authorship

Code and sanitized summaries are published on the research branch under the repository's existing source-available terms. No external papers are redistributed. World Explorer 3D provides the research direction and platform; Codex assisted implementation, investigation and writing. Model-generated text is not an independent review. No external affiliation, funding, peer review or endorsement is asserted. See the data specification for withheld fields and reproduction limits.
