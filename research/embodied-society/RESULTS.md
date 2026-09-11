# Development results and failure inventory

September 11, 2026 · Retrospective engineering record, not a controlled study.

Five locally retained run directories contain nine provider ledger events: six completed, one failed and two left reserved by earlier instrumentation. Known usage totals are 5,071 input tokens and 670 output tokens; three events have missing usage. These are partial observed totals, not billing measurements or the owner's account-wide usage.

| Run | Provider events | Checkpoint | Interpretation |
|---|---:|---|---|
| `free-1789156903764-2a7df2` | 1 reserved | Ended, 0 frames | Earlier live Gemini attempt reported HTTP 503. The old ledger did not settle its event status; do not infer success. |
| `free-1789157745829-1887f0` | 1 completed, 1 failed | Ended, 0 frames | Connection probe answered; subsequent resident request encountered provider high demand. |
| `free-1789157970038-f53e68` | 2 completed | Ended, 0 frames | Provider responses arrived, but the resident action was rejected by the action contract. Provider completion is not behavioral success. |
| `free-1789158233581-43a171` | 1 reserved | Ended, 0 frames | Intermediate schema/normalization debugging attempt; incomplete ledger settlement. No applied behavioral outcome is established by this summary. |
| `free-1789158460096-09fbef` | 3 completed | Ended, 3,892 frames | One connection probe; two accepted gathering decisions in the separate behavioral record. |

The successful run produced one water and one snack. Pause/Resume/End were observed. It did not exercise autonomous movement, consumption, manufacturing or construction. No statistical success rate is reported: model/schema/setup changed across these debugging attempts, and probes are not resident decisions.

The public inventory and summary under `records/` are generated from selected private snapshots by `scripts/embodied-society/research-records.py`. They preserve incomplete statuses and missing fields. The behavioral claims come from `evidence/gemini-live-2026-09-11.json`, not from an assumption that every provider response altered the world. Hashes bind the summary to private source bytes but do not provide public full replay.

Automated evidence: 59 existing research component/HTTP tests were passing before packaging; seven recordkeeping tests now cover summary consistency, unknown private fields, count mismatch, negative usage, duplicate runs, export minimization and the provider/world distinction. Fresh packaging verification is recorded in PUBLICATION.md. No additional live model run was performed to produce this document.
