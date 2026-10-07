# 5.5.0 release preparation

The owner authorized GitHub, Pages, semantic versioning and production on October 7. Public prose and a curated gameplay gallery are prepared; production has not changed. Internal evidence is not attached to the public release body.

## Fresh dependency blockers

The first audit found [proxy-addr GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), fixed in 2.0.8, and [sharp GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), fixed in 0.35.5. Upstream advisories reviewed October 7. Targeted updates change only sharp, matching native/libvips packages, and backend proxy-addr. Direct package integrity and lock inventory are reviewed. The initial c4c90c3a package is superseded; it is retained, not deployed.

## Gallery and HUD

Actual Baltimore keyboard/drone controls retain 48,296 near buildings and 95% eligible regional coverage. Fresh ocean entry, normal daylight selection and jump/descent capture the deck and scuba journey. Published PNG files are unedited browser screenshots. Collapsed HUD overlap discovered during capture is repaired and checked at desktop and phone widths. No errors in the final marine capture. These screenshots do not claim new licensed ship art, broad wildlife or worldwide streaming.

## Verification boundary

Before the dependency patch, the full PR chain passes 2,102 contracts. New dependency and final candidate/backend results will be recorded separately. Production was rechecked as 5.4.0+1532bdfbb5c1.319d215f60318297.production; the older preview is 86fdc6e3. Production has 78 Functions, with getPlaceLookup and getEnvironmentalData absent. No performance or external acceptance result is assumed from the owner's deployment authorization.
