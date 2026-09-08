# Maryland Parcel Verification

Run from the repository root:

```sh
npm run verify:maryland-parcels
```

The command has three gates:

1. `tests/maryland-parcel-property-current.test.mjs`,
   `tests/home-property-current.test.mjs`, and
   `tests/property-authority.test.cjs` check the normalized schema, field privacy,
   geometry, deterministic identity/value, all 24 resolver codes, multi-building
   and vacant parcels, connected-authority rejection, Quick Build ownership,
   failure isolation, existing property/storage behavior, and an end-to-end parcel
   purchase through the one Explorer Wallet and existing property registry.
2. `scripts/verification/maryland-parcels-current.mjs` queries current official
   service metadata, exact distinct jurisdiction codes, and one stable live parcel
   sample from every county and Baltimore City.
3. `scripts/verification/maryland-parcel-property-browser-current.mjs` launches a
   real Baltimore Earth world, uses the Real Estate controls, waits for a live
   parcel result, checks that network requests omit owner fields, inspects property
   details and the mapped shape, renders the terrain outline, confirms
   `render_game_to_text`, captures evidence, and repeats layout checks at a
   390×844 phone viewport.

The final 2026-09-06 acceptance run passed:

- 23 combined parcel, property, storage, transaction, and wallet tests;
- live metadata and one privacy-safe parcel sample for every one of the 24
  Maryland jurisdictions;
- a Baltimore runtime with 413 parcel candidates, 159 associated loaded
  buildings, and 314 land-only parcels returned by two bounded requests;
- visible parcel-shape and terrain-boundary rendering, desktop and phone fit,
  zero page errors, and zero failed local resources;
- the current source/entry graph audit at 637 modules and 645 module targets.

The source regression gate is:

```sh
npm run verify:source
```

Browser evidence is written to
`output/verification/maryland-parcel-property/`. Provider availability is an
external dependency; a live-gate failure must be reported separately from the
unit-tested building fallback. Production deployment is not part of this task.
