# Current gameplay QA

Use this for practical gameplay checks. The historical release matrix and the full contract inventory remain available for changes that justify them; they are not the default gameplay loop.

Run from the canonical `architecture-evaluation` worktree. Use one browser/build/emulator workflow at a time on the 8 GiB Mac. Default target is the staging site. Never clear an ordinary browser profile or player saves.

```sh
npm run qa:gameplay:plan
npm run qa:gameplay:report
npm run qa:gameplay -- --group earth --check earth-driving
```

`config/gameplay-qa.json` declares the current feature groups. A run retains matching evidence and starts only missing or changed cases. Browser journeys share setup within their group, then execute only selected pending assertions. Earth setup is a real city load; an isolated settings, ocean, planetary, save or sensor check does not load a city. Component groups are small, sequential Node tests.

Failures are retained too. Diagnose the saved log/state/screenshot first, then explicitly retry one failed check:

```sh
npm run qa:gameplay -- --group mobile --check mobile-load --retry
```

An unchanged failed launch/performance check never repeatedly opens a world when the default command is run again. Editing a check's own assertion invalidates that check; editing an unrelated later assertion does not invalidate the whole journey. Shared setup changes invalidate the journey. Relevant game source, imported dependencies (including literal CommonJS imports), configuration and installed Chrome/host identity invalidate affected evidence. Directory-valued `new URL('../', import.meta.url)` references are not dependencies; declare dynamically loaded assets/directories in the manifest. Evidence files are hashed and missing/modified evidence cannot pass.

The target's source commit must match delivered local game source. QA/docs-only changes do not require rebuilding the game. Do not remove that guard to test old hosted bytes after editing product code. `WE3D_QA_BASE` selects a matching isolated staging artifact served locally; `WE3D_QA_LEDGER` selects a separate evidence ledger. Ordinary source previews are deliberately not immutable build evidence.

Each attempt has its own directory, command, log, source identity and result. `receipts/` contains current pointers; failed attempts remain in `attempts/`. `coverage-report.json` reads and validates receipts without launching browsers. It reports failures, stale evidence and missing coverage; it is not a release approval. Imported unit logs require an exact command/input/hash receipt. Retaining older evidence after a reviewed scope expansion requires a separate auditable byte/source comparison; never relabel an old assertion as newly executed.

## Player-facing coverage and limits

- Shell, responsive settings and preference persistence.
- Earth walking/camera, map/pause input release, driving/braking, Backpack/Journal, drone/aircraft, ship and Moon return.
- Touch walking/look/driving, rotation/layout and native renderer-frame timing.
- Ocean guided research entry, deck walking/map, submarine, scuba and recovery.
- Current visible Space shortcut, course selection, assist/manual control and fresh Mars entry.
- Native IndexedDB saves across tabs/reload/failure/undo; interior editor desktop/phone layout and actual 3D output.
- Focused ownership, activity, fishing, crafting/building storage, companions, progression, physics, controller, GPS and AR lifecycle contracts.

Use existing proven multiplayer and 24-hour tester-email service evidence while their code/configuration remains unchanged. Do not send another series of real emails or create more accounts merely to rerun unrelated movement checks. Record their source/build and any limits separately. Mini-game component contracts and older UI evidence do not imply newly tested complete mini-game gameplay after shared controller changes.

Performance counts changes to the actual renderer frame counter, not every browser animation callback. Existing gameplay budgets remain authoritative: desktop at least 30 FPS with p95 <=35 ms and p99 <=50 ms; mobile proxy at least 30 FPS with p95 <=50 ms and p99 <=100 ms; no >250 ms stalls in the sampled window. Keep loading time separate. A short desktop touch-emulation sample is not physical-phone, Safari, thermal/battery, memory-limit or multiplayer-capacity certification. Synthetic controller input is not a physical-controller test. Synthetic GPS/AR input is not a field test.

Inspect screenshots and saved state together. Preserve console/page errors, including service-attestation failures; do not relax App Check or production policies to obtain a green result. Use `closeOwnedBrowser` for owned browser servers only. Keep measured source unchanged throughout every run.
