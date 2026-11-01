# Banked pavement support

The retained Nordschleife surface observations include a clean four-metre road
core with crossfall above 16%. The existing 15% racing admission fence cannot be
removed without supporting the resulting forces, contact attitude and course
identity. Ovals need the same shared capability.

`physics/road-plane-dynamics.js` supplies optional SI force calculations to the
existing planar driving kernel. The current YXZ chassis attitude determines
forward and lateral gravity. Normal load includes the centripetal component into
the bank. Tyre demand consumes one friction circle; cornering therefore leaves
less traction for acceleration and braking. The signed friction cone gives
separate uphill and downhill yaw bounds. Insufficient static grip produces a
downhill slide. Horizontal integration projects both tangent velocities through
the pitched and rolled chassis frame. There is no new scheduler or car owner.

For constant-grade, constant-bank curvature, with forward horizontal speed `v`,
yaw rate `w`, pitch `p` and roll `r`, the model uses:

- Normal acceleration: `g cos(p) cos(r) - v w sin(r)`.
- Lateral tyre demand: `v w cos(r) + g cos(p) sin(r)`.
- Longitudinal gravity: `g sin(p)`.

At the frictionless design speed, the lateral tyre demand vanishes and normal
load is `g / cos(r)`. These relations follow the normal-force and friction
analysis in [OpenStax University Physics, centripetal force](https://openstax.org/books/university-physics-volume-1/pages/6-3-centripetal-force).
The existing arcade steering, powertrain and drift response remain part of the
game; this is not a full tyre, suspension or rollover simulator.

The existing four-wheel contact solver accepts the optional bank envelope up to
crossfall 0.7 (about 35 degrees). Its default ordinary-road envelope is unchanged,
and actual penetration/gap residuals remain observable. Race presentation and
camera mounts continue to consume that same accepted contact pose.

Only a course explicitly using `banked-road-v1` enters the new calculation.
Ordinary road travel and planetary trajectories retain their calibrated numeric
results. Current published-road qualification and portable graph validation
still reject unsupported high crossfall. The new mode is not yet admitted by
venue source packs or course publication; those contracts, versioned records,
source profiles, rendered driving and release acceptance remain required.
