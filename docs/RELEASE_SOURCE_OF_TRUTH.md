# Release source identities

## Current observation — October 7, 2026

The production frontend remains **5.4.0+1532bdfbb5c1.319d215f60318297.production**,
source **1532bdfbb5c11e002d278b058d1ebdba88384f60**. The next compatible release is
5.5.0 on `steven/visual-quality`. Stable, Pages and the public release remain unpromoted.

The local and hosted preview candidate is `5.5.0+4dd2e37c69a9.e85c0302553a7fda.staging`,
source `4dd2e37c69a9ccd0a946d3bf2af984faaaadb5a5`. Its 615 delivered file hashes are
identical to the owner-tested `135e3895` preview and the `316ba33d` game payload.
Subsequent changes repair release verification. The packaged-world preflight
passes 29 checks, and the current backend matrix passes all three gates.
The complete candidate and remaining external acceptance are pending.

Production has 80 ACTIVE Functions. Place/environmental data version 1 and
aircraft version 5 were deployed first, preserving all 11 existing parameters.
An audit of the actual downloaded production source then identified 77 older
packages. Those have now been updated; all 80 deployed packages match all 36
tracked backend code/configuration files. The tested Firestore ocean-presence
additions are live; Storage rules are unchanged. Two IAM lookup errors reported
by the CLI were reconciled against already-correct live permissions.

Actual production protocol checks pass for shared marine authority, ocean
presence, condition-save idempotency and legacy compatibility, discovery receipts
and account isolation. Their temporary accounts and private fixtures were removed
and verified absent. This is hosted HTTP/rules evidence, not an ordinary complete
player journey. Staging aircraft version 6 is ACTIVE. Provider-cache expiration
policies are ACTIVE as of 22:06 UTC. The exact live frontend's preserved
`release-54-1532` channel retains Hosting version `f8a50a498fe78123` through
November 6 at 22:26:58 UTC; both manifest bytes match live. This is separate
from the reviewed save-compatible 37a fallback.

The current package's three-stage save/fallback/return and packaged live weather
and ocean UI checks pass. Public-use rights, deployed provider-source identity and
attribution are reviewed. The 91-gate aggregate candidate run is in progress;
remaining ordinary-hosted, physical-device and fresh-player evidence stays open.

See [current state](../CURRENT-STATE.md) and
[finite release gates](product-audit/2026-10-01/RELEASE-ACCEPTANCE.md).

## Historical September 28 receipt

Verified September 28, 2026 from hosted manifests and deployment results.
A version label or URL parameter alone does not identify deployed code.

| Reference | Identity |
| --- | --- |
| Live production source | `2839df5d6bbed9f8dfa4b89e379ba2e026cab438` |
| Live production build | `5.3.0+2839df5d6bbe.114f3c83341f2200.production` |
| Tested staging build | `5.3.0+2839df5d6bbe.7492cbb92de5e631.staging` |
| Previous live source | `bbe6502228e369fe2a15dc6a177f5d83948584c3` |
| Previous live build | `5.3.0+bbe6502228e3.8044052b36c00b4a.production` |
| Production project | `worldexplorer3d-d9b83` |
| Preserved frontend rollback channel | `rollback-bbe65022` |
| Integration branch | `steven/architecture-evaluation` |
| Release branch | `stable` |

Production and staging use identical game assets. Only their three generated
Firebase configuration files differ. The `commitUrbanImpacts` backend source
update preserved existing runtime configuration and access permissions.
Release documentation can advance after the runtime commit; rebuilding a later
commit is a new candidate and requires its own relevant verification.

The 5.3 notes compare against the preceding published 5.2 update. The September
28 optimization notes separately compare against the already-live 5.3 source,
so earlier ship and space changes are not counted as new optimization work.

[Release comparison](RELEASE_COMPARISON_5.3.md) · [Release status](RELEASE_INTEGRATION_STATUS.md)
