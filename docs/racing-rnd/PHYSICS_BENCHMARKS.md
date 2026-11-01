# Physics prototype measurements

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Executable: `scripts/verification/racing-physics-benchmark.mjs`. Optional `WE3D_RAPIER_MODULE` points to a separately acquired official0.21.0 module; nothing is installed into the app. The trial archive/license remains private output, not public source assets.

One Node run,600steps per case on this Mac: current road-support + swept-spacing work about9.8/36.0/51.1microseconds per step for1/8/24cars. Disposable Rapier world with rigid chassis,4suspension rays, engine/brake input and static ground about91.6/61.9/110.4microseconds per step. Every candidate chassis remained finite and above its plane and travelled~105.75m. JIT/warmup and workload differences prohibit a head-to-head speed claim. This is not browser FPS, full current physics cost, terrain parity or mobile acceptance.

The first candidate used the opposite axle sign and travelled in negativeZ; it is retained as an axis-integration failure. Corrected trial moves in World Explorer's positiveZ direction. Native controller forward-speed sign still differs and would need an explicit adapter.

Benchmarks required before adopting a new force model:0–50km/h,50–0braking, steady-circle radius, slalom, step-steer settling, wet/offroad grip, loaded van/truck versus coupe, ramp/crest, elevated bridge/tunnel entry, collision impulse, damaged handling and fixed/variable frame schedules. Freeze geometry/seed/quality and compare equivalent commands. These full equivalent-controller measurements are pending, not silently passed by the isolated trial.

## Comparable existing-controller motion benchmark

Run `node scripts/verification/vehicle-motion-benchmark.mjs <private-output.json>`
for six real current vehicle profiles,dry/wet acceleration and60mph stops through
the shared controller at120Hz. This is distinct from the earlier different-workload
Rapier CPU trial. Before/after evidence is retained privately. Results in
DRIVING_PHYSICS_RESEARCH show the corrected calibration. No browser FPS or
physical-device performance conclusion follows from these source measurements.

Five exact trajectory cases first established that extraction preserved the old
controller in commitfbbea67. Subsequent deliberate Earth calibration supersedes
the old ground trajectories: current tests compare surge reduction,finite motion,
shifts/reverse,grip/stopping and actual upgrade effects. Moon/airborne preservation
cases remain numerical regressions. This is an intentional behavior change with
measured acceptance ranges; the earlier extraction proof remains in history.
