# Ordered repair plan and completion criteria

Execution has begun. See the [active repair program](../../RELEASE_REPAIR_PROGRAM.md) for subsequent changes and current blockers. The statuses below describe the original audit baseline.

This plan preserves the working app. A work package is complete when its evidence exists, not when an AI says the implementation looks right. No full-product readiness claim is justified yet.

## 0. Protect the workstation — completed within the stated scope

Removed 111 verified generated candidates and recovered approximately 17.5 GiB. Added a four-candidate creation limit, a 10 GiB free-space requirement, and repository instructions for one task at a time. Kept source snapshots and current artifacts. No application runtime or deployment was changed.

Remaining limitation: this is not a process memory governor. Heavy browser/emulator/release work needs suitable CI capacity or explicit owner authorization. Further cleanup must identify generated content before deletion.

## 1. Make the release checks truthful

Wire current contract tests into pull-request CI, install backend dependencies explicitly, and make the release matrix include Storage rules and capture publication. Use a single gate definition to drive both documentation and execution. Keep cheap checks separate from hardware-intensive checks.

**Done when:** a clean CI checkout installs deterministically; a deliberately broken required behavior makes CI fail; missing, skipped or interrupted required evidence blocks release; reports identify the exact build. No broad tests should be launched on this Mac to compensate for missing CI configuration.

## 2. Repair shared request and startup behavior

Define a common API request contract with a stable operation ID for writes, server-side deduplication, bounded timeout, cancellation and an explicit uncertain-result state. Review each endpoint before deciding whether retry is safe. Remove timed-out script elements and listeners, and ensure every loader path settles.

**Why:** individual feature fixes cannot compensate for a shared request client that repeats writes or waits forever.

**Done when:** a lost response after commit still produces one submission; duplicate IDs with incompatible payloads are rejected; cancellation and timeout settle the UI; a startup retry succeeds or fails within a bounded time without stale elements. Use small deterministic tests first.

## 3. Make deletion and multiplayer boundaries reliable

Map all user-owned and authored collections, including submissions, shared-room chat and capture assets. Specify what is removed versus anonymized or retained. Implement a resumable deletion job; record failures rather than treating skipped queries as success. Keep sufficient job identity to resume even if the login has been removed.

Move room admission and capacity enforcement to an authorized atomic server operation. Return only necessary prejoin metadata; restrict precise player data to the intended membership boundary. Review invitation code generation and abuse limits.

**Done when:** injected cleanup failures cannot produce a completed deletion response; a retry finishes without harming other users; simultaneous joins cannot exceed capacity; prejoin reads cannot return full player records unless that disclosure is an explicitly accepted product policy.

## 4. Finish one coherent editing and publishing journey

Use one account/review shell, consistent labels, preserved editing context and a direct “View in world” result. Show draft, upload, review and publication states plainly. Make the selected entrance part of the saved revision. Treat floor, walls and ceiling as explicit surfaces, with orientation and material assertions.

**Why:** the owner should not need to understand internal tools or guess whether preview means publication.

**Done when:** a disposable contributor selects a building, adds and reshapes a room, attaches floor and ceiling photos, chooses the entrance, submits once, sees status, and an authorized reviewer publishes it. The player returns to that building, sees the new exterior/revision, enters from the chosen side, walks on the floor, sees the intended surfaces and exits. Test rejection, denied permission, interrupted upload, failed publication and reload recovery too. Preserve real user records.

## 5. Strengthen maintenance boundaries without rewriting everything

Start with typed or checked interfaces for shared context, API responses, capture states and geometry coordinates. Split large controllers by responsibility as they are touched. Keep existing proven domain models and lifecycle scopes. Add focused regression tests before changing a boundary.

**Done when:** one migrated boundary has explicit inputs/outputs, invalid contracts fail an automated check, its user journey still passes, and there is no duplicate competing authority. Repeat incrementally; do not replace the renderer or framework as a shortcut.

## 6. Make deployment and operations deliberate

Require explicit project selection for deploy commands and block accidental production defaults. Inventory browser CDN dependencies alongside npm packages. Introduce integrity/CSP controls carefully after compatibility testing. Inventory cloud configuration read-only: permissions, backups, recovery settings, logs, alerts and budgets. Add privacy-conscious client error reporting with build and operation IDs.

**Done when:** a staging command cannot silently target production; dependency reports cover delivered browser code; a controlled error is traceable to its build; alerts reach the intended operator; a documented restore drill recovers test data. Repository absence alone must not be used to infer cloud settings.

## 7. Establish a usable product inventory and device acceptance

Maintain one current capability catalog with status, entry point, owner module, persistence location, supported devices and last successful evidence. Move historical patch narratives out of current instructions. Label local-only saves clearly. Test account switching and recovery expectations.

Run physical-device acceptance for the supported desktop/mobile platforms: permissions denied, offline/slow network, sign-out, reload, long sessions, touch/input focus and accessibility. Define performance budgets from measured target-device behavior; do not invent numbers from source size.

**Done when:** the owner can follow the current guide against the named build; each advertised critical journey has passing evidence; limitations are visible; device results include memory and responsiveness observations on actual supported hardware.

## Suggested acceptance order for the owner

First check sign-in and returning to the same work. Then complete one building edit/publication/entry journey. Next test failed uploads and rejection, followed by multiplayer admission and account recovery/deletion using disposable accounts. Finally cover the wider activities and environments listed in the inventory. Developer/CI evidence should accompany these checks so you are not the sole person discovering regressions manually.

This audit identifies repairs; it does not mark those repairs implemented. Only package 0 was performed here. Each later package should be a bounded, reviewable change with its own evidence and rollback path.
