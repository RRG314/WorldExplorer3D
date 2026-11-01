# Performance evidence and limits

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Existing frozen pack desktop Monaco:57.386FPS,p9518.7ms,p9933.4ms,82.06m/minute,2x233.3ms pauses; pacing guard FAILED. Attribution was not isolated. Do not erase this result or call the current pack production-ready from averageFPS.

New source changes avoid repeated material scans/recompilation when vehicle health is unchanged. Damage clones geometry only for an instance that is actually damaged;template geometry is never edited. Fire/smoke are bounded,owned and reduced-motion aware. Traffic clearance runs in the existing30Hz owner with bounded resident agents;no new scheduler. Benchmark results are in PHYSICS_BENCHMARKS;isolated CPU numbers are not renderer/GPU performance.

Fresh exact-source acceptance must measure a real city with multiple vehicle changes,normal keyboard/touch input,health/repair and terrain support. Record resources,model leases,worker counts and cleanup after repeated selection/cancellation. Use one heavy process at a time and preserve ordinary Chrome. Mobile viewport emulation cannot certify physical-phone memory,thermal behaviour or nativeWebView latency. Remaining pacing attribution and sustained physical-device checks stay release blockers until measured.

## Shared foundation desktop update

Frozen6f1f18a actual Monaco driving70.04m/60s:29.185FPS,p9550ms,p9950.8ms,
maximum85.3ms,zero frames over100ms. Hitch guard passed,average desktop rate
remains unaccepted. Source coverage10,097buildings/11,533roads retained. Mac
resource pressure was observed but causation was not isolated. This does not
validate sustained racing/multiplayer or physical-phone performance.

## October 29 live shared-city acceptance

Frozen f2d6213 actual Monaco shared race, one 60,000.3 ms desktop window:
40.4498 FPS, p95 34.1 ms, p99 50.0 ms, maximum 100.1 ms, no frame over 250 ms.
The existing desktop budget and hitch guard passed. Moving time was 41.43 s;
this was real browser keyboard input with a separate authenticated protocol peer
and the deployed race authority, not two full renderers or physical devices.
No repeated minute is required for unchanged city/handling code. Earlier runs
remain failed/diagnostic evidence. Major venues and physical-device sustained
performance are separate claims. See SHARED_RACE_ACCEPTANCE.md.
