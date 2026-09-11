# Owner instructions: protect this Mac and existing work

This is an 8 GiB Mac. The owner explicitly reported freezes and excessive disk use on September 10, 2026.

- Run one local task/process at a time. Do not run browser tests, emulators, builds or audits concurrently. Do not delegate to background agents unless the owner explicitly requests it.
- Prefer source inspection and small targeted tests. Do not launch whole-world WebGL tests or a full emulator/release matrix automatically. Explain the expected load and obtain explicit authorization before such heavy checks.
- Do not restart a heavy check after a failure or interruption without diagnosing it first.
- Check available disk space before creating artifacts. Keep at most four recognized saved candidates; preserve the current dist artifact and source/history. Never make repeated whole-project copies as a testing shortcut.
- Clean up only identified generated artifacts. Never delete source snapshots, Git worktrees/history, uploads, user records or unknown folders as cache cleanup.
- Track child processes and close owned browsers/servers when their task ends. Never kill the owner's ordinary browser or unrelated processes.
- Continue audits using a written evidence ledger. A source inspection, mocked component test, real browser journey and live service test are different evidence levels. Never label an interrupted or unrun check as passing.
- This repository is /Users/stevenreid/Developer/WorldExplorer3D-audit-1ec2f70. Production changes remain unauthorized. Use an explicit staging project for any authorized service work.
