# Architecture investigation — September 26, 2026

Baseline: `bbe6502228e369fe2a15dc6a177f5d83948584c3` (5.3 release candidate). Work is isolated on `steven/architecture-evaluation`; the release checkout and production are unchanged.

**Status: investigation in progress.** Source inspection and a reproduced lifecycle repair are available. Required normal-player A–T hardware profiling is not complete. Do not interpret the recommendation as a completed performance certification.

Read [Executive decision](EXECUTIVE_DECISION.md), [runtime evidence](CURRENT_RUNTIME_PROFILE.md), [ownership and runtime audit](PRODUCTION_RUNTIME_AUDIT.md), [problems](ARCHITECTURAL_PROBLEMS.md), [research](TECHNOLOGY_RESEARCH.md), [comparison](ARCHITECTURE_COMPARISON.md), [rewrite impact](REWRITE_IMPACT_MATRIX.md), [feature parity](FEATURE_PARITY_MATRIX.md), [target architecture](TARGET_ARCHITECTURE.md), [migration](MIGRATION_PLAN.md), [repairs](REPAIRS_COMPLETED.md), and [open risks](OPEN_RISKS.md).

Evidence levels are kept separate: source findings, deterministic component tests, browser behavior, controlled performance samples, and live-service acceptance. Source size is not heap usage. Remote software-rendered verification is not mobile or Mac GPU performance evidence.
