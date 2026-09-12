# Data specification and recordkeeping

## Present evidence tiers

1. Source inspection establishes implementation presence.
2. Component/transport-double tests establish the tested boundary only.
3. Browser evidence establishes an observed UI/world journey.
4. Live provider evidence establishes actual requests/responses.
5. Authoritative before/after state establishes an applied action.

A provider's completed response is not an accepted world action. A reserved ledger event may remain unresolved after older failure paths. Missing timing, costs, hashes or outcomes are explicitly unknown. Existing records cannot be promoted to a richer tier by adding a template.

## Private and public records

Private raw runs stay under ignored `output/embodied-society-live/`. They can contain prompts, detailed locations, states and errors. Do not commit them or upload screenshots/account pages. API credentials, account emails, project/key identifiers, authentication headers, personal filesystem paths, user photos and unrelated player records are excluded from the research release.

The exporter publishes only an explicit field allowlist: run ID; retrospective classification; source-file SHA-256; aggregate call counts; event ordinal/status; numeric token usage; an allowed action-kind enum; terminal status; frame/controller-call counts. It does not copy free-text model output, errors, prompts, coordinates, account metadata or arbitrary new keys. Public run IDs are experiment identifiers, not account IDs. A hash attests bytes if the source is later available; it does not make withheld data independently auditable.

## Version 1 run inventory

`records/development-runs.json` has `schemaVersion`, `recordClass`, `scope`, and `runs`. Each entry names its run and contains `sources`, `providerCalls`, `providerEvents` and `checkpoint`. Missing checkpoint fields are null. `recordClass=retrospective-development-inventory` prevents confusion with prospective study output. Scope is five retained local development directories, not a claim to enumerate all model use on the owner's account.

`providerCalls` comes from the persisted provider ledger and must equal the number of event records. Event `status` is reserved/completed/failed; never infer successful application from it. `usage` contains only known nonnegative input/output token counts. `commandKind` is a recognized normalized action type or null. Checkpoint `frames` uses 60 physics frames per simulated second; `controllerCalls` counts controller attempts and excludes connection probes. A controller attempt can fail before provider dispatch, as the recorded cooldown race demonstrates; it may therefore exceed provider ledger calls. `records/summary.json` is deterministically derived from the inventory and checked for drift.

`evidence/gemini-live-2026-09-11.json` remains the separate, narrowly scoped behavioral observation. Its two gathering actions are not reconstructed from provider completion counts. The public inventory deliberately does not expose complete state, so it cannot independently prove those inventory changes.

## Prospective record gaps

Future runs need a pre-run manifest, exact instruction/schema/rules hashes, start/end wall times, intervention events, authoritative before/after action receipts, independent evaluation, model revision when obtainable and complete world-input provenance. The current exporter improves retention and reporting but does not add missing historical fields or implement an append-only runtime journal. Durable process restart/replay also remains unimplemented.

Keep raw records until a retention decision is made and the public summaries are validated. Do not automatically delete failed attempts. Publication is a separate allowlisted export/review step, not a recursive copy of output. Corrections append a dated reason and new version; preserve prior published results through Git rather than quietly rewriting the scientific story.

## Resource-use action evidence

Each new run retains an immutable start manifest separately from its rotating checkpoint. It records declared initial conditions, model/limits, supply layout, world publication and a fingerprint of research runtime source. Per-decision evidence binds the proposed action to before/after inventory, needs, finite node counts and construction state. Movement records distinguish queued, completed and interrupted motion with measured horizontal path length. `evaluate-run.py PRIVATE_RUN_DIRECTORY` emits a minimized derived record; it does not copy positions, prompts, account details or free-text provider errors. Curated publication adds stopping/intervention classifications after review.

These hashes cover available private snapshots, not a complete archive of map/terrain/network inputs. The evaluator checks state transitions produced by this system and is not an independent world authority. A completed recipe output does not alone prove usefulness, nor does a placed object establish shelter. Controller attempts may fail before a provider request; both counts must be retained.

For the budget-visible tool revision, `observations/call-N/workshop.json` privately stores the exact observation, operator instruction and response schema before dispatch. Files have a 64 KiB bound and restricted local permissions. They are separate from provider summaries and are not included in the minimized inventory. The start manifest freezes the material/recipe definitions required for conservative tool-chain evaluation. Hashes of observation records support integrity checks but do not make inaccessible private records publicly reproducible. Ordinary semantic rejections consume a decision and become next-step feedback; malformed actions and storage/provider failures remain distinct.

## Observer reports and prospective decision summaries

The observer exports Markdown from the controller's recorded action evidence. Each entry identifies the decision, action, outcome, before/after inventory and needs, and measured horizontal path where available. Missing after-state is explicitly reported. An interim download may contain unfinished movement. This is a readable view of evidence, not a substitute for the exact observation archive or a manufacturing evaluation.

The revised Gemini response contract also requests `decisionSummary`, a short statement of immediate intent and uncertainty capped at 240 characters. It is stored in the private provider ledger and copied into the controller's action evidence. It is never parsed as an action. Thought-marked provider content is excluded. Historical runs have no decision summaries and remain missing; retrospective explanations are not fabricated. This output-contract change is part of the source fingerprint and next-run manifest. Other provider adapters currently retain a null summary.

## Memory-comparison provenance

New runs record `memoryCondition` in their immutable start manifest and controller checkpoints. `outcomes-only` removes earlier decision summaries from model-visible recent memory; `intent-and-outcomes` includes each available statement alongside the original outcome. Both retain the private action-evidence summaries for reporting. The server pins the selected condition and bounds feedback to 20 entries and 240 characters per statement. Missing historical summaries remain missing. The fourth tool probe predates this field; its source implements outcomes-only observation, and it is not counted as one of the prospective comparison attempts.
