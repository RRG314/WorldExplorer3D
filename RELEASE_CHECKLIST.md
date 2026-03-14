# Release Checklist

Last reviewed: 2026-03-13

Use this checklist before pushing a production deploy.

## 1. Branch Safety

1. Confirm release work is on the intended branch.
2. Create a pre-deploy tag (example: `prod-20260302-1900`).
3. Confirm no accidental unreviewed local changes are included.

## 2. Mirror Safety

1. Sync canonical landing/account/runtime sources to hosting mirror:
   - `npm run sync:public`
2. Verify parity:
   - `npm run verify:mirror`

## 3. Automated Gates

1. Firestore rules tests:
   - `npm run test:rules`
2. Runtime invariants:
   - `npm run test:runtime`
3. Broader world matrix:
   - `npm run test:world-matrix`
4. Full gate:
   - `npm run release:verify`

## 4. Manual Functional Gate (Required)

### 4.1 Core navigation and launch

1. From title menu, choose preset city and start successfully.
2. Choose custom location -> globe selector -> `Start Here` launches selected location.
3. Use `Use My Location` and confirm blocked/indoor points resolve to a safe spawn instead of trapping the player.
4. Globe selector `Main Menu` button returns correctly to title menu.

### 4.2 Globe selector verification

1. Click globe and confirm place label updates.
2. Confirm marker size stays reasonable when zooming in.
3. Open `Favorites` and confirm:
   - preset city list visible
   - saved favorites visible
   - saved favorite delete works

### 4.3 Tutorial behavior

1. Verify tutorial shows for first-time progression.
2. Complete tutorial and confirm it does not auto-repeat.
3. Use Settings restart control and confirm tutorial can be restarted manually.

### 4.4 Driving and controls

1. Verify normal driving and walk/drone transitions.
2. At speed, hold `Space` and steer through tight turns to confirm drift handling.
3. Verify walking/drone controls are `WASD = move`, `Arrow Keys = look`.
4. Verify `M` opens/closes the large map.
5. Verify `F4` still toggles debug overlay.
6. Force a walk -> drive switch near/inside building blockers and confirm the car resolves to a safe road spawn.
7. Walk near a supported building prompt, press `E` to enter, then press `E` or `Esc` to exit back outside cleanly.
8. Select at least one real-estate or historic destination, navigate to its entry anchor, and confirm the same `E` building-entry flow works there.

### 4.5 Earth scene data and visuals

1. Verify the active build keeps optional path overlays hidden/disabled while drive/walk traversal still works correctly on the road-backed network.
2. Verify water remains visible in coastal/inland scenes where expected, including rivers, ponds, lakes, and steep coastline locations such as Monaco.
3. Verify vegetation appears in woods / parks / mapped tree areas without obvious overdraw or runaway draw-call cost.
4. Verify rooftop HVAC/detail and building color variation are present without roof-cap/parapet alignment glitches or obvious performance collapse.
5. Confirm interiors are still lazy by default: no building interior is active until the player deliberately enters one.
6. Confirm sampled interiors expose temporary containment colliders and build-placement targets instead of behaving like a disconnected under-map room.
7. Run the world matrix and review the generated report for at least one dense downtown, one coastal/water-heavy city, one mixed-terrain city, one sparse rural area, and custom-coordinate cases.

### 4.6 Auth and multiplayer critical flows

1. Sign up / sign in works.
2. Room create works.
3. Join by room code works.
4. Invite send works.
5. Invite accept/join works.
6. Saved rooms `Open` works.
7. Owner room `Delete` works.

### 4.7 Account and billing surfaces

1. `/account/` loads current account overview.
2. Username update works.
3. Receipts refresh works (if Stripe data exists).
4. Donation portal/checkout links open without endpoint errors.
5. Runtime/account/landing copy makes it explicit that map access and core gameplay are free and donations are optional.

## 5. Artifacts to Keep

- `output/playwright/runtime-invariants/report.json`
- relevant Playwright screenshots for release evidence

## 6. Deploy Rules

Do not deploy if any automated gate fails or any critical manual flow above fails.
