# World Explorer 3D: product audit

September 10, 2026. Source baseline: `53452516c16eb93ae7828a642156d24528a88ca9`, branch `steven/building-exteriors-local`. This report describes inspected source and the checks listed in [the evidence ledger](tests-and-evidence.md). It does not certify every feature or the deployed cloud configuration.

## What this means for you

The app contains substantial working systems, but its release process does not yet provide reliable evidence that the whole product works together. Passing the usual checks can leave the exact journey you care about—edit a house, submit it, approve it, see it in the world, enter it—untested. There are also concrete reliability defects in common infrastructure. These deserve attention before adding more features.

A complete rewrite would put your working features at unnecessary risk. Preserve them, fix the shared infrastructure, and make the important user journeys mandatory release checks. The inventory and repair plan explain the boundaries to use.

## The computer problem: action taken

The saved candidate directory occupied about 20.4 GiB and contained 115 recognized build copies. I removed 111 verified generated copies, recovering approximately **17.5 GiB**. Available disk space increased from about 12 GiB to 30 GiB. Four recognized builds remain, along with six unrecognized source snapshots that were deliberately preserved. Source, Git history, dependencies, the current dist artifact, and user records were not removed. The [cleanup receipt](resource-cleanup.json) records the selection.

The Mac has 8 GiB RAM. Running heavy browser and emulator work together was inappropriate for it. No audit-owned test processes remained when checked after the interruption/restart. The reported memory peak was not measured, and this audit does not establish that the game itself leaked 20 GB of RAM.

Changes made in this task: repository instructions require one task at a time and explicit authorization before heavy checks; candidate creation now stops at four recognized saved builds and requires 10 GiB free disk space. These prevent one identified source of growth. They are not an operating-system memory limit or a guarantee against every freeze. No application runtime change or deployment was made during this cleanup/audit.

## What is wrong, in priority order

| Priority | Finding and practical consequence | Evidence | Required correction |
|---|---|---|---|
| High | Ordinary pull-request checks omit the 234 current contract tests and backend security suites. Broken features can be accepted while the usual check is green. | Workflow and package-script inspection. | Make small meaningful suites mandatory in CI; run heavier release checks on suitable CI machines. |
| High | The release matrix omits dedicated coverage of the capture/edit/approval/world journey and Storage rules. Your recent failure path can escape a release gate. | Release configuration and backend matrix inspection. | Add one complete journey and negative permission tests to required gates. |
| High | The shared HTTP client retries writes against another URL after an ambiguous network failure. A submission can be recorded twice. | Local mocked-transport reproduction: two writes after the first response was lost; backend uses an auto-ID add. | Give each operation a stable request ID, deduplicate on the server, and resolve uncertain outcomes. |
| High | Account deletion can skip failed cleanup queries and still delete the login and report success. Some authored records are not explicitly covered. | Backend source and account promise inspection; no real account deleted. | Durable deletion job, complete ownership inventory, explicit retention rules, retry failures before reporting completion. |
| High | A deployment shortcut can use the default production project. Browser environment protections do not protect this CLI command. | `.firebaserc` and `functions/package.json`. | Explicit project selection and separate guarded production release command. |
| Medium | A timed-out startup script remains in the page. A retry can wait forever for its events. | Local fake-DOM reproduction of original loader logic. | Clean up failed script elements and apply a timeout to every attempt. |
| Medium | Requests do not forward cancellation or enforce a deadline. A stuck request can leave the UI waiting indefinitely. | Shared client inspection and mocked-fetch cancellation probe. | Standard timeout, cancellation and recoverable failure state. |
| Medium | Private-room prejoin reads expose full player records to signed-in invite-code holders; room capacity is checked separately on the client. | Rules, existing tests and join implementation. | Limit prejoin metadata; enforce capacity atomically on the server. This is not a demonstrated anonymous-data exploit. |
| Medium | Shared mutable context and large controllers make unrelated features easy to break. | 164 direct shared-context imports; several handwritten controllers exceed 2,000 lines. | Gradually introduce explicit interfaces and split responsibilities at tested boundaries. |
| Medium | Current docs and saved release evidence refer to older builds and sometimes contradict current features. | Guide dates, evidence manifests and source comparison. | One current capability catalog, build-specific evidence, separate historical notes. |

## Why these look like common AI-development problems

The problem is not that all the code is bad. The repository has real executable tests, domain models, lifecycle handling, server authorities and immutable build tooling. Those are useful foundations.

The concerning pattern is that feature additions, verification commands and documentation have accumulated faster than their integration. A test may prove a button exists without proving that pressing it saves or approves anything. A new test may never be called by the normal release command. A client-side check may look correct while another client can bypass it. Separate screens may each work while the user cannot understand how to move between them. These are specific engineering gaps, not proof of how any individual file was authored.

## Standard behavior versus custom behavior

World generation, coordinate transforms, interiors, vehicle simulation and expedition rules reasonably need custom design. Authentication, request retries, uploads, permissions, account deletion, navigation, accessible forms, release gates and backup recovery should follow consistent shared patterns. They should not be reinvented independently by each feature.

For account/admin/approval screens, use one navigation shell with clear destinations: **My account**, **My contributions**, and **Review queue** for authorized reviewers. Keep editing context and provide a direct return to the affected building. A successful approval should show what was published and where to view it. This is a proposed product contract; a full signed-in usability walkthrough was not completed in this audit.

## Read next

- [Architecture and system inventory](architecture-and-inventory.md): what exists, where it lives, and where information is stored.
- [Tests and evidence](tests-and-evidence.md): what passed, what did not run, and why a green result can mislead.
- [Ordered repair plan](repair-plan.md): what to change and the proof required before calling each item done.

The infrastructure defects above remain repair work except for the resource cleanup and candidate safeguards. Interrupted browser checks, live cloud settings, restore capability, and physical-device performance remain unverified. They are not silently counted as passing.
