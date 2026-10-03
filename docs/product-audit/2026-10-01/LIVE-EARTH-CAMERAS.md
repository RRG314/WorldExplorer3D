# Live Earth cameras — accepted product expansion

October 2, 2026. The owner requested extensive live and still camera viewing inspired by WorldCam, integrated into World Explorer. The October 3 continuation implements the first regional still-image slice described below; broader coverage and live video remain planned. Keep the current sequential foundation/ocean/space work; add the camera slice to the Earth track and its provider acceptance to P19/P20.

## Reference and current gap

Inspected [WorldCam](https://worldcam.io/) and its [coverage and sources](https://worldcam.io/coverage) in a browser today. The reference provides a camera globe, camera walls and separate catalogue/availability metrics. Its coverage page distinguishes publisher-listed live streams from actually checked and recently playing feeds. Adopt those useful distinctions. Do not equate a large catalogue with equally extensive working video coverage. No reuse rights to WorldCam's catalogue, imagery or backend were established by this inspection.

World Explorer currently has mapped ALPR positions in `app/js/live-earth/registry.js` and a user-device capture camera in `app/js/reality-capture/live-camera.js`. Neither is a public webcam viewer. Add a separate public-camera layer to the existing Live Earth registry/provider and map-selection architecture. Do not repurpose ALPR pins as imaginary video feeds.

## Player experience and coherence

1. Open **Live Earth → Cameras**, browse clustered globe/map pins, search a place or filter nearby views, country, category, still/live and availability. The default location is the selected world location, not unsolicited device tracking.
2. Select a camera to see its name, coordinates, publisher, imagery mode, capture time (or unknown), last successful check and attribution. Play a supported stream or display a periodically refreshed still. A still is never labeled live video. Errors retain an explicit last-good timestamp rather than an apparently live frozen image.
3. Browse next/previous cameras in the current area, expand a view or create a small camera wall. Start with one active stream; test a bounded multi-view limit before enabling more. Stop playback/refresh when hidden or closed.
4. Choose **Explore here** to hand the same coordinates to the existing location validator and launch flow. In-world map/fieldwork may offer **View nearby cameras**. Watching a camera is remote observation, not proof the player physically visited a location or earned a field sample.
5. Save camera references and optional observation notes in the Journal using the P06 persistence contract. Save provider/camera IDs and capture-time metadata, not expiring URLs. Retain imagery only where the source explicitly permits it. Public-camera observation does not require a new game mode, an account wall for basic browsing, or a mandatory objective.

Scope is public place, weather, traffic, coast, harbour, nature and landmark viewing. Recording services, face identification and background person tracking are not needed for this exploration feature.

## Coverage strategy and verified research

Use a provider adapter catalogue with deduplication and coverage reporting. Combine official regional sources with a licensed broad-coverage provider where terms and cost fit. Review each source's rights directly; another aggregator's attribution is a discovery lead, not our permission.

- [Windy Webcams API documentation](https://api.windy.com/webcams/docs) documents geographic search, map clusters, preview images and players. Image URLs expire, so persist camera IDs and refresh URLs. This is a candidate for broad coverage, not a purchased/configured dependency.
- [Windy terms](https://api.windy.com/webcams/terms) require API-provided image URLs, associated linking and attribution; respect original proportions and provider load limits. Review the linked full service terms and selected plan before commitment. No subscription or key was obtained.
- [Fintraffic Digitraffic road-camera documentation](https://www.digitraffic.fi/en/road-traffic/) supplies station/preset metadata, images and collection-status fields. It is a concrete candidate for a regional still-image adapter and freshness/outage testing. Validate current source terms and throttling before activation.
- WorldCam's source list identifies Maryland CHART, Caltrans, TfL, USGS, NPS and other public sources as useful next research leads. Each requires direct provider verification; no blanket right to embed or proxy is assumed.

Do not promise worldwide parity from a handful of hand-picked cameras. Publish per-country/provider totals for indexed cameras, recent reachable imagery and recently verified live playback, including coverage gaps and verification times. Targets should follow a measured source inventory and costs, not copied competitor headline counts.

## Technical ownership and data contract

One public-camera catalogue owner normalizes `providerId`, `cameraId`, location/accuracy, view direction when known, category, publisher URL, attribution, terms/rights reference, image/stream capabilities, capture timestamp, check timestamp, health and geographic coverage. Media URLs are short-lived resolution results, not durable camera identity. Distinguish a publisher's live flag, successful manifest fetch and successful playback.

Provider adapters fetch only supported sources with per-provider timeouts, caching/rate budgets, bounded retries and cancellation. Server-held credentials stay outside shipped JavaScript. Any media proxy is restricted to approved source hosts with redirect checks, size/time limits and no private-network access; it is not an arbitrary URL fetcher. Honor browser CORS/embedding restrictions and offer the publisher link when embedding is unavailable.

Map queries use viewport bounds, antimeridian handling, clustering and pagination. A selected-camera request cannot overwrite a newer selection. Player teardown releases media elements, decoders, audio, timers and network requests. Keep the game frame loop independent of image refresh. Isolate provider HTML/players; require HTTPS and explicit allowed embed origins. Errors include unsupported format, offline source, stale image, unavailable timestamp, expired URL, geographic restriction and rate limit.

## Delivery and acceptance

| Step | Concrete completion requirement |
| --- | --- |
| C01 · inventory/rights | Direct-source inventory, verified terms/attribution, costs and coverage; usable access for at least one broad/regional source. No placeholder live counts. |
| C02 · catalogue/backend | Versioned contract, provider adapters, stable IDs, deduplication, bounds/pagination, health and freshness; source failures cannot poison the catalogue. |
| C03 · complete player slice | Existing Live Earth map → camera → real imagery → next camera → Explore here; loading/error/empty/retry states, attribution and correct still/live labels; actual provider and browser tests. |
| C04 · breadth and multi-view | Add independently verified providers and publish actual coverage; bounded camera wall, favourites/Journal references, keyboard/touch/screen-reader controls; stop hidden playback. |
| C05 · release | Physical-phone and desktop playback, slow/offline/expired-token tests, repeated open/close memory/network checks, camera-source removal workflow and measured API/media operating cost. |

Schedule C01 as research alongside current work; implement C02–C05 after P06 and alongside P16's Earth slice. Do not interrupt P07–P15's agreed ocean/space dependencies. P19 owns provider operations; P20 owns release acceptance. This feature must reach a complete actual-imagery slice before its public capability status changes from Planned.


## October 3 — C01–C03 regional implementation

The first usable source is **Fintraffic Digitraffic, Finland**. Fresh direct reads verified its [CC BY 4.0 terms](https://www.digitraffic.fi/en/terms-of-service/), [camera endpoints and update cadence](https://www.digitraffic.fi/en/road-traffic/), and [API instructions](https://www.digitraffic.fi/en/support/instructions/). The metadata API allows browser CORS and needs no paid subscription or credential. The source is regional still imagery, not live video. WorldCam data is not scraped or reused.

Read-only inventory on October 3 returned 810 station entries; the app admitted 809 collecting, coordinate-valid sites. Those counts are a dated observation, not a permanent promise. Example station C01503 supplied per-view capture timestamps; the publisher image endpoint returned JPEG HTTP 200. The actual browser later displayed images successfully. Catalogue metadata, last check and image capture have separate meanings.

Implementation uses `public-camera-service.js` as the versioned regional catalogue/detail adapter. IDs and image hosts are validated; inactive presets and malformed coordinates are excluded. Catalogue and detail caches, a 12-second deadline, request pacing, 3 MB response cap and bounded detail cache keep requests controlled. There is no arbitrary media proxy, secret, cloud Function, image archive or new progress store. Compression is browser-managed; the non-personal Digitraffic-User header identifies the app.

The existing Live Earth interface has a Public Cameras category, clustered map markers, place/ID search, bounded pages, actual camera images, capture/availability wording, previous/next view, next camera, source/license links, full-size publisher image link, map focus and Explore here. Single-view sites disable redundant controls. Finland coverage is explicit. Selecting a camera focuses its own coordinates. Watching remotely grants no gameplay visit or reward. Closing, leaving the layer or hiding the page cancels metadata work, clears the image and stops the refresh timer. Late responses cannot replace a newer selection. Still refresh is ten minutes while visible; unknown and stale capture times are explicit. A failed image is hidden and labeled unavailable; retry recovers.

### Verification status

Seven registered adapter/lifecycle tests pass. Actual-browser acceptance has already covered real provider catalogue/images, multiple views, a deliberately failed image and retry, phone inspection, source attribution and teardown. The prescribed game client screenshot/state is inspected; unsigned local App Check console warnings remain a harness limitation. Final acceptance clicked an actual map cluster (9 sites from 290 displayed clusters), recovered a deliberately failed image, and verified stopped timers/requests/image source on close. All 1,736 registered tests and source checks pass. C01–C03 are development-complete for this regional still-image source.

The Explore here test verifies coordinates handed to the **existing** startHere path with that callback captured; it does not claim an actual Finland world load. P16's Earth journey acceptance owns the complete loaded-world path. The separately inspected full-size image remains on the publisher's site; the app does not record or re-host imagery.

C04 (additional independently verified sources, favourites/Journal and camera wall) and C05/P20 physical-device/release acceptance remain open. The surrounding Earth district in P16 remains open. This concrete regional camera slice should not expand indefinitely into worldwide parity before it can be accepted.
