# Gameplay Content Extensions

World Explorer 3D separates trusted engine code from creator-authored content.
Contributors extend reviewed catalogs and templates; room documents never load
arbitrary JavaScript.

## Add A Build Piece

1. Add the shape and surface contract in `app/js/block-builder/catalog.js`.
2. Add the matching authoritative asset in `server/src/content/catalog.js`.
3. Add bounded starting inventory in `server/src/content/inventory-policy.js`.
4. Cover stacking, collision, vehicle contact, and the 200-piece boundary in
   `scripts/test-block-builder-contract.mjs`.
5. Render every shape in `npm run test:editor-multiplayer` and inspect the
   resulting screenshot.

Client and server shape identifiers must match. The server chooses normalized
shape and material metadata; clients cannot create unregistered assets.

## Add An Activity

1. Define its traversal mode, allowed anchors, and validation requirements in
   `app/js/activity-editor/schema.js`.
2. Add placement rules only when the existing road, walk, roof, interior, water,
   underwater, or air surfaces are insufficient.
3. Add discovery categorization in `app/js/activity-discovery/schema.js`.
4. Add runtime spawn and completion behavior in
   `app/js/activity-discovery/runtime.js`.
5. Add creator test-mode support in `app/js/activity-editor/session-testing.js`.
6. Use mapped points of interest or world surfaces for generated activities;
   do not invent geographic facts when sourced data exists.

## Add Server Gameplay

Server gameplay must be deterministic, bounded, permission-checked, and derived
from authoritative events. Clients may request intent but may not submit XP,
credits, inventory, hits, mission completion, leaderboard scores, or durable
world revisions.

Every durable command requires:

- a schema-bounded payload;
- role and room-rule authorization;
- an idempotency key and expected revision;
- per-actor and per-cell budgets;
- persistence and reconnect coverage;
- a denial-path test.

## Contribution Definition Of Done

- gameplay works in a real browser, not only in a unit test;
- desktop and phone layouts remain usable;
- two clients observe the same authoritative result;
- no new file exceeds 700 lines without a documented reason;
- public docs and data/asset attribution are updated;
- no production credential or user data is required.

Original project code is licensed under Apache License 2.0. Review
[LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[DATA_LICENSES.md](DATA_LICENSES.md) before contributing or redistributing a
complete build.
