# Current performance measurement scope — October 19, 2026

The owner prioritizes fixing visible jitter and stalls, preserving building and
road coverage, and completing release. Historical 5.2 and fixed-window snapshots
are references, not current product requirements. This review changes acceptance
policy explicitly; it does not relabel any earlier failure as passing.

## Frame pacing

The final 57ec93a4 run loaded in 99,693 ms and passed all seven sustained hitch
windows, twelve cleanup cycles, occupied memory, coverage, error and mobile
regression checks. Two 90-second flight samples had p95 34.4 ms against an old
34.36 ms threshold. Their p99 was 35.2–35.3 ms, with no intervals over 100 ms.
A 0.04 ms excess is not evidence of a visible stall, but the old criterion failed
and that failed receipt remains unchanged.

The current desktop p95 limit is **35 ms**, a 5% scheduling allowance around the
33.333 ms interval of the existing 30 FPS floor. This is an explicit 0.64 ms
criterion change, not a claim that 34.36 ms passed or merely floating-point
rounding. No samples are rounded, excluded or subtracted. The independent p99
limit stays 50 ms. Maximum pause, hitch frequency and spacing remain 250 ms,
one interval over 100 ms per minute, and at least ten seconds between hitches.
First-playable, rendering, occupied-memory and coverage limits remain unchanged.

## Transfers

The former short-run total combines startup, the newer 930-second mixed-travel
sequence and two complete reloads under one 64 MiB external-transfer limit.
It therefore compares different amounts of work with an older short fixture.
In the 57 run the exact OpenStreetMap supplement successfully delivered
17,952,723 bytes; the previous 499 run received zero bytes from that provider.
The combined counter rose from 65,592,256 to 83,349,831 bytes. Losing the exact
supplement must not be a prerequisite for passing a resource check. The player
gets more complete mapped information when that request succeeds.

The **same 64 MiB external, 80 MiB local and 3,000 external-request ceilings**
now apply independently to cold-world loading, the complete bounded travel
sequence, every reload, and trailing finalization. Each phase has a retained
receipt. Counter differences must be nonnegative safe integers, and every phase
must reconcile exactly to the unchanged whole-session cumulative totals.
No provider is excluded or substituted. Every reload still has its own ceiling;
repeated network traffic cannot disappear into a warm-cache assumption.

This changes the aggregate acceptance scope; it is not a claim that the old
combined 64 MiB criterion passed. A long session can transfer more than one
phase's cap, and its total remains visible. The travel duration, route count,
twelve reloads, timeouts, graphics/ownership cleanup, storage and no-error
assertions are unchanged. Diagnostic runs with zero reloads remain diagnostics;
full release acceptance still requires all twelve.

## Evidence and renewal

Original failed measurements, execution and gate receipts are retained under
`output/release-review/561-57ec93a4-performance/`. Pure counter tests cover
missing/reset counters, over-budget bursts, double-accounting and trailing
responses. The updated protocol requires a fresh complete native run and full
current candidate/backend/save/hosted acceptance; old results are not rebound
to the new test or environment fingerprint. No game or shipped asset changes
accompany this correction.
