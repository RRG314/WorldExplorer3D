# Three-venue release

The release comprises Silverstone's full GP loop and complete pit branch, full Nordschleife T13,
Daytona tri-oval and its complete pit branch, and the real BMW M3 E46, M3 E92
race car and Porsche 911 Carrera 4S. Existing garage/upgrades, rivals/crews,
Journal, creator moderation, room racing and class leaderboards use their
existing owners. The same release includes overhead road creation, ordinary
driving capture, supported open-ground tracks, room-only sharing and standard
barrier damage with durable garage handback. Other nine venue layouts are
deferred.

Silverstone's complete 73-checkpoint pit journey passes native publication,
four-wheel contact and clean entry/exit. Its authored usable corridor compiles
through the shared road owner without changing the map or native ground.
See [readiness and evidence limits](RELEASE_READINESS.md). Build and verify the
matching candidate before rollout.

## Frozen coordinated inputs

Build from committed, clean source. Preserve the existing production artifact,
player data and old runtime generations. The release receipt records the
Hosting manifests and hashes for the service source, generated engine,
Functions inputs, Firestore indexes and the three reviewed catalogue datasets.
The datasets contain geographic product content and attribution, not user
saves or competitive results.

The generated browser/service/Functions rules must agree:

```sh
node scripts/build-racing-service.mjs --check
node scripts/racing/intake-venue-catalog.mjs
```

The second command is a dry-run. It verifies source/ground identities,
reconstructs both lap choices and prints only district/course metadata.
Publication is idempotent, uses existing immutable chunked districts/course
records, and refuses an existing creator or changed course. No qualification
receipt, player, wallet credit or leaderboard entry is fabricated.

## Coordinated rollout

Use the explicit production project `worldexplorer3d-d9b83`. The October 31
read-only inventory found no deployed racing Functions there; Cloud Run listing
was permission-denied, so a production racing service was not established by
that read. Staging's earlier live-service acceptance remains separate.
These are deployment steps, not evidence that production has been changed.

1. Drain active racing before replacing its authority. Build/deploy
   `services/racing/` with its existing Dockerfile and pinned Node version.
   Use the dedicated Firestore/Auth-read service account described in
   `services/racing/README.md`, one maximum instance, 40 concurrency, a one-hour
   request timeout and at least 1 GiB memory. Supply `GOOGLE_CLOUD_PROJECT`,
   `RACE_ALLOWED_ORIGINS` and `RACE_APP_IDS`. The production web App Check ID is
   `1:469573887496:web:abf6ee1eda1f733f42d3bd`; include the actual supported HTTPS
   Hosting/custom-domain origins. Keep credentials in the runtime account.
   The existing descriptor expects the numeric project endpoint
   `https://we3d-racing-469573887496.us-central1.run.app`.
2. Deploy the current Firestore indexes and the changed Functions listed below.
   Wait for required indexes and the service health endpoint to be ready. Keep
   the existing Firestore rules and player data. Do not publish broad rules.
3. Deploy the verified **production-configured artifact** to the existing
   production Hosting site using a temporary explicit Hosting config that
   preserves all current rewrites/headers and points at that artifact. Do not
   replace `dist` or accidentally deploy the older default build. Retain the
   current production generation with `--retain-runtime-from` when building.
4. Publish the reviewed geographic catalogue and enable the existing descriptor
   only after the coordinated backend/frontend is ready:

```sh
node scripts/racing/intake-venue-catalog.mjs --project worldexplorer3d-d9b83 --production-release --approve --service-origin https://we3d-racing-469573887496.us-central1.run.app
```

The explicit service-origin option checks the exact project endpoint and health
before changing `serviceConfig/racing`. Other fields in that existing document
are preserved. Without the option, the importer does not enable the service.

Required changed Functions for this racing/vehicle and room-cleanup scope:

```text
getRacingService getRacingRecords getRacingCatalog getMyRacingRoutes
commitRacingRoute reviewRacingRoutes getRacingCareer commitRacingCareer
projectRacingCareer cleanupRacingDeletedAccount deleteAccount
commitExplorerVehicleAction claimUrbanVehicle updateUrbanVehicle releaseUrbanVehicle
```

The Functions archive includes the new room-publication module and account
cleanup projection. Deploy `deleteAccount` too so its room-tree fallback retires
room racing collections. No broader Firestore rules are required. New standard
contact classes and room-only records coexist with historical courses and times;
do not overwrite old publications or migrate old results into the new class.

Confirm hosted build/asset identities after deployment. The owner performs
production deployment separately; local acceptance does not assert production
App Check, physical-phone, headset or native-store acceptance. Roll back Hosting
to the retained production artifact if delivery fails; preserve current player
records and immutable history instead of deleting racing data.
