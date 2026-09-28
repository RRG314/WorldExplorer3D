# Release source identities

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
