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
