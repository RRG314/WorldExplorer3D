# Race disciplines and rule boundaries

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Start with a sprint/circuit + personal time trial on qualified mapped roads. They need ordered course progression,correct direction,lap completion,course/build version and server time. Closed races use a clear event traffic/pedestrian policy; free-roam traffic remains unchanged outside them.

Drag requires a start reaction,straight/grade qualification,lane validation and finish beam; checkpoint reuse alone is insufficient. Drift requires sustained lateral slip with speed/angle bounds and no wall-farming. Rally/hill climb require distinct surface/grade rules and recovery penalties. Endurance adds sustained resource/repair policy. Elimination depends on authoritative ordering at timed cutoffs. Championships aggregate verified event results with idempotent payouts. These dependencies are not implemented as disguised generic checkpoint modes.

Race recovery may return to a validated checkpoint with penalty and invalidates personal record eligibility where appropriate. Garage recall,world travel,changing assists/parts or teleporting during a timed run must cancel or invalidate it. Ordinary driving still permits existing recovery. Collision-free ghosting may be an explicit competitive mode; it cannot be used to hide ordinary overlapping traffic.
