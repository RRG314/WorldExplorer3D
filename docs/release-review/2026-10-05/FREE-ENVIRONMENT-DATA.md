# Free public data replacement — tested staging build

The owner rejects paid data subscriptions. Open-Meteo and OpenSky have been removed from active runtime use. This replacement needs no paid data subscription or data API key. Existing Firebase hosting, compute and storage remain separate.

## Delivered data sources

| Data | Public source | Behavior |
| --- | --- | --- |
| Weather | MET Norway Locationforecast | Global hourly model; CC BY 4.0/NLOD, identified gateway, rounded coordinates, Expires/Last-Modified caching. |
| Waves/swell | PacIOOS WAVEWATCH III | Freely reusable model with explicit time/grid/units. |
| Wave fallback | NOAA/NCEP WW3 via NSF Unidata | Tested outage fallback for combined height, primary direction/period and wind-wave height; no invented separate swell. |
| Currents/temperature | HYCOM/FNMOC ESPC | Surface vectors converted to speed/toward-bearing and SST; no unverified sea-level datum. |
| Tides | Existing NOAA CO-OPS | Station observations/predictions retain time, datum and coverage. |
| Aircraft | ADSB.lol | Public ODbL observations; bounded radius/limit, timeout/cache, stale/malformed rejection, unknown measurements and labeled reference routes. |

The environmental gateway permits only bounded queries and fixed upstream URLs. App Check precedes cache/provider access. Shared cache, leases, request spacing, daily ceilings, cooldowns, body limits and timeouts protect providers. HTTP responses are private/no-store; rules deny client access to provider cache/control records. Failed or missing model cells remain unavailable.

Marine sources retain independent grid coordinates and valid times; current physics use current-source evidence. Weather selection rejects late replies that would overwrite a newer location. Live Earth distinguishes modeled, observed, predicted and reference information. Aircraft missing measurements stay unknown, and reference positions are labeled accurately. Attribution, catalog and privacy text were updated. The submarine HUD also received a measured weather-width repair, and packaging now counts real zero-byte emitted files correctly.

Primary sources reviewed October 5: [MET terms](https://api.met.no/doc/TermsOfService), [MET licence](https://docs.api.met.no/doc/License.html), [PacIOOS rights](https://pae-paha.pacioos.hawaii.edu/erddap/info/ww3_global/index.html), [NOAA reuse](https://www.weather.gov/disclaimer), [HYCOM public model catalog](https://tds.hycom.org/thredds/catalogs/GLBy0.08/latest.html?dataset=GLBy0.08-latest), [ADSB.lol public API/ODbL](https://www.adsb.lol/docs/open-data/api/). [OpenSky operational-use terms](https://opensky-network.org/about/terms-of-use) prompted replacing that integration as well.

## Hosted test build

[Open the staging test preview](https://we3d-staging-20260712--visual-review-1005-e5075bnu.web.app), expiring October 12. Build **5.4.0+078250e5e401.c530fbdb9b6a1cb4.staging**, commit `078250e5e401c3366c3a6e21b2bb09909bfc3938`, 605 content files. Both hosted manifests byte-match local `dist`.

Staging environmental gateway v1, aircraft v5 and place lookup v2 are ACTIVE. Cache TTL/index settings are deployed. Only the exact preview hostname was added to reCAPTCHA allowed domains; allow-all remains false.

Ordinary Chrome observations on this exact preview, without debug App Check:

- Baltimore weather: 63°F, 54% humidity, MET hourly model valid 23:00 UTC.
- Baltimore aircraft: 80 nearby ADSB.lol observed records, reported positions and measurements.
- Coral Sea: NOAA waves 1.1 m / 8.9 s, HYCOM SST 24.2°C, current 1.2 km/h toward 11°. Independent valid times and grid distances are visible. NOAA fallback handled an actual PacIOOS availability failure.
- Data & Licenses dialog contains the source/licence links. Screenshots and DOM captures saved and inspected. These are dated observations, not permanent expected values.

Evidence: `output/release-evidence/current/preview/`, `public-data-rights/` and `acceptance/weather-entitlement.json`. The historical receipt key accepts public-use rights and does not imply a paid subscription. This covers hosted public-data panels, not a full signed-in/shared-voyage acceptance journey.

## Verification

| Evidence | Result |
| --- | --- |
| Source/contracts | 1,931 passing contracts plus dependency/source/ownership/type/inventory/sensitivity checks. |
| Immutable candidate | All 90 gates attempted: 89 pass, performance fails. Original and subsequent reuse/repeat manifests retained. |
| Backend/security | All 3 groups pass, including real emulator transactions, HTTP, rules, multiplayer, chat and economy. |
| Public providers | Deployed weather/ocean/aircraft gateways and browser panels pass; source operations also exercise USGS and six Overture tiles. |
| UI failure states | Complete/partial/missing marine and aircraft client cases, weather response race and 9 real HUD layout cases pass; images inspected. |
| Save compatibility | Packaged upgrade → fallback read/write → candidate return passes all 3 stages; 64 legacy items/events, new records, unknown fields, ammo and unrelated pending account data retained. |

Prescribed game-client screenshots, ship observation/phone panels, underwater HUD, district activity and save-roundtrip screens were inspected. Emulated viewports are not physical-device evidence.

## Unresolved performance

The first complete run passed loading, coverage, scene/resource budgets and retained-memory limits across seven sustained travel windows and twelve reloads. Average FPS and clustered hitch limits failed. An owned open 3D preview consumed graphics resources during part of that run. After closing it, a clean repeat still showed 200/133/250 ms flight frames near 71 seconds and roughly 41 FPS initial driving. The repeat was stopped once failure reproduced; its unfinished sustained/retention portion is not marked passing.

A separate bounded CPU/GC/allocation trace captured incremental-GC start ~139 ms and major collection ~131 ms (~491 MB before / ~375 MB after collection). Instrumented frames reached 183/167 ms. Allocation paths include aircraft collision sweeps, map drawing, water updates, vegetation work and rendering. This justifies focused investigation but does not prove that one speculative optimization will fix it. No runtime source or budgets were changed to hide failure. Night/day and browser conditions must be controlled in comparisons.

Evidence under `output/verification/`: `performance-078-initial-with-preview/`, `performance-078-clean-repeat-partial/`, `performance-078-flight-diagnostic/`. The last is instrumented diagnosis, not acceptance. Demonstrate a bounded before/after repair before repeating the full immutable gate. Do not repeatedly run full matrices against an unchanged known blocker.

## Preservation and release boundary

Compatible fallback **5.4.0+37a12d117111.9496ab31100b61ae.staging**, 603 files, retained under `output/preserved-artifacts/`, branch `steven/free-data-fallback`. It keeps free data, HUD, save/control/backend and commerce repairs with earlier street visuals. Twelve exact visual-only differences are reviewed; the actual packaged save roundtrip passes. All earlier builds, four saved candidates, source history and real player data remain intact.

Production rechecked at 23:44 UTC remains **5.4.0+1532bdfbb5c1.319d215f60318297.production**. No GitHub push or production frontend change. Future coordinated release must include place lookup, the environmental gateway, updated aircraft backend and supporting configuration with accepted frontend bytes.

The free-data implementation is complete for this test build. **The product is not certified production-ready.** Performance remains failing; ordinary hosted sign-in/shared-voyage/save recovery, named physical iOS/Android and uncoached fresh-player acceptance remain unverified. Old notes, debug attestation and emulated viewports do not replace these checks.
