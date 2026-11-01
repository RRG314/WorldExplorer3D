# Racing and track creation

The racing update went live on October 31, 2026.
[Play World Explorer 3D](https://worldexplorer3d.io/app/).

## Three complete venues

Drive the full Silverstone GP loop, the Nordschleife T13 layout and Daytona's
tri-oval. Silverstone and Daytona include their separate pit branches.
Venue-specific road support, terrain, paint, barriers, grandstands and scenery
are integrated with the same geographic world used for exploration.

These are geographic game interpretations. Other researched circuit, oval
and rally packs remain deferred; this release contains three venue packs.

## Your cars, condition and results

The BMW M3 E46, BMW M3 E92 race car and Porsche 911 Carrera 4S use real vehicle
models with their source licences and credits. They join the existing garage,
ownership, upgrades and condition system. These are game handling and cockpit
interpretations, not factory-certified simulations or GT3 claims.

Steady driving and camera interpolation have been repaired. Racing barrier
impacts damage your car, condition affects its handling, and the garage keeps
the returned condition through leave and reconnect. Repair the car in My garage.
AI practice rivals remain non-contact cars.

Practice saves to your Journal. Reviewed public races use authenticated shared
timing, comparable car/grid classes, replay-safe results and the existing
leaderboards and wallet. Private practice and room-created tracks do not pay
competitive Credits or create public leaderboard entries. Rivals and crews
remain connected to the same Explorer identity and progression.

## Make a track at your location

1. Open **Racing → Create track**.
2. Choose **Existing roads** and select connected junctions on the overhead
   map, or choose **Open ground** and place a few corner anchors where there
   are no roads. Pan, zoom, undo or close the loop as needed.
3. To capture a route by driving, enter your car and choose **Drive to create**.
   Drive the route, stop, then choose **Finish & edit**. Road recordings keep
   connected road choices; ground recordings become sparse editable anchors.
4. Choose **Preview track**, then **Test this route**. The finished corridor
   is checked for support, width, obstacles and terrain; recording alone does
   not make an unsuitable route playable.
5. **Save route**, or join a multiplayer room at the same location and choose
   **Share with this room**.

The checked layout has a clear map highlight and continuous course equipment.
Closed road events block unused road mouths; ground courses use their accepted
terrain. Layouts cannot pass through buildings, unsupported ground or water.
Room tracks last up to 24 hours, with up to eight active tracks per room.
Global road-route publication retains its timed-test and moderation flow.

## What was verified

Complete native-world venue journeys and both pit branches passed before
rollout. The creator also passed a full ground circuit, drive recording,
cleanup into editable anchors, save/start and Journal checks. Collision damage
returned exactly to the garage. Room authority checks covered the three real
cars, reconnect, replay-safe results, condition custody and account cleanup.

After deployment, a fresh account used normal production ReCaptcha Enterprise
App Check without a debug token or environment override. Protected API reads,
WebSocket authentication and all three venue catalogues passed. The actual
Silverstone world displayed both approved shared GP choices and opened the
creator. Existing player data, server settings, additional index settings and
rollback builds were preserved.

These desktop/browser and backend checks do not establish physical-phone,
headset or native-store acceptance. Existing mobile and VR lifecycle evidence
is retained. See [known limitations](KNOWN_ISSUES.md) and the
[release readiness record](docs/racing-rnd/RELEASE_READINESS.md).

Location-based play, optional continuous exploration, buildings, travel modes,
Ocean, Space, saves and platform integration remain part of the same app.
