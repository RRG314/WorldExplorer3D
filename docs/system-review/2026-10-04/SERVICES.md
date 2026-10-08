# Provider service boundaries

These local repairs extend the operation contracts in `docs/product-audit/2026-10-01/OPERATIONS.md`. That document's historical availability checks are not a current service guarantee. No provider credential, entitlement, cloud deployment or pricing policy changed.

## Shared browser policy

`geospatial/provider-registry.js` owns the request, cache and recovery policy for the services below. At most eight queries are active per registry by default (configuration capped at sixteen), with 24–64 cached queries for these concrete services. Forced refresh joins an identical pending request. Each consumer owns its cancellation; the final departing consumer aborts the shared fetch. Ten/twelve-second service deadlines still end requests whose implementation ignores cancellation, and late results cannot enter the cache.

Typed HTTP failures preserve status before parsing error bodies. Error bodies are cancelled and not retained as diagnostic text. A 429 or 401/403 pauses that provider for at least sixty seconds. Three consecutive failures pause it for thirty seconds. Valid Retry-After seconds/HTTP dates can extend the wait, capped at one day. Recovery admits one probe; a failed probe renews the pause. A late response started before the limit cannot clear it. These are client request controls, not adversarial backend rate limits or cloud billing caps.

A valid dated cache remains available during a pause; expired entries are not silently returned as fresh. Every response retains its fetch/source observation/model validity time. A cached model, a live station observation and an authored simulation are different evidence. A forced refresh cannot bypass a cooldown. Cancellation does not count as provider failure.

## Concrete services

| Service / owner | Request, freshness and decoded response limits | Recovery / unavailable behavior |
| --- | --- | --- |
| Current forecast / operational feeds | GET; at most sixteen finite locations, one day; ten-minute cache; ten seconds; 5 MB JSON | 429 cooldown; no fabricated current weather. Open-Meteo commercial entitlement remains unverified and release-blocking for commercial use |
| Marine model / water evidence | GET; one finite location; fifteen-minute cache; ten seconds; 5 MB JSON | Cancels on world replacement/environment transition. Model identity/timestamp retained; unavailable does not become zero waves/tide |
| NOAA CO-OPS / marine selection | Bounded station ID; stations 24 h/12 s, observation 5 min/10 s, predictions 30 min/10 s; each 5 MB | Station-distance qualification retained. Model/stations/observation/prediction remain separate; cancelled selection cannot launch more station requests |
| CelesTrak / orbit model | Four allowlisted groups; two-hour cache; ten-second combined deadline; 3 MB text per group | Successful groups can remain with warnings. Each rate-limited group also cools down when another group succeeds |
| USGS earthquakes / operational feeds | Fixed day feed; five-minute cache; ten seconds; 5 MB JSON | Visible unavailable state/cooldown; no invented event |
| Aircraft / connected geospatial endpoint | Finite center; radius 20–200 km, at most 120 records; sixty-second cache; ten seconds; 5 MB JSON | Typed HTTP errors and bounded body. Position authority remains the provider's dated observation |
| Panoramax / KartaView / connected imagery endpoint | Normalized finite query, bounded radius and result count; fifteen-minute cache; 10/7 s; 5 MB JSON | Explicit provider selection and dated imagery; an error page cannot become an empty successful result |
| USGS geology → Macrostrat / geology owner | Exact finite point, at most sixteen mapped units; 24 h cache; ten-second combined deadline; 1 MiB per decoded body | Serial source fallback with source attribution/warning. Primary 429 has its own cooldown even while fallback succeeds. No mapped unit becomes an observed specimen |

Browser queries are GETs with bounded/normalized scalar fields, not user-upload bodies. `providerResponseError` and streaming `readBoundedJson/Text` implement the limits. The selected marine UI now expires its five-minute observation cache, coalesces pending same-point requests, clears obsolete selection presentation, retries failures, and cancels when the panel/layer closes or the document hides. Existing wave evidence never substitutes for transport/collision authority.

## Cost and expiry ownership

The application operator owns Firebase invocation/read/write/egress budgets, provider credentials and entitlements. Direct browser polling still consumes provider quotas. The existing shared geocoder uses App Check, a serial lease/cooldown, seven-day cache/TTL, 5,000 daily uncached request cap, eight results, 120-character search and 2 MB decoded response limit. Camera catalogue/media boundaries, shared-voyage workload calculations and TTL costs remain in OPERATIONS.md. No browser cache is claimed to be a server billing hard stop.

Overture dataset expiration is enforced by the existing `provider-release` candidate gate, and actual range decode/current feeds by `operations-providers-current.mjs`. Run them for the final candidate; do not infer current availability from an old receipt. Open-Meteo commercial account/endpoint configuration and physical/ordinary-hosted acceptance remain external requirements. Development service checks cannot approve those requirements.

## Verification scope

Twenty-two focused cases pass: shared cancellation, hung requests, dated cache, cross-location 429s, single recovery probe, late-response races, Retry-After forms, oversized streams, geology fallback, marine panel expiry/retry, and world evidence ownership. The actual browser fixture uses controlled HTTP responses with the production service modules. All five groups pass in `provider-outages-rerun/`: rate limit, recovery, browser fetch cancellation, source fallback and decoded-body limit; its image was inspected.

The first browser run incorrectly counted cancellation of the rejected 429 body as a marine abort. Its failure is retained; the corrected assertion specifically requires both delayed marine requests to abort and still reports all cancelled bodies. First full PR stopped at the context ownership guard: the new owner-published cancellation command needed explicit review. Only that lifecycle command is added to the allowlist, with its owner documented in OWNERSHIP.md. Full PR and actual Ocean/driving reruns follow separately.
