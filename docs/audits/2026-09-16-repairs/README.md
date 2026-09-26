# Repair evidence and RDT decision

September 16, 2026. Local application branch only; no deployment.

## Repairs

- The artifact builder now packages the pavement and overview workers and supplies their hashed URLs to the runtime. Artifact verification rejects absent runtime entries and absent entry files. A new release gate executes both packaged worker protocols, requiring actual nonempty output rather than merely finding a filename.
- The retained production regression suite is now in the current-contract gate. Its blanket prohibition on ground markings was reconciled with the existing terrain-conforming implementation: ground markings remain available, elevated markings remain disabled. A new integrated test projects markings onto a folded mesh and rejects unsupported gaps and elevated-deck support. Projection explicitly selects the at-grade layer.
- The ordinary `streetDiagnostics=1` panel no longer instruments every WebGL call. Detailed graphics timing requires `graphicsDiagnostics=1`. This removes instrumentation from ordinary inspection; it is not a quantified whole-app speedup.
- The desktop performance test now requires a 90-second aircraft sample and at least 1,000 world units of displacement. It records actual elapsed duration and displacement. Its quick audit mode cannot satisfy sustained-flight acceptance. This longer test has not yet been run to a passing result.
- A sustained packaged flight identified a slow `reality-capture.nearby` update. The nearby-ID selector previously sorted every building and repeatedly calculated distances inside the comparator. It now retains only the nearest 60 unique IDs in a max heap. Ties and duplicates preserve the original full-sort order, and all buildings remain in the world. Visible diagnostics report this selection's duration separately.

## Verification

The final current-contract suite passed **438 tests**, including the previously omitted production regressions and new dense-city capture selection cases. The focused road/marking checks passed **21 tests**. The actual packaged pavement and overview modules each generated nonempty output through their worker message protocols; both completed all six fixture cells. This protocol test uses a Node Web Worker adapter and is not browser/WebGL certification. The same gate rejects the saved pre-repair artifact for its missing worker entry.

An isolated 23,000-building selection benchmark used three warm-up iterations and 15 measured iterations of each implementation, comparing result IDs/order each time. Median time was **22.57 ms before / 1.22 ms after**. The input and reference selector are reproduced by `tests/capture-nearby-buildings-current.test.mjs`; individual timings are in `capture-selection-benchmark.json`. This measures selection only, not total capture refresh, rendering or flight.

The pre-repair artifact remains in `dist-audit-before-20260916`. The replacement `dist` is staging-configured for local browser testing. No application data or source snapshot was deleted. Only one whole-world test runs at a time.

The first browser attempt used a production-configured artifact on localhost. The Firebase environment guard rejected that configuration and essential gameplay startup returned to the menu. This was a test setup error. The guard remains intact. The corrected test uses staging configuration with the same bundling mechanism.

The first staging San Francisco run, before the capture selector optimization, loaded in **118.938 seconds**, with 22,595 building records, about 328 MB of scene geometry, and a 2.13 GB legacy heap estimate at the recorded startup sample. Both worker paths operated in the actual packaged browser application. The street screenshot was visually inspected; it is not a whole-city geometry acceptance result.

Flight ran longer than 119 seconds and crossed more than seven kilometres; its final view was over the ocean, so the recent frame window cannot represent continuous dense-city flight. The recorded recent window had p95 18.7 ms, p99 50.15 ms and maximum 2,581.5 ms; the session maximum reached 4,931.4 ms. The later heap estimate was 1.02 GB. These values do not establish a leak or a matched before/after gain. **Intermittent stalls remain a failure.** The diagnostic identified a 2,463.1 ms nearby-capture update and a 4,929.7 ms renderer update. Those are observed scheduler durations, not exclusive CPU profiles. Evidence: `sf-startup.json`, `sf-flight.json`, `sf-street.png`, `sf-flight.png`.

The final artifact `5.2.0+1519f0618e08.d67c7d366fca56e3.staging` was then exercised in a separate sequential run. It loaded in **122.081 seconds**, retained the same 22,595 building records, and reported 15.5 ms for its recorded startup building selection. A **139-second flight** confirmed the repaired path in the actual application; its last selection took 3.4 ms. A midpoint sample was 17.5 ms, so selection is not consistently below an 8 ms cooperative-work target. The capture runtime's observed session maximum was 143.5 ms, not a claim that this equals exclusive selector time.

The final flight sample recorded p95 **33.3 ms**, p99 **117.45 ms**, maximum **1,683.4 ms**, and a legacy heap estimate of about **1.071 GB**. **The final run still fails performance acceptance.** Its recent window again extends over ocean rather than continuous dense city. Renderer maximum was 377.7 ms; the larger frame gap is not fully attributed by per-system maxima. CPU/GC/host scheduling and publication outside those callbacks remain possible contributors. Do not label the remaining 1.68-second gap a proven renderer-only cost. Evidence: `sf-final-startup.json`, `sf-final-flight-midpoint.json`, `sf-final-flight.json`, `sf-final-flight.png`.

All owned browser test worlds were returned to the menu and closed, and the temporary port-4193 server was stopped. The original source preview at port 4192 remains available. No additional background test is running.

## RDT decision at the time of this audit

**Superseded in part by the owner-requested restoration:** RDT core and exact spatial capture lookup are now active. The geographic-hash content caps remain disabled. See [restoration evidence](../2026-09-16-rdt-restoration/README.md). The following records the earlier decision, not the current integration state.

**Do not restore the former RDT content-budget mode as a fix for these regressions.** This decision concerns its integration into this application, not a judgment about the standalone research.

The verified live commit initializes and resets its performance mode to baseline. Its optional RDT tile policy hashes geographic coordinates, computes an integer division depth from that hash, and reduces feature caps according to the depth. It does not observe current CPU time, GPU uploads, memory pressure or required surface topology. Bringing it back could make a location cheaper by dropping content without correcting why compilation or rendering is expensive. That conflicts with preserving buildings and connected roads.

Useful deterministic identity helpers were not lost: `procedural-random.js` retains geographic hashing, integer randomness and seeded sequences. An isolated comparison against the live commit checked 100 coordinate/seed cases with 20 sequence samples each: **2,200 values matched exactly**. See `rdt-identity-parity.json`. This establishes sampled identity parity, not a performance benchmark.

A future RDT proposal should be evaluated separately against the same retained content and routes. It must improve measured work without changing necessary geometry, collision, identities or publication timing. There is no evidence requiring its return now.

## Still open

Region-wide detailed road/building/scenery construction and retained geometry remain expensive. The prior whole-city evidence and current browser responsiveness do not support calling loading, memory or flight resolved. The next performance change must be tied to a measured compilation/publication/rendering owner and verified against world completeness. Worker packaging, marking tests and diagnostic overhead repairs alone cannot establish that outcome.

No matched baseline/candidate multi-city performance pass, memory-retainer proof, or global street visual acceptance is claimed in this report.
