# 5.3 release status

Updated September 28, 2026. **Deployed to production with known performance limits.**

The live frontend is `5.3.0+2839df5d6bbe.114f3c83341f2200.production`,
from source `2839df5d6bbed9f8dfa4b89e379ba2e026cab438`.
Documentation updates after that commit do not change the deployed game.

## Verification

- The exact candidate passed 56 functional, source, package and browser gates.
  Coverage includes connected journeys, ship research, space destinations,
  fishing, commerce, interiors, controls, mobile layouts and capture workflows.
- All 13 stages of the isolated backend verification passed. These include
  room admission, shared state and authorization checks.
- A new two-client weekly-city journey used the normal join buttons to enter
  Chicago, load both worlds and verify shared public-room membership and
  visible player presence. Its screenshots were inspected. This used isolated
  Auth, Firestore, Storage and Functions services, not production player accounts.
- Production promotion preserved every tested non-configuration asset. Both
  manifests and all 194 JavaScript/entry files matched on the live domain.
- Live sign-in and multiplayer panels opened. Public-room browsing returned
  room metadata and the weekly button identified Chicago. Joining correctly
  requires sign-in; no new production accounts or test rooms were created.
- A live Moon entry rendered successfully and returned to Main Menu.
- Room, shared-vehicle, combat and expedition endpoints rejected unauthenticated
  requests. This verifies their live authentication boundary, not all signed-in
  behavior on a real network.
- The server action-cooldown update is deployed. Its existing runtime settings
  and IAM bindings were compared before and after and remained unchanged.
  Firestore rules and indexes did not change in this release.
- A rollback copy of the preceding live frontend was retained before promotion.

## Remaining limits

The performance gate **did not pass**. In the final dense-city desktop run,
walking/driving averaged roughly 41–42 FPS against a 43.65 FPS threshold;
peak sampled heap was 1.11 GiB against 1 GiB; aircraft activation took 2,012 ms
against 1,000 ms. Other performance checks passed, including world coverage,
resource counts, teardown, retention and browser errors. Thresholds and failed
receipts were preserved.

Repeated-session renderer footprints still reached approximately 3.8–3.9 GiB.
Those process measurements are distinct from JavaScript heap or resident RAM.
Mobile emulation passed; physical-phone responsiveness remains unverified.
The owner authorized deployment while accepting the remaining rendering-memory
tradeoff. These findings must not be described as a fully green performance
certification or an exhaustive guarantee that every feature is defect-free.

See [release notes](../RELEASE_NOTES_5.3.0.md),
[what changed](RELEASE_COMPARISON_5.3.md),
[source identities](RELEASE_SOURCE_OF_TRUTH.md) and
[verification terminology](TEST-AND-RELEASE-EVIDENCE.md).
