# Vehicle controls in the mobile website — October 25, 2026

The owner requires the same improved driving and opt-in motion controls in a
normal phone browser as in the Google Play edition. This verification adds
explicit web-distribution coverage to the released vehicle work. It does not
change the delivered game, native package, world data or transport admission.

The measured game is the immutable production package at source
`52d5f246f5add2c7eb6066fcb9bafc8d40105d61`. Controlled loopback runs override only
Firebase configuration and gateway delivery to real staging services, using a
temporary registered staging App Check credential. This is not ordinary
production attestation or a physical Android/iPhone performance qualification.

## Acceptance and evidence

Evidence: `output/research/mobile-vehicle-controls-2026-10-25/`.

- Chrome's ordinary website session has no Play distribution flag or referrer.
  Six focused checks pass with zero page/console errors: actual selected-world
  launch, independent multitouch steering/pedals and release, tilt/recenter/stale
  release, landscape and 360px portrait target/layout checks, and no-motion-API
  touch fallback. The real offline worker remains enabled. CDN codecs also import
  and perform a small PBF round trip. See `mobile-web-chromium/report.json`.
- WebKit's ordinary website completes nine checks: the same launch and layouts,
  permission denial from a trusted tap with active user activation, driving after
  denial, permission grant/tilt/recenter/stale release, unsupported motion fallback,
  real aircraft bank/pitch with manual override, and a rendered spacecraft with
  tilt and actual thrust/release. WebKit's second pedal is explicitly synthetic
  pointer input; its steering and other button gestures use real browser input.
  No physical sensor samples or native iOS prompt are claimed.
- The first WebKit tilt assertion failed because the desktop engine reports
  screen orientation 90 degrees for its portrait mobile viewport. The retained
  isolated diagnostic reproduces no steering from the incorrectly oriented
  sample and steering after projecting it into the engine's declared axes.
  Production already handles screen axes correctly; no game change was needed.
- The corrected full WebKit run completed all nine controls checks, but its
  **overall result remains failed** because of six resource errors. Do not
  relabel `mobile-web-webkit-v2/report.json` as an error-free full run.
- Three 503s came from the local preview gateway: once WebKit's real offline
  worker controls a page, Playwright page routes miss its data requests. The
  isolated gateway check proves real staging reverse lookup returns 200 before
  worker control, then the local preview's explicit emulator-required 503 after
  control. This was a verification routing defect, not an upstream outage.
- The corrected verifier routes only five known read gateways through the
  existing owned loopback server, pinned to staging. It forwards App Check only,
  retains real upstream authentication/status, refuses writes/redirects, bounds
  bodies and does not forward cookies. Seven focused proxy cases pass. The
  isolated WebKit gateway recheck returns 200 both before and after real worker
  control. No second whole-world WebKit run was needed for this tooling repair.
- The other three WebKit 404s are extra origin-relative CDN dependency requests.
  They reproduce without interception; the actual PBF, vector-tile and PMTiles
  imports succeed. A separate WebKit PBF round trip and empty-vector-tile
  parsing pass. Future runs retain these raw warnings and permit only the
  three diagnosed paths, conditional on successful actual codec checks. Any
  other resource failure, console error or page exception still fails the run.
- Actual car, portrait/landscape, permission, aircraft and space screenshots were
  opened and inspected. The prescribed game-client action choreography ran in
  the same existing world. Owned browsers and servers were closed. A deliberate missing-engine check
  also exits as failed and closes its owned server without loading a world.

Acceptance combines the completed WebKit gameplay checks with the isolated
routing/codec proofs and the clean Chrome run. It does not claim a clean full
WebKit rerun. The failed reports remain useful evidence. The temporary staging
credential is revoked and its private file removed after the final Chrome run.

## Reuse and limits

`npm run verify:mobile-web-controls` runs one engine and one selected world.
Set `WE3D_MOBILE_WEB_ENGINE` to `chromium` or `webkit`, `WE3D_VERIFY_ROOT` to the
frozen reviewed package, `WE3D_MOBILE_WEB_OUTPUT` to a fresh evidence folder, and
`WE3D_STAGING_APP_CHECK_FILE` to an existing owner-private temporary staging
credential. Revoke the credential afterward. No automatic full release sweep or
new Hosting build is part of this check.

Motion is optional and explicitly enabled. Cars use horizontal steering and
independent pedals, with optional tilt speed/service braking. Planes use tilt
bank/pitch and spacecraft yaw/pitch; flight speed remains on separate buttons.
Touch fallback covers missing/declined sensors. The same modules run outside the
Play wrapper, with no native Android sensor dependency.

Remaining device acceptance is physical sensor feel, browser chrome/safe-area
behavior and sustained performance on actual Android and iPhone hardware.
Desktop engine tests do not establish every historical browser/OS/GPU version.
The owner's Motorola startup/update acceptance predates these handling changes.

Protected PR133 merged normally as `9a529da79f319606627080ad5b896c6169c3ad20`
from `8958c418a455bfe8d00682e7dee7b0d95b96f5d2`. Required source/security checks
pass and reviewed/merged trees match. Production build manifest, game HTML and
mobile-control CSS still match the already qualified release bytes. See
`mobile-web-protected-release.json` and `mobile-web-live-identity.json`.
