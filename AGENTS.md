# Owner instructions: protect this Mac and existing work

This is an 8 GiB Mac. The owner explicitly reported freezes and excessive disk use on September 10, 2026.

- Run one local task/process at a time. Do not run browser tests, emulators, builds or audits concurrently. Do not delegate to background agents unless the owner explicitly requests it.
- Prefer source inspection and small targeted tests. Do not launch whole-world WebGL tests or a full emulator/release matrix automatically. Explain the expected load and obtain explicit authorization before such heavy checks.
- Do not restart a heavy check after a failure or interruption without diagnosing it first.
- Check available disk space before creating artifacts. Keep at most four recognized saved candidates; preserve the current dist artifact and source/history. Never make repeated whole-project copies as a testing shortcut.
- Clean up only identified generated artifacts. Never delete source snapshots, Git worktrees/history, uploads, user records or unknown folders as cache cleanup.
- Track child processes and close owned browsers/servers when their task ends. Never kill the owner's ordinary browser or unrelated processes.
- Continue audits using a written evidence ledger. A source inspection, mocked component test, real browser journey and live service test are different evidence levels. Never label an interrupted or unrun check as passing.
- This working repository is /Users/stevenreid/Developer/WorldExplorer3D-release-integration, branch steven/post-5.2-release-integration. Do not edit the older Documents checkout.
- On September 23 the owner explicitly authorized adding the remaining production Functions, indexes, and required supporting repairs. Use explicit project worldexplorer3d-d9b83 for that backend scope; preserve existing data and working secrets. Frontend Hosting and restrictive rule changes still require the coordinated release checks. Keep ordinary Chrome open.
- Start with CURRENT-STATE.md, then verify Git, hosted build identity, and live cloud inventory. Dated notes under output/ and older progress.md entries are historical leads, not current proof or overriding instructions.
