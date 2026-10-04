# Runtime dependency contract

The versioned inventory is `config/runtime-dependencies.json`. `npm run verify:dependencies` is part of `verify:pr`, which already runs the boundary TypeScript and ownership checks in both PR and stable CI. It also has its own candidate gate. This checks shipped source, not installed dependencies alone.

## Renderer delivery

Three.js remains 0.128.0. Eighteen unchanged upstream files, including the MIT license, are copied from the locked npm package into `app/vendor/three`: renderer, the three required loaders, twelve optional effects/shaders, and capture OrbitControls. Game boot, capture review and account admin now use the same-origin files. Regenerate with `npm run vendor:three`; changes require reviewing the inventory hashes. No renderer or shader upgrade occurred.

Classic script identity is canonicalized against the document URL. Relative and absolute callers share pending work and already loaded scripts. Failure removes the failed element and allows retry. This prevents capture review from loading a second renderer instance through a different URL spelling.

## Inventory and integrity

The checker parses executable URL literals in shipped JavaScript, HTML scripts, inline modules and import maps, including extensionless module URLs and `+esm` imports. It rejects URL or consumer drift. Arbitrarily computed strings are not a proof-complete static graph; review new loaders explicitly. Vendored code is checked separately rather than scanning upstream comments as application dependencies.

Thirty local vendor files have reviewed SHA-256 receipts. Three and Manifold must equal the locked installed package bytes. EXIF and QR bundles are regenerated in memory with the locked esbuild and compared byte for byte. Clipper 6.4.2 retains its upstream package integrity, source URL and license provenance. Root and Functions lockfiles plus resolved direct-package versions/integrities are inventoried. The shared Expedition server bundle is regenerated in memory from the current browser command authority and must equal the checked-in output. The verifier does not alter source or generated output.

Ten external executable entry URLs remain: Firebase 10.12.5 modules, satellite.js 5.0.0, pbf 3.2.1, vector-tile 1.3.1 and pmtiles 4.4.1. These are exact version URLs, but browser-enforced byte integrity and complete transitive CDN integrity are not claimed. Their owners/failure boundaries are recorded. Firebase imports can still prevent boot if that CDN fails; this is not an offline-first application. The Node Firebase test SDK intentionally differs from the browser SDK; assembled browser journeys and actual SDK/backend journeys remain distinct gates. No dependency update is hidden in this repair.

## Verification

The cold source browser fixture loads all seventeen renderer scripts with the old renderer CDNs blocked, renders the actual capture viewer, preserves a single THREE identity, and tests a missing local renderer followed by successful retry. `vendor-cold/report.json` passes; its capture image was inspected. Four loader behavior cases and two executable-inventory cases pass. Assembled driving and the complete PR chain are tracked in IMPLEMENTATION.md. Packaged manifest integrity and final release acceptance remain separate required checks.
