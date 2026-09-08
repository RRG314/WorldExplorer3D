# Camera and world consistency correction — local evidence

Production remains on the prior Hosting release. This correction has not been
deployed, restored, or pushed to the public branches.

## Corrected causes

- Chase terrain/road probes applied the camera's full near-plane clearance at
  the low look-at anchor. Flat ground falsely shortened the boom. Clearance now
  tapers toward that anchor; actual hills and endpoint clearance remain tested.
- Mapped building massing mixed the session/location seed into canonical feature
  identity. Near and far massing now derive their variation from feature identity.
- Facade district variation used origin-relative X/Z. It now uses the building's
  geographic district, falling back to stable identity without geographic data.
- Approved exterior lookup ran only at initial world load and used the walker
  even while driving. A single kernel-owned movement trigger now uses the active
  actor, refreshes after 80 world units with a 10-second minimum interval, avoids
  concurrent movement-triggered lookups, and deduplicates the 60 target IDs.
  Existing models remain visible during lookup; unchanged models are reused.

## Execution and visual evidence

- North Calvert Street, 1280×505: actual C-key chase/cabin/overhead/chase cycle.
  Final chase position differs by **0** from the historical 10-behind/5-above
  position in the same scene. Rear BMW and actual cabin screenshots inspected.
- Desktop and Android-emulated house neighborhood: **100 collider records match
  exactly**, including footprints, centers, wall heights and foundation heights.
  Android was explicitly detected by the application, not just a narrow viewport.
- Approved public house derivative: local GLB matches production Storage MD5;
  985,840 bytes, four photo walls. Actual renderer attachment succeeds on desktop
  and Android emulation; both fixed-camera screenshots inspected.
- Focused tests cover ground clearance, real hillside obstruction, camera near
  plane restoration, stable session-independent identity, facade origin changes,
  photo-wall height alignment, and bounded capture refresh.

## Evidence limits / remaining release checks

- Localhost is not production App Check: local rendering of the approved public
  derivative is **not** proof of production API access. The rendering test exposes
  the real attachment function only in its disposable browser and uses a local,
  byte-verified artifact. No access policy or backend authentication was weakened.
- Android emulation is not a physical Android acceptance test.
- One generic dense-city action run timed out at gameplay startup after geometry
  completion. It is recorded as a failed run, not silently counted as a pass.
- Overture tile fragments can produce multiple collider records for one source
  identity. Both tested devices have the same records, but this is not proof that
  all multipart/tile-boundary cases are resolved. No buildings were removed to
  conceal that issue.
- Camera/world evidence is location-specific. It does not replace bridge/tunnel
  regression checks or final production-configured acceptance.

Local artifacts: `output/verification/chase-wide-corrected`,
`output/verification/approved-house-desktop`,
`output/verification/approved-house-android`.
