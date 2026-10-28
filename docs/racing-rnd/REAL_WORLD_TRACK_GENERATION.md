# Real-world course validation

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Inputs: canonical transport records and directed `living-world/navigation-graphs.js`,world address,source feature IDs,road layer/structure,width,elevation and publication identity. Do not build an independent road mesh or edit OpenStreetMap. Finite selected-area coverage sets the maximum course extent; optional regional extension is not unlimited world streaming.

A valid route requires continuous directed edges,legal transitions,vehicle-width/height and turning clearance,usable collision/support and no blocked world geometry. A connector through a wall or a bridge at a different layer is not valid because itsX/Z endpoints are close. Underwater subgrade is allowed only on a published tunnel. A terrain-height clamp must not erase it.

Course gates follow the sampled road deck,with direction and sequence. Persist geographic vertices plus source IDs and coordinate-frame metadata; never store only transient renderX/Z. Version/hash every geometry/rule/build change. Start grids reserve full oriented chassis footprints clear of buildings,water and traffic. A test drive must traverse the course before publication; editing invalidates old validation and record keys.

Current graph/support can supply inputs, but race-grade connectivity,clearance certification and user publication are not yet accepted. A missing road/deadline must produce a clear rejection,not a forced reload or fabricated race track.
