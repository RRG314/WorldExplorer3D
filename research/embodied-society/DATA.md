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

`providerCalls` comes from the persisted provider ledger and must equal the number of event records. Event `status` is reserved/completed/failed; never infer successful application from it. `usage` contains only known nonnegative input/output token counts. `commandKind` is a recognized normalized action type or null. Checkpoint `frames` uses 60 physics frames per simulated second; `controllerCalls` excludes connection probes. `records/summary.json` is deterministically derived from the inventory and checked for drift.

`evidence/gemini-live-2026-09-11.json` remains the separate, narrowly scoped behavioral observation. Its two gathering actions are not reconstructed from provider completion counts. The public inventory deliberately does not expose complete state, so it cannot independently prove those inventory changes.

## Prospective record gaps

Future runs need a pre-run manifest, exact instruction/schema/rules hashes, start/end wall times, intervention events, authoritative before/after action receipts, independent evaluation, model revision when obtainable and complete world-input provenance. The current exporter improves retention and reporting but does not add missing historical fields or implement an append-only runtime journal. Durable process restart/replay also remains unimplemented.

Keep raw records until a retention decision is made and the public summaries are validated. Do not automatically delete failed attempts. Publication is a separate allowlisted export/review step, not a recursive copy of output. Corrections append a dated reason and new version; preserve prior published results through Git rather than quietly rewriting the scientific story.
