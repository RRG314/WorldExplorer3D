# Bounded language-model residents in a mapped 3D world: architecture and an initial integration pilot

World Explorer 3D research project · Technical report 0.1 · September 11, 2026
Status: original project report; not submitted, peer reviewed or independently replicated.

## Abstract

We describe an experimental extension that places one language-model-controlled resident inside World Explorer 3D. The extension reuses mapped-world walking, collision, inventory and construction primitives while isolating model access behind a local server and host-validated action interface. A developmental live pilot using Gemini 3.1 Flash-Lite produced two accepted gathering actions, adding water and a snack to the resident inventory. A connection probe was separate from behavioral decisions. This result establishes a narrow end-to-end integration: model output can produce validated resource changes in the actual world. It does not establish sustained survival, technological invention, social organization, human-like cognition or superiority to another policy. We publish the architecture, a privacy-minimized inventory of five retained development attempts, explicit limitations and a prospective acceptance protocol.

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

The successful run `free-1789158460096-09fbef` completed three provider responses: one no-effect connection probe and two resident decisions. The latter gathered one water at simulation tick 0 and one snack at tick 36. The final checkpoint contained 3,892 frames (about 64.9 simulated seconds) and ended without a final error. Pause was observed at 23 simulated seconds, remained frozen during observation, and Resume continued. End visually restored the ordinary human state.

The retained development inventory contains five runs and nine ledger call reservations/events. Some early ledgers retain “reserved” after an unsuccessful attempt; this is incomplete instrumentation, not evidence of an unmade request or a successful action. Six events are recorded as completed by the provider adapter; only two actions are established as applied to the world by the committed behavioral evidence. We report no success percentage across these heterogeneous attempts.

The current component suite previously passed 59 tests. Such tests cover selected logic with fixtures or transport doubles; they do not increase the number of real behavioral observations. No movement, eating, tool production or construction occurred in the successful live test. Machine-readable summaries are under `records/`; the narrower behavioral record is under `evidence/`.

## 7. Threats to validity

Selection and operator influence: setup and model/schema were changed during debugging. Starting supplies and known recipes constrain opportunities and may make gathering easy. There was no fixed baseline, random assignment, independent evaluator or planned sample size. Short observation and rounded needs displays do not establish survival. Provider availability and mutable model aliases may affect repetition. Only summary data are published; private raw ledgers and complete external world inputs are not available for full replay. Hashes support later integrity checks, not independent verification of inaccessible data.

Implementation validity: typed actions reduce ambiguity but do not prove all authority checks. Shelter and restart behavior remain incomplete. Existing full-application acceptance and security work is separate. Physical and social fidelity are limited by game rules. No inference about human society, intelligence rankings or consciousness is supported.

## 8. Next study and conclusion

The prospective acceptance protocol defines movement, consumption and construction outcomes before further runs, includes intervention and infrastructure-failure records, and preserves unsuccessful runs. It begins with one resident. Population expansion and autonomous engineering remain separate gates. The present conclusion is limited but useful: a real model can select gathering actions that alter an isolated inventory through the existing mapped-world integration. Broader claims require new evidence.

## Availability and authorship

Code and sanitized summaries are published on the research branch under the repository's existing source-available terms. No external papers are redistributed. World Explorer 3D provides the research direction and platform; Codex assisted implementation, investigation and writing. Model-generated text is not an independent review. No external affiliation, funding, peer review or endorsement is asserted. See the data specification for withheld fields and reproduction limits.
