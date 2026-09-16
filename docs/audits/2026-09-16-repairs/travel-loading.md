# Travel detail loading — 16 September 2026

Status: scheduling repair implemented; whole-app performance acceptance **not passed**.

## Causes addressed

The region-wide pavement worker was advanced by the 200 ms visibility-maintenance tick. At one acknowledged cell per tick, a 2,857-cell location had a scheduling floor of roughly 571 seconds, excluding compilation and pauses. Advancement now runs from the existing rendered-frame presentation callback. There is no new timer or worker. Only one request can be active, and advancement yields to world loading and nearby pavement publication. Material ownership scans are limited to twice per second instead of every frame; completion synchronizes immediately.

Nearby pavement replacement previously began at a fixed 128-world-unit boundary margin. It now estimates movement from consecutive samples and predicts a bounded forward window using the previous publication duration. A 30-unit/second driver with a 13-second build gets earlier scheduling than a stationary player. Per-axis prediction avoids treating a small sideways component as full forward speed. A location change, teleport or stale sample resets velocity. Existing atomic publication, collision construction and source eligibility remain intact.

This does not guarantee fast low-altitude flight can stay inside a 768-unit detail window during a slow rebuild. The bounded prediction preserves overlap; making it arbitrarily larger would increase compilation and memory. Detailed road/building construction remains a separate unresolved cost. RDT content thinning was not restored.

## Verification

42 focused Node tests passed: prefetch direction/bounds/arrival/teleport behavior, worker publication/cancellation, retained surfaces, frame cadence, overview single-flight work, loading/menu suppression and disposal. The actual overview worker is exercised on a multi-kilometre source fixture. These are component tests, not a visual or frame-time acceptance result.

A staging artifact built successfully: `5.2.0+1519f0618e08.e03693a162b06313.staging`. Its test loaded the screenshot location, 39.3018, -76.6188, in an owned browser tab at port 4193. The browser stopped responding to DOM inspection; a screenshot attempt timed out after 30 seconds and reset the automation connection. No completed scene screenshot, driving result, flight result, or usable memory/frame sample was obtained. Closing that owned tab also timed out. The temporary server was stopped; the user was asked to close the frozen test tab manually. The original port-4192 tab and server were left intact. Other user browser processes were not terminated.

The hang has not been attributed to the new scheduling changes: loading is guarded from these callbacks, but the point at which the page stopped responding could not be observed. Do not retry a heavy world load until the frozen test world is closed and the stall is investigated. Do not infer memory savings or improved flight from passing component tests. No production deployment or GitHub update occurred.
