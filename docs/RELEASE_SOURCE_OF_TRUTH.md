# Release source identities

## Current observation — October 7, 2026

Fresh hosted manifest: **5.4.0+1532bdfbb5c1.319d215f60318297.production**, source **1532bdfbb5c11e002d278b058d1ebdba88384f60**. The next compatible release is 5.5.0. Current work remains on steven/visual-quality and has reached the hosted preview, not production. Production has 78 Functions; getPlaceLookup and getEnvironmentalData are absent and need a coordinated backend rollout. Historical execution receipts are not complete acceptance of this candidate. See [current state](../CURRENT-STATE.md) and [finite release gates](product-audit/2026-10-01/RELEASE-ACCEPTANCE.md).

The current local and hosted preview candidate is `5.5.0+135e3895f89d.e85c0302553a7fda.staging`, built from source
`135e3895f89dc4459e073bd9ac85dbef2087420f`. It has 615 verified files; its game payload is identical
to `316ba33d`, with subsequent changes confined to release verification. The preview's complete-world
preflight passes. Staging's aircraft gateway is
version 6 with its existing parameters preserved; production Functions are unchanged.
The complete current-package acceptance remains pending.

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
