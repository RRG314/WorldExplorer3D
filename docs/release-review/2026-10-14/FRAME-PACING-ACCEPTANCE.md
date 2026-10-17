# Desktop frame pacing acceptance — October 14, 2026

The owner explicitly prioritizes fixing jitter and pauses over reaching a perfect
average frame rate. The previous 43.65 FPS minimum came from an August 23 capture;
it was neither a current product requirement nor a guarantee of smooth motion.
Do not use old notes or 5.2 parity as acceptance.

The current desktop floor is **30 FPS**. This is an explicit change in the release
criterion, not a claim that the former 43.65 FPS requirement passed. Historical
reference values remain in the configuration and every earlier failed receipt is
preserved. No drawing resolution, building/road coverage, world detail, simulation
behavior or physics frequency is reduced by this change.

The existing independent criteria remain unchanged: p95 ≤ 34.36 ms, p99 ≤ 50 ms,
no individual interval above 250 ms (apart from the existing 0.05 ms rounding
tolerance), at most one interval above 100 ms per minute, and at least 10 seconds
between those hitches. The 630-second keyboard route, occupied-world retained
memory, twelve release/reload cycles, coverage and resource checks remain required.
Those checks still reject the measured cold-flight pauses. A passing average FPS
must never substitute for a passing pacing result.

The actual 5.5.1 staging artifact was byte-verified from the released source and
measured on the same M1 / 8 GiB / Chrome host with the same native-memory harness.
Short stationary walk/drive windows were 43.33 / 40.22 FPS; moving ground windows
were 43.06 / 42.46 FPS, with 33.4–33.5 ms p99. Its 90-second flight averaged 53.17 FPS
but paused for 1049.9 and 883.3 ms. These are bounded diagnostics, not sustained
baseline certification or permission to accept inherited defects.

The next building-storage source diagnostic has 52.40 FPS flight, 33.4 ms p99,
and 366.7 / 150 / 299.9 ms pauses. This is an improvement and still a failed hitch
result. Packaging, prescribed gameplay, complete matrix and source-bound release
acceptance remain required. Evidence:
`output/release-review/551-current-host-native-flight/` and
`output/release-review/561-building-storage-native-flight/`.
