# Acceptance and preservation contract

This local repair does not authorize a GitHub push or deployment. Existing player data, history, the current dist artifact, preserved production artifact and four saved candidates remain intact. Work is saved in local commits. A source check, a controlled browser journey, an emulator journey and a live production receipt are distinct evidence.

## Binding evidence to the actual work

`source-fingerprint.mjs` separates runtime, tests, environment/configuration and documentation inputs. Runtime includes shipped HTML/JS/assets, Functions, build tooling, dependencies and unknown paths. Markdown inside a shipped directory remains runtime. Symlinks remain runtime inputs. File contents, executable bits, additions, staged/worktree differences and deletions are included. The same shipped-root list is shared with the builder, including Git-ignored files. Untracked shipped inputs make the build dirty. Unmerged/submodule or assume-unchanged/skip-worktree source fails closed.

Git blob identities avoid repeatedly reading the unchanged multi-gigabyte source asset set. Changed and untracked files are hashed from their bytes. This is source identity, separate from artifact byte verification. The acceptance digest includes runtime, test and environment input hashes. HEAD and a whole-workspace digest remain in reports as provenance; changing only reviewed prose does not invalidate gameplay evidence. Executor options, Node/host identity and provider/attestation routing have a separate digest for gate reuse. Credential values are never included in reports.

The v2 execution/gate format rejects older receipts as current acceptance. Old receipts remain historical evidence. A resumed gate must match current acceptance inputs, command, executor context and (when applicable) the immutable artifact. Artifact integrity, release contracts and public claims always run again. Interrupted checks invalidate their current success before child execution begins. A partial gate selection cannot write a complete-scope success.

Artifact identity now checks every actual file against the asset manifest, including the complete file set. A changed file with unchanged manifests, a missing/additional file or a symlink fails. Byte hashing is bounded to a 1 MiB read buffer; only a process-local stat/ctime/inode cache is used. Source acceptance and artifact identity are rechecked at the end of a full matrix. Source changes cannot borrow the old artifact's pass.

New builds reject dirty inputs before replacing the artifact, recheck inputs after building, and record `sourceInputFingerprint`. They retain their real build commit/time across later documentation-only commits. Old manifests retain strict legacy commit validation. Changes to code, tests, config or tooling still invalidate acceptance. Configuration-only production preparation additionally checks matching source-input fingerprints and unchanged non-configuration assets; it is not exercised as a deployment in this local task.

## Scope and honest readiness

The parent environment is sanitized with an explicit allowlist. Diagnostic subsets, private heap/CPU instrumentation, shortened retention, provider waivers and unknown `WE3D_*` flags cannot leak into release coverage. Gate commands specify any intentional scenarios themselves. The candidate performance gate explicitly requests the ten-minute mixed route and twelve reloads; unchanged FPS/p99/hitch/resource budgets apply. The final candidate currently has 90 gates plus three backend groups. It must run on one fresh matching immutable local artifact after runtime changes settle.

`release-scope.mjs` reports automated readiness separately from release readiness. The following six additional classes are mandatory, each tied to the exact artifact and accepted inputs. A missing receipt is pending; a failed, stale or mismatched receipt is invalid. No receipt has been fabricated for this work.

| Class | Evidence required |
| --- | --- |
| Ordinary hosted | Real cold/warm start, location search, sign-in, shared voyage and save recovery with ordinary attestation and live providers. Debug tokens do not qualify. |
| Physical iOS | Named hardware, OS/browser, touch/journey, memory/thermal and resume observations. Viewport emulation does not qualify. |
| Physical Android | The equivalent observations on a named Android device. |
| Fresh player | An uncoached exploration loop, understandable navigation and successful return/resume. |
| Weather entitlement | Actual commercial authorization, deployed endpoint coverage and attribution. Reference entitlement evidence; do not put keys or billing credentials in receipts. |
| Migration/rollback | Existing-save upgrade, a distinct fallback reading/writing the upgraded save and returning safely, backend protocol compatibility and retained fallback bytes. |

Receipt files belong under `output/release-evidence/current/acceptance/`; evidence-file hashes are verified. Hosted and rollback receipts expire after seven days; other observations have a maximum age of thirty days plus their explicit expiry. These bounds require fresh release decisions, not recurring work. The rollback artifact itself is rehashed and must still exist under the repository's preserved output. These validators verify the submitted evidence's consistency; they do not manufacture physical observations or contractual permission.

## Rollback boundary

The Journal now uses IndexedDB version 5. The old deployed v4 reader cannot be assumed to reopen it. Inventory control generations and the durable condition outbox also need compatible behavior. Never downgrade/delete player databases to make an old frontend run. The preserved old production/dist artifacts remain recoverable historical artifacts, but are not certified migration-compatible fallbacks. A new compatible fallback must be built, retained and exercised with disposable upgraded histories before rollback acceptance can pass.

## Current result

The original v1 candidate/backend receipts are correctly not current. The existing dist byte manifest remains unchanged and verified. All six external classes are pending. Active-play flight hitches and loading latency remain open. The next acceptance action is a fresh immutable local matrix after measured runtime repairs, followed by the genuinely external observations. No production-ready claim follows from the unit-test total or from a diagnostic trace.
