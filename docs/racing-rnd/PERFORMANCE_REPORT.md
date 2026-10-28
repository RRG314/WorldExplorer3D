# Performance evidence and limits

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Existing frozen pack desktop Monaco:57.386FPS,p9518.7ms,p9933.4ms,82.06m/minute,2x233.3ms pauses; pacing guard FAILED. Attribution was not isolated. Do not erase this result or call the current pack production-ready from averageFPS.

New source changes avoid repeated material scans/recompilation when vehicle health is unchanged. Damage clones geometry only for an instance that is actually damaged;template geometry is never edited. Fire/smoke are bounded,owned and reduced-motion aware. Traffic clearance runs in the existing30Hz owner with bounded resident agents;no new scheduler. Benchmark results are in PHYSICS_BENCHMARKS;isolated CPU numbers are not renderer/GPU performance.

Fresh exact-source acceptance must measure a real city with multiple vehicle changes,normal keyboard/touch input,health/repair and terrain support. Record resources,model leases,worker counts and cleanup after repeated selection/cancellation. Use one heavy process at a time and preserve ordinary Chrome. Mobile viewport emulation cannot certify physical-phone memory,thermal behaviour or nativeWebView latency. Remaining pacing attribution and sustained physical-device checks stay release blockers until measured.
