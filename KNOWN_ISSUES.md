# Known Issues and How to Help

This file tracks current engineering gaps and contribution targets.

## High Priority

### 1. Road/Terrain Conformance Edge Cases

- Some cities still show local clipping, floating edges, or sharp drop-offs after reloads.
- Priority areas: steep terrain transitions, city-switch rebuild timing, road shoulder smoothing.

How to help:

- Reproduce in Baltimore, Monaco, and San Francisco.
- Capture before/after screenshots plus console logs.
- Propose isolated fixes in `js/terrain.js`, `js/world.js`, `js/ground.js`.

### 2. Building Grounding on Slopes

- Building base behavior can diverge between walk and drive mode updates.
- Need consistent terrain anchoring in all movement modes.

How to help:

- Validate mode-switch consistency.
- Add fixes that preserve footprint alignment.
- Avoid regressing flat-city behavior.

### 3. Space Flight Control Balance

- Earth launch and gravity balancing still need tuning for controllable ascent.
- Autopilot and return flows need more deterministic behavior.

How to help:

- Test launch from Earth and Moon.
- Propose parameter-level changes first (before structural rewrites).
- Include controlled test scenarios in PR description.

## Medium Priority

### 4. Performance Hotspots

- Dense-city loads can still spike CPU/GPU usage.
- Rebuild paths and per-frame geometry checks are major suspects.

How to help:

- Profile city load and mode switch paths.
- Propose throttling/caching improvements with measured impact.

### 5. ES Module Migration Tasks

- Module boot exists, but subsystems still rely on shared globals.
- Migration should preserve behavior while reducing coupling.

How to help:

- Migrate one subsystem at a time.
- Add compatibility shims where required.
- Document migration boundaries in `TECHNICAL_DOCS.md`.

### 6. Mobile and Touch Control Quirks

- Input responsiveness and HUD interactions vary across devices.
- Need better touch parity without breaking desktop controls.

How to help:

- Test on iOS/Android browsers.
- Report reproducible interaction conflicts.
- Submit focused fixes in `js/input.js`, `js/ui.js`, `styles.css`.

## Reporting Format

When reporting issues, include:

1. City/location used
2. Mode used (drive/walk/drone/space)
3. Steps to reproduce
4. Expected vs actual behavior
5. Browser + OS
6. Console errors
7. Screenshot or short video

Use issue templates in `.github/ISSUE_TEMPLATE/` for consistency.
