# Free environmental data replacement

The owner explicitly rejects paid data subscriptions. Open-Meteo is removed from active runtime use. No subscription or paid data key is required for this integration. Existing Firebase hosting/Functions/Firestore infrastructure remains in use.

## Implementation

- MET Norway Locationforecast: global hourly numerical weather, CC BY 4.0. Proxy identifies the application, rounds coordinates, honors Expires and exact Last-Modified, shares cache across instances, and caps provider request starts and daily use.
- PacIOOS WAVEWATCH III: global waves/swell, free use and redistribution. A real dataset-unavailable response during testing led to an implemented NOAA / NCEP WAVEWATCH III fallback via NSF Unidata. The fallback supplies combined waves, primary direction/period and wind-wave height; it does not fabricate separate swell partitions.
- HYCOM / FNMOC ESPC: freely available surface current vectors and sea temperature. Current vectors become speed/toward-bearing. Model sea-surface elevation is not relabeled as MSL without a verified datum.
- NOAA CO-OPS observations and tide predictions retain their existing station/time/datum authority.
- Each ocean source retains its own grid coordinates and valid time. Current physics now use current-source evidence rather than wave-source distance/time. Missing weather numbers and unavailable model cells remain null.
- Live Earth displays unavailable data instead of false zero values or perpetual loading, counts successful forecasts, and guards against a late reply overwriting a newer location selection.
- `getEnvironmentalData` admits only bounded coordinates/kinds and fixed upstream endpoints. App Check precedes all provider/cache access. Clients cannot read/write shared cache or provider controls. The HTTP response is private/no-store; the server controls public-model caching. Provider failures and 429 cooldowns cannot publish empty success as an invented observation.

## Evidence and status

Focused backend/frontend contracts cover units, malformed/stale data, missing values, cache expiry and 304, coalescing, cross-instance exclusion, 429, response size, unauthorized requests, partial batches, real fallback selection, and location races. The final 1,926-contract PR run and dependency/source/ownership/type/inventory/sensitivity checks pass. This is source/component evidence, separate from immutable browser acceptance.

Actual Firestore emulator transactions and security rules pass. Actual Functions HTTP retrieves live weather, waves, currents and temperature. The staging `getEnvironmentalData` function and cache TTL/index settings are deployed. Real browser UI calls through registered staging debug App Check pass, including rejected unauthenticated requests. This is not ordinary production attestation or a physical-phone observation.

Screenshots inspected: `output/verification/environment-data-staging/` and `output/verification/environment-panel-client/`. The prescribed game client exercises complete, partial and absent marine source responses through the real panel renderer. `output/verification/weather-location-ui/` verifies actual DOM location switching without a late forecast overwrite.

Primary sources: [MET terms](https://api.met.no/doc/TermsOfService), [MET licence](https://docs.api.met.no/doc/License.html), [PacIOOS dataset rights](https://pae-paha.pacioos.hawaii.edu/erddap/info/ww3_global/index.html), [NOAA reuse](https://www.weather.gov/disclaimer), [HYCOM current model rights](https://tds.hycom.org/thredds/catalogs/GLBy0.08/latest.html?dataset=GLBy0.08-latest).

## Release boundary

Initial test preview: `https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app`. Its original faf24c3a artifact predates this replacement; update and verify its manifest before saying the replacement is available there. Production remains `1532bdfbb5c1`. No GitHub push or production frontend change was made.

The broader review found 61 commits / 595 changed files since production, including 262 runtime files before this replacement. Production lacks `getPlaceLookup`; both that dependency and the new environmental gateway must be included in a coordinated future release. Prior architecture acceptance certifies the preserved e7fd artifact, not new source. Full new candidate/backend acceptance and save-compatible rollback must match the final artifact. Named physical iOS/Android, uncoached-player and ordinary hosted acceptance cannot be inferred from fixtures or debug attestation.

Packaging exposed an existing manifest count defect for zero-byte emitted chunks. The bundler output inventory now counts those real files; the corrected 603-file fallback passes artifact integrity. Fallback source `0e4c8d42` preserves the free-data gateway, all save/control/backend repairs and commerce performance while using earlier street visuals. Candidate/fallback runtime differences are exactly twelve reviewed transient rendering/scene files. Final packaged roundtrip is pending.

## Free aircraft provider

The fresh provider review also found that OpenSky requires a written licence for operational API use. Active runtime access and attribution are replaced with the existing ADSB.lol public API under ODbL 1.0. Direct queries retain the bounded radius, limit, timeout and 60-second cache. Malformed/stale payloads and invalid coordinates are rejected; missing measurements and observation times remain unknown in the actual panel. Reference transport routes remain explicitly labeled when live coverage is absent. No paid aircraft account is needed. Primary sources: [OpenSky operational-use terms](https://opensky-network.org/about/terms-of-use), [ADSB.lol public API and ODbL licence](https://www.adsb.lol/docs/open-data/api/).
