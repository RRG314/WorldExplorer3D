# Changelog

Notable changes to this project are documented in this file.

This project follows Semantic Versioning where possible.  
Entries reflect changes made relative to the most recent public release.

---

## [Unreleased]

### Changed
- Ongoing performance tuning during city and environment switches
- Incremental improvements to road and terrain alignment
- Refinements to environment transitions and cleanup logic

---

## [1.0.0]

### Changed
- Refactored project from a single large HTML/JS file into a modular JavaScript structure
  - Logic split into focused files for engine, world loading, physics, input, UI, map, terrain, sky, and state
  - Improved maintainability and extensibility
  - Enabled further feature development without increasing coupling

### Added
- Space flight mode allowing transition from Earth into space within a single session
- Solar system model with orbiting planets and visible orbital paths
- Clickable planets with informational panels
- Moon travel sequence including landing and return to Earth
- Moon surface exploration with environment-specific physics
- Support for walking and driving on the Moon
- Star field and constellation rendering integrated into sky system

### Fixed
- Multiple issues related to environment switching stability
- Camera and control handoff between Earth, space, and Moon modes
- Scene cleanup issues that caused objects to persist between location changes

### Known Issues
- Performance spikes may occur when switching cities or environments
- Occasional terrain and road alignment edge cases remain
- FPS may vary depending on hardware and browser
- Road elevation issues causing clipping or z-fighting in some areas
- Inconsistent grounding behavior when switching cities
---
Most recently updated on 02/06/24
