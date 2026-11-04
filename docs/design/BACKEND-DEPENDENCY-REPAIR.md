# Backend dependency repair

Stage 6b closes locally on November 3, 2026. The root audit is unchanged at zero findings; fresh locked Functions and racing-service installs now also report zero production findings. This is dependency and component evidence, not a live-service acceptance claim.

| Boundary | Repair | Evidence |
| --- | --- | --- |
| Functions query serialization | Pin the existing `qs` override to 6.16.1, fixing [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) | The installed 6.16.0 reproduces the hostile comma-array exception; both encoding modes pass after repair. All six request-parser cases pass, including the existing compressed-body and HTTP checks. |
| Racing SDK transitive cleanup | Scope a Rimraf 6.1.4 override to `@google-cloud/firestore-api`. Its Glob 14.0.3 and Minimatch 11.0.4 repair [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | The actual SDK-resolved async cleanup removes only an owned temporary child and preserves its sibling sentinel. All twelve racing-service cases pass. |

The existing Firebase SDK and WebSocket direct versions remain unchanged. A normal audit fix did not repair the pinned SDK subtree. The scoped override retains its used async directory API and supports the existing pinned Node 22.23.4 runtime. Both backends were installed using `npm ci`; their installed dependency inventories complete successfully. Optional native acceleration modules are not required by the racing WebSocket service.

SDK export discovery loads 104 Functions exports and the racing Firestore API with public staging project/bucket settings. No exported handler was invoked. The first isolated discovery attempt lacked the required storage bucket; its failure is retained rather than attributed to production configuration.

The existing racing-engine generator also exposed stale outputs from the earlier canonical speed-unit import repair. Regenerating its two existing tracked outputs removes duplicate equivalent helpers; no physics formula, record version or race rule changes. Its in-memory freshness check and the affected service suite pass afterward.

Local evidence is indexed in `output/verification/coherence-dependencies-20261103/RECEIPT.md`. It retains before/after audits, failed repair/probe attempts, locked installs, dependency inventories and component/build logs. Stage 7 still requires full CI, immutable-candidate runtime checks, review, GitHub handoff and recorded deployment identity. Earlier accepted career and venue procedures were not repeated.
