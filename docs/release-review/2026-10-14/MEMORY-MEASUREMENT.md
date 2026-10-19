# Memory measurement review

## Evidence and decision

The 258988d8 packaged aquarium repeatedly completes the actual visit at about
60 FPS and 16.8 ms p99 after the hidden-city transform repair. The old raw-heap
check still fails. Ordinary Chrome samples vary between roughly 1.1 and 2 GB
before a collection, despite unchanged game bytes and the same journey.

One separate diagnostic records 1,145,682,704 bytes immediately before
collection and 596,053,576 bytes afterward while the same aquarium remains
occupied. No actor, population, model cache or world was cleared. The sample
was collected only after all three live timing windows. Its report remains in
`output/release-review/561-aquarium-retention-diagnostic/`. Earlier failed raw
memory reports remain failures; they are not rewritten.

The verifier also rebuilt a whole-city building/structure inventory on every
loading RAF. Readiness now reads the same scalar game/loading flags directly;
renderer measurements read `renderer.info`. This removes observer allocation
without changing readiness requirements or gameplay. That alone did not bring
all raw heap samples below 1 GiB.

For 5.6.1, the memory criterion changes explicitly from an instantaneous raw
heap ceiling to an occupied-world **retained JavaScript data** ceiling. Its
numeric value remains 1 GiB. This is a measurement-policy change, not a claim
that the original raw-memory criterion passed or that peak browser memory is
below 1 GiB. Natural raw readings remain in every timing report.

## Separate phases

1. Run every live timing window with ordinary Chrome memory settings. No forced
   collection is permitted before or between those windows. Preserve all frame
   intervals and existing FPS, percentile and hitch limits.
2. After all timing, keep the actual scene occupied and collect solely to
   measure retained heap. Desktop coverage includes walking, driving and flight;
   venue coverage includes occupied reentry and subsequent lifecycle checks.
3. Continue the existing resource, repeated-world disposal, retained-growth,
   coverage and transfer checks. Those requirements are not weakened.

Missing metrics or failed collection fail verification. Raw timing fields and
retention fields have distinct names. Component checks cover premature
collection, preservation of raw values and missing/failed measurements.

[Chrome's memory diagnosis guidance](https://developer.chrome.com/docs/devtools/memory-problems)
distinguishes reachable/live JavaScript memory from used allocation awaiting
collection and uses collected baselines to investigate retention. This protocol
keeps that diagnostic operation outside gameplay timing. It does not measure
total process memory, GPU allocation, phone memory pressure or thermal behavior.
Transient allocation above 1 GiB remains a disclosed resource limitation.

Final current-package timing, retention, complete candidate/backend execution
and ordinary hosted checks are still required. The diagnostic is not release
approval.

## October 15 diagnostic correction

Earlier allocation probes replaced global typed-array constructors with proxies.
That changes `array.constructor === Type`: Three.js r128's animation conversion
then copies arrays that normal gameplay shares. Those constructor-probe totals
and heaps are perturbed observations, not native allocation or retention
baselines. Original reports remain preserved. Call sites from those probes are
investigation leads only; they cannot establish the benefit of a repair.

The minimal identity reproduction is recorded in
`output/release-review/561-buffer-counter-identity-audit.json`. Subsequent
comparisons must preserve native constructors and use read-only browser metrics
or bounded inventories after timing. The uninstrumented flight pauses remain
real failures. The separate facility-closure retention comparison used heap
sampling without constructor proxies and is not invalidated by this correction.

Host pressure is recorded separately from game ownership. The existing owner
Chrome session and Codex have substantial compressed memory on this 8 GiB host;
they were preserved. This observation does not prove the cause of a game pause
or turn a failing measurement into a pass.
