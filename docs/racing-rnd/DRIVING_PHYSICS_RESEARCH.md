# Driving physics alternatives

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

[Rapier's raycast controller](https://rapier.rs/docs/user_guides/javascript/vehicle_controller/) models a rigid chassis with suspension rays. A disposable0.21.0 trial was executed outside the app; no dependency or second physics world was introduced into gameplay. It demonstrates a candidate, not a conversion decision.

[Chrono tyre models](https://api.chrono.projectchrono.org/wheeled_tire.html) distinguish empirical Pacejka/TMeasy/Fiala approaches with different calibration needs. The existing fleet has dimensions and game profiles, not the empirical coefficients needed to claim calibrated Pacejka physics. [BeamNG](https://www.beamng.com/game/about/physics/) additionally needs a structural body model absent from these GLBs.

| Approach | Integration | Benefits | Unresolved costs |
|---|---|---|---|
| Current controller, incremental portable equations | Retain `physics.js`, input, support, airborne and actor contracts | Lowest lifecycle risk; shared driving/racing | Need measured traction-circle, weight-transfer, drivetrain and assist calibration |
| Rapier raycast chassis | Adapt canonical road meshes into scoped colliders; replace road-controller integration under existing owner | Suspension/body contact engine | Large geospatial collision world, contact-layer parity, mobile/bridge/tunnel/persistence migration unverified |
| Full multi-body/soft-body | Wheel bodies, joints, deformation structure | Higher simulation ceiling | Asset authoring, stability, CPU and networking costs unjustified for current browser target |
| Rust/Wasm custom force kernel | Same equations and controller owner | Potential numeric throughput | Copy/boundary costs; determinism does not follow automatically |

Recommendation: retain current authority while proving improvements against actual journeys. Add one coherent tyre-force budget only after braking/turning telemetry is characterized; engine torque/gear tuning depends on that decision. Do not present inactive ABS, differential or camber sliders. Existing arcade touch assists remain defaults; assists must be included in future event/record keys.

## Measured calibration, October28

The extracted original controller reached60mph in1.367s for the starter BMW,
1.708s for Fleetwood and2.992s for a city bus. BMW60-to-zero was13.37m and
identical under the tested wet-grip factor. This supplied evidence for a shared
calibration change rather than another vehicle-health workaround.

`physics/automatic-powertrain.js` now uses wheel speed,actual asset wheel radius,
a game torque map,forward/reverse ratios,shift hysteresis and a brief torque
interruption. Its RPM/gear values affect thrust. Longitudinal tyre capacity and
steering yaw use grip limits; wet grip affects stopping. Deliberate handbrake
drift begins at18mph,not the old7.5mph raw-unit threshold. Reverse is bounded
to18mph. This remains an accessible arcade chassis,not a factory-calibrated
manufacturer model or a professional tyre simulator.

The design principle of a speed/torque map and ratio/shift-point transmission is
supported by [Project Chrono's powertrain documentation](https://api.chrono.projectchrono.org/vehicle_powertrain.html).
No Chrono code,example parameters or vehicle asset is copied into this model.
The existing road-car configuration/profile/upgrade authorities own calibration.
Existing planetary acceleration/braking constants are explicit in the same
configuration module; mode-specific rover multipliers and Ocean/aircraft/Space
controllers remain with their existing owners.

Current source benchmark: BMW0–60mph7.392s,60–0in45.35m dry/57.59m atgrip.7;
Fleetwood10.283s/47.12m;pickup7.708s/47.59m;van9.833s/48.54m;bus43.767s/55.96m.
These are game calibration measurements,not manufacturer performance claims.
Engine,brake and tyre upgrades have measured effects within grip limits.
Actual in-game feel and sustained timing remain required on the final candidate.
