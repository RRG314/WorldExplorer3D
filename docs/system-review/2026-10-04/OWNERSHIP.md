# Runtime ownership contracts

The compatibility context remains for existing features. The following interfaces own the selected boundaries; this is not a claim that every mutable Three.js object or actor field has been encapsulated.

| Boundary | Owner and commands | Observation and failure |
| --- | --- | --- |
| Environment/session | `session-coordinator`: begin, commit, cancel; existing world request owner retains location publication | `captureEnvironmentSession()` provides generation, environment, world sequence, abort signal and current check. Begin invalidates prior continuations. Failed entry returns to the retained world or existing location-menu recovery, depending on departure stage. |
| Actor/travel | `travel-mode.setTravelMode`, existing per-mode physics, shared marine seat authority | Existing `transport/actor-contract.activeTransportActor()` returns copied pose/mode/identity; no duplicate actor-state service is introduced. Legacy physics writers remain explicitly enumerated; semantic travel requests use the owner. |
| Presentation | Active main/Ocean/Space owner, scene bootstrap and each mode's lifecycle scope | `capturePresentation()` checks renderer/scene/camera identity. Core drawing refuses a dedicated renderer's frame. Nested ship interior uses the main renderer while Space's frame owner is suspended. |
| Pause | `pause-state` named reasons | `ctx.paused` is read-only. Releasing manual pause cannot clear another overlay's reason. |
| Persistence | Journal transactions, condition synchronization and account endpoint | Versioned/idempotent health commands, pending/error/durability snapshot; existing Journal receipt/import transactions retained. No room voyage writes the personal-voyage save. |

`config/context-write-allowlist.json` records existing root-context writer fields by module, including injected ctx/appCtx parameters and conservative local aliases. CI rejects new writer relationships. It is a migration boundary, not proof against arbitrary dynamic reflection or all alias patterns. Review every addition; do not regenerate the allowlist as an automatic response to a failing check.

Late Earth restore checks generation after each actor await and cannot dismiss a newer loader. Lazy mode imports check request and session before invoking entry. Ocean bathymetry continuations check site generation as well as lifecycle. Marine stages include deployment identity, converge after interrupted entry, and leave invalidates entry before restoring personal state. Submarine-to-boat recovery accepts the same cancellation guard.

Validation includes delayed entry/stage replacement/leave, Earth→Ocean→Earth with an old pending restore, nested pause, dedicated-renderer replacement and ten coordinator cycles. Actual ten-round-trip ship/submarine lifetime checks and actual research/reload journeys are separate browser evidence in the implementation ledger. Existing planetary and ship traversal acceptance remains required for the final artifact.


The marine evidence owner now exposes `cancelWaterEnvironmentEvidence` alongside its existing refresh command. Only `world/water-environment.js` publishes these two functions. The session coordinator calls cancellation when a transition begins; world reset calls it with evidence clearing. Neither caller writes marine snapshots or borrows an AbortController. The reviewed context allowlist adds only this lifecycle command. Live Earth has an independent consumer/controller so closing its panel cannot cancel a model request still owned by the world.
