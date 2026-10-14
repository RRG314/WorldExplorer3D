# Coordinated backend review

Compare against the actual live 5.5.1 source, `012e5c85582b78a7808656545bf4143a31a18652`.
Four backend files differ. Firestore rules, Storage rules, indexes and package
locks do not differ. No destructive data migration is part of this candidate.

The affected exports are:

| Source change | Deployment exports | Behavior |
| --- | --- | --- |
| `economy-authority.js` | `commitExplorerCommerceAction` | Recover the same receipt across midnight, validate replayed command identity, and return its stable item ID. New purchases still use current-day stock. |
| `environment-data.js` | `getEnvironmentalData` | Reserve one concurrent HYCOM subset request across instances/locations; release only the owning reservation. |
| `place-lookup.js` | `getPlaceLookup` | Cache the provider's specific unnamed-ocean result without treating genuine errors as valid locations. |
| `interior-layout.mjs` through hybrid/derivative owners | `createRealityCaptureDraft`, `saveRealityCaptureHybridPreview`, `submitRealityCaptureHybrid` | Continuation, layout normalization and derivative generation use the shared slab/opening/lift/guard contract. |

`resolveBuildingInteriorRepresentation` returns the stored layout/model and does
not invoke the changed normalization or geometry paths. Its inventory timestamp
alone was not an adequate way to identify all affected exports. The three capture
writers above need the coordinated code update. Other capture readers retain the
same serialized shape; the new optional construction fields are normalized by
the shared owner. Existing data and access rules remain intact.

Before production: execute the complete backend scope, deploy this source to the
six affected staging exports, check live services and ordinary hosted operation,
and retain command/source/deployment identities. Repeat the six-export deployment
for production only as part of the verified frontend release. Inventory is not
behavior proof, and an emulator pass is not a live-service pass.

The save round-trip verifier now requires a complete, passing backend execution
manifest for its exact acceptance fingerprint and immutable candidate. Its
acceptance receipt hashes that backend evidence; a local save-owner fixture alone
can no longer declare backend compatibility.
