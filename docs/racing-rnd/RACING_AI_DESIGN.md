# Racing AI

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Existing ambient traffic follows directed edges,signals and demand; it is not a racing opponent. Vehicle-length following and swept chassis constraints improve ordinary streets but do not establish race-rule compliance.

A racing driver should consume the same controller actions as a player: bounded target speed from upcoming curvature/width/grade,braking distance from current vehicle grip,lookahead steering and traction-limited throttle. Route progress belongs to the same race rules. No pose animation directly along a racing line. Plan overtaking only within verified road corridor;yield rather than overlap;recover through the same penalty command. Difficulty changes anticipation,errors and aggression within vehicle limits,not hidden speed multipliers or teleporting rubber bands.

Use existing fixed-step/frame owner. Bound near opponents and lower distant decision frequency while retaining rule progress and continuous collision. Prototype one opponent and compare completion,corner speed,contacts,reverse/recovery and resource release before adding personalities. No credible AI opponent is claimed by merely reusing ambient traffic.
