# Professional release repair program

Started September 10, 2026. This is the active execution record for the [repair plan](audits/2026-09-10/repair-plan.md). The September 10 audit is a historical baseline; this document tracks subsequent repairs. **Release decision: blocked pending integration, security, device and operational evidence.**

## How a professional team would structure this

Preserve a known build, define which features and platforms the release supports, repair confirmed defects in small changes, and require repeatable evidence before promotion. Source inspection discovers risks; automated tests reproduce defects; staging proves connected behavior; the owner judges whether the experience makes sense. None substitutes for the others.

Use one release candidate at a time and one authoritative inventory. Separate work into: shared infrastructure; account/data security; edit/review/publication; world/travel lifecycle; device/accessibility; delivery/operations. Each change names its affected boundary, acceptance criteria, tests, remaining risk and rollback. Keep newly requested features outside stabilization unless they are necessary to complete an advertised journey.

### Review order

1. **Data and authorization:** can a user access or change somebody else's data, duplicate a write, lose progress, or receive a false deletion confirmation?
2. **Core journeys:** sign in, resume work, edit/submit/review/publish/enter a building, join/leave a room, travel and return without broken controls or lost state.
3. **Architecture and maintenance:** explicit ownership of state, stable identities and coordinates, cleanup during transitions, consistent API and persistence contracts.
4. **Interface quality:** consistent account/review navigation, understandable status, useful recovery from failed or uncertain actions, keyboard/touch accessibility.
5. **Release operations:** correct environment, reproducible artifact, enforced checks, usable failure evidence, monitoring, backup restore and rollback.

A professional review also uses an independent code reviewer where available. No independent reviewer or additional agent has been used in this task; changes have received local self-review and the checks below. Repository branch-protection settings and actual CI execution still need verification.

## Work implemented in the first repair batch

| Change | Verification completed | Remaining boundary |
|---|---|---|
| Pull requests now run source checks plus retained contract tests; selected capture/interior/security regressions were added | Updated local `verify:pr` passed 333 tests plus source checks | Workflow has not yet run on a clean GitHub runner. Branch protection is not configured by this code change. |
| Contract runner processes files sequentially and fails on a killed process instead of accepting a null exit status | Updated suite passed locally | Full release remains a CI workload. |
| CI installs backend dependencies explicitly; browser jobs install requested Chrome and Chromium; job duration and same-ref overlap are bounded | Workflow source reviewed | Remote installation and execution unverified. |
| Full release retains verification output even after a failed step | Workflow source reviewed | Artifact upload on real CI unverified. |
| Storage emulator/rules added to backend verification; capture contract and editor/review/entry fixture gates added | Gate configuration validated; existing local capture suite passed 68 tests | No emulator/browser fixture run in this batch. Separate fixture passes would still not prove the entire live publication journey. |
| Shared request client no longer retries ambiguous network/gateway/malformed-success failures; deadline/cancellation covers tokens, fetch and body delivery | 14 request regression tests passed, included in the 333 | Only non-JSON 404/405/501 routing rejections permit endpoint fallback. Automatic write replay remains disabled. |
| Uncertain write failures explicitly say completion may have occurred | Executable error-state tests | Every consuming screen still needs a usability check; displaying an error is not a status-reconciliation workflow. |
| Generic contribution submission supports owner-scoped request IDs and transactional deduplication | Five transaction-double tests passed, included in the 333 | Real Firestore concurrency and complete caller retry UX unverified. Legacy callers without IDs are supported but cannot recover by ID. This does not deduplicate every other endpoint. |
| Script-loader timeouts/errors remove failed elements; every attempt has a deadline and cleans listeners | Three fake-DOM recovery tests passed, included in the 333 | Real browser startup/late-network behavior unverified. |
| Account cleanup query/delete failures propagate rather than being swallowed | Five failure-injection tests passed, included in the 333 | Durable deletion job, complete ownership/retention inventory and end-to-end retry remain unfinished. Missing indexes will now produce honest failure rather than false success. |
| Default functions deploy script explicitly selects staging | Package command inspected | Does not prevent an operator manually invoking Firebase with another project. No deployment performed. |

Counts are separate suite results and may overlap; do not add them into a unique coverage total. Test doubles prove the tested logic, not cloud configuration. Local logs are retained under `output/verification/repair-foundation-20260910/`. No browser, emulator, build or deployment was launched for this repair batch.

## Remaining release blockers

| ID | Required work | Acceptance needed before closure |
|---|---|---|
| R1 | Execute and enforce the clean CI pipeline | Fresh runner installs both dependency trees, required checks fail on injected regressions, interrupted checks do not pass, required-check protection inspected. |
| R2 | Complete request recovery across write endpoints | Endpoint inventory classifies each retry policy; uncertain-result UI can reconcile by durable identity; response-loss tests prove one effect for each protected write. |
| R3 | Finish account deletion | Ownership inventory includes authored submissions, shared chat and media; resumable durable job records unfinished steps; failures cannot delete login prematurely or report completion; disposable-account emulator/staging evidence. |
| R4 | Repair multiplayer admission/privacy | Prejoin response contains only required metadata; server admission atomically enforces capacity; private data and concurrent-join negative tests pass. |
| R5 | Complete building publication acceptance | Same capture/revision travels from editor through upload, review, publication and refreshed world; selected entrance, visible floor/ceiling, collision and exit verified. Rejection, stale revision, interrupted upload and permission denial included. |
| R6 | Make account/admin/review coherent | One consistent navigation model, preserved editing context, clear status and direct return to the affected building; signed-in owner/reviewer walkthrough passes. |
| R7 | Reduce architectural coupling | Start with API/capture/persistence interfaces; validate invalid inputs and transitions; split large controllers incrementally while retaining behavior. No wholesale framework rewrite. |
| R8 | Verify operations | Read-only cloud configuration inventory, privacy-conscious error reporting, alerts, cost limits, dependency inventory including CDNs, backup restore exercise and explicit environment controls. |
| R9 | Verify supported devices | Actual target desktop/mobile devices, permissions denied, slow/offline network, reload, long sessions, keyboard/touch/accessibility and measured memory/responsiveness. |

These are release blockers or unresolved acceptance decisions, not work silently claimed complete. The currently configured editor/review/entry fixture gates are useful regressions; a single connected live journey is still required for R5.

## Definition of done for each repair

- A concrete failing behavior or risk is identified with a source location or reproduction.
- The change fixes that boundary without bypassing security or discarding working features.
- A meaningful regression test observes behavior, including the relevant failure path.
- A fresh result records source/build/environment and identifies mocks, skips and limits.
- The affected user journey is verified at the appropriate integration level.
- Release instructions, known limitations and rollback implications are updated.

## Promotion and rollback

First produce a staging candidate with matching hosting and backend contracts. Record artifact identity, test results, schema compatibility and any required migration. Verify using disposable users and fixtures; retain cleanup receipts. The owner then tests the real workflow against that identified build. Production remains separately authorized.

Rollback must cover more than hosting files: keep the previous compatible backend/artifact identity, identify whether new stored data is readable by the prior version, and rehearse recovery of test data. Do not claim rollback safety from a saved frontend folder alone. The first repair batch adds optional submission metadata and retains legacy callers; a full compatibility/rollback exercise has not run.

## Workstation policy

The owner's Mac has 8 GiB RAM. Run one bounded task at a time. Small source/contract checks are suitable locally; do not automatically launch the world browser suite, emulators or full release matrix. Root `AGENTS.md` requires explicit authorization before heavy local checks. CI can provide the appropriate machine for those checks; workflow changes alone do not mean CI has executed.
