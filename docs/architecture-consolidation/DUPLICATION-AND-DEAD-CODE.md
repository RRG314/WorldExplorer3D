# Duplication and safe cleanup decisions

| Candidate | Reachability / evidence | Decision |
| --- | --- | --- |
| Wallet v2 projection and legacy ×2000 conversion in two connected owners | Both active: shops use connected wallet; property can subscribe to wallet or read its account document when no shared wallet is provided. | MERGE projection into `economy/wallet-snapshot.js`; retain both compatible subscription paths. Actual-module tests cover current and legacy balances. No account data transformed. |
| Repeated ad-hoc request account guards | Condition API pins UID; wallet/property omitted it; common HTTP client checked it only before first send. Fourteen failing characterization cases prove the gap. | INTEGRATE into the existing protected Function transport; domain owners supply captured UID and retain local subscription guards. No second transport service. |
| Tunnel roof bound query in obstruction builder | Surface compiler imported one pure query; builder imported structure façade, which imported the compiler. Literal graph proves cycle. | MOVE unchanged query to existing envelope owner; REEXPORT compatibility entry. No old caller breaks and no geometry redesign. |
| `procedural-random.js` and `rdt.js` | Current imports still depend on the compatibility seed name; both use the same identity engine. | KEEP adapter. A similar filename is not an independent generator or dead code. |
| Root `ocean.js`/`space.js`/`boat-mode.js` and directory runtimes | Root modules are façades/lazy entrypoints used by app/session boot; subdirectories hold domain logic. | KEEP. Do not remove façades by counting only literal runtime imports. |
| Generated Expedition server engine | Generated from browser command authority; dependency gate verifies byte parity. Server imports the generated engine. | KEEP generation pipeline; never manually deduplicate or edit generated code. |
| Old transport/terrain fixtures and experiments | Verification scripts may read them as before-state or regression fixtures; they are not necessarily production imports. | KEEP pending explicit reachability audit across script strings, CI and packaging. No cleanup inferred from age. |
| Account wallet vs local sandbox credits | Different trust/persistence domains: server transactions versus device-local free play. | KEEP separate authoritative stores; consolidate presentation/rules only where equivalent. |
| Personal voyage v1/v2/v3 and shared crew voyage | Existing saves and rollback readers require old versions; shared mode has different membership/leases. | KEEP compatibility readers and distinct authority; no key removal, migration or merge. |
| Broad context and optional methods | Many dynamic boot/runtime consumers; no safe wholesale deletion proof. | DEFER bulk extraction; migrate named critical boundaries after adversarial tests. |
| Old architecture documents calling themselves “current” | September snapshots contradict latest code, checks and release state. | Mark historical and link current consolidation evidence; retain dated evidence in place. |
| Models, textures, deployment artifacts | Dynamic catalog strings, runtime quality tiers, rollback builds and external attribution matter. | NO DELETION. No asset rights/reachability proof established. Four retained packages and current production dist preserved. |

Zero gameplay modules, assets, backups, compatibility save readers or external capabilities were deleted. This is intentional: static unreferenced exports are candidates, not proof. A future deletion requires import/require, dynamic string, HTML, worker, catalog, feature-flag, test fixture, migration and external-consumer checks plus parity on the real user journey.

## Follow-up decisions

- Commerce's superseded unreachable local grant/reconcile helpers were removed
  only after their callers migrated to one delivery/recovery path. Wallet and
  inventory remain separate authorities; no old save readers were removed.
- The water-mask CPU-canvas experiment was rejected after pixel differences.
  The original rasterizer remains the owner; the worker only reads its bitmap.
- The proposed capture-index shortcut is not safe yet: current contracts allow
  in-place coordinate/footprint/identity edits. Reusing bounds solely by array
  identity or world generation would miss those edits. Aircraft colliders live
  in a separate dynamic list, so movement there is not evidence to change this
  index. No query, capture or collision capability was removed.
- Regional GPU uploads remain tied to the pinned Three.js 0.128 renderer. It has
  no `compileAsync`; a modern API call or blanket background prewarm is not a
  verified solution. Establish a measured upload budget and cancellation parity
  before changing its publication lifecycle.
