# P13 — consistent space destinations and landing readouts

October 3, 2026. Development source only; production unchanged.

The finite deliverable connects the existing course, HUD and landing action. `space/navigation-presentation.js` is a read-only projection of the travel session, universe/docking target and physical spacecraft authorities. It owns no new journey, save or physics state.

## Behavior

- Docking and active deep-space targets take precedence over stale local landing selections. Otherwise the selected body course supplies the HUD and landing action. An unavailable selected body fails closed; it cannot silently land on a nearby different world.
- Physical flight reports body-relative altitude/distance and speed from the existing SI spacecraft state. Landing uses the existing 25 km, 120 m/s, 80 m/s sideways-speed, vertical-motion, subsystem and approach-phase rules. The HUD explains the blocking condition. Missing matching navigation displays unavailable metrics and blocks descent.
- Compressed Solar/deep-space approaches explicitly show display units and describe guided/survey descent. A scaled planet mesh no longer fabricates physical kilometres or a made-up speed conversion. Docking reports the same display-unit scale used by its existing controller.
- Unsupported deep-space targets cannot fall through to a Solar landing. Retained SI state does not override an active classic flight. Rejected physical descent does not replace the active starship with its pod.
- The selected destination is labeled Destination. Actual nearby-body state remains separate for the existing local flight/slow-zone calculations. Planet labels draw beneath the instruments; a newly blocked landing bar clears immediately.
- Existing Solar course selection, Wayfinder changes and manual takeover retain the current journey and spacecraft. No new course engine or campaign is introduced.

## Evidence

Five registered behavior contracts cover target priority, selected-body absence, retained SI state, exact classic boundary, physical altitude/speed/phase/target rules and unsupported-world landing rejection. The full registered suite passes **1,713 tests**, with zero failures/skips/todos. Source graph/syntax passes.

The actual assembled app journey passes course selection without teleporting, directional cue, manual takeover preserving journey/state, Wayfinder destination changes, phone layout and resource disposal; no page/graphics errors or failed local resources. Its older menu/default-course assertions were corrected to the current code; its destination-change wait now waits for the new destination rather than an already-visible course badge.

The prescribed client also launched the real app through a test-only iframe wrapper that queues the normal title action until initialization completes (the client’s fixed five-second click timeout was too short). Its flight state and screenshot are inspected. Local unsigned App Check/recaptcha messages remain documented harness limitations, not gameplay exceptions or service acceptance.

Six additional actual-app boundary cases freeze the live scene and deliberately inject boundary spacecraft states: 15,227 km altitude, excessive speed, valid approach, classic flight with retained SI state, missing physical navigation and expanded phone HUD. These are boundary fixtures, not claims of flying those distances. The far-altitude case shows a disabled landing button and an instruction to approach within 25 km; the action also rejects it.

Evidence: `output/verification/product-plan/phase13-*.log`, `space-navigation/`, `space-navigation-client-ready/` and `output/verification/current-space-journey/`. Inspect the final screenshots; a browser-sized phone viewport is not physical-device acceptance.

P13 closes after these development checks. P14 owns the completed field-mission/progression slice; P15 owns planetary art; P20 owns release/device acceptance. No production deployment or new real-world flight certification.
