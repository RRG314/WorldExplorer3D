# Room racing authority

This service runs the existing portable road vehicle and course rules for up to
four authenticated drivers in an existing World Explorer room. It has one server
physics clock. Browser prediction uses the existing road physics/frame owner;
Firestore presence remains the shared-world control plane.

Build shared rules from the repository root:

```sh
node scripts/build-racing-service.mjs
node scripts/build-racing-service.mjs --check
npm --prefix services/racing ci --ignore-scripts
```

The Docker build context is `services/racing/`. The explicit copy list excludes
credentials, research output, player records, other app packages and local
dependencies. No credentials belong in the image or source tree.

## Required deployment configuration

- Node 22.23.4 or a validated compatible patched Node 22 release.
- `GOOGLE_CLOUD_PROJECT`: the explicit target Firebase project.
- `RACE_ALLOWED_ORIGINS`: comma-separated, exact HTTPS app origins.
- `RACE_APP_IDS`: comma-separated Firebase App Check app IDs in that project.
- `PORT`: supplied by the container host, normally 8080.
- A dedicated runtime service account with Firestore access and Auth user-read
  permission for revocation checks. It needs no asset-storage or mail access.
- Initially one service instance, maximum eight simultaneous race sessions and
  forty sockets. Use a one-hour request timeout and verify CPU/memory headroom
  before increasing capacity. Drain active races before a revision replacement.

Configure the authenticated read function's server-only
`serviceConfig/racing` record with `enabled: true` and the returned HTTPS service
origin. The descriptor accepts only the named World Explorer racing service;
the browser additionally checks its Firebase project number and protocol version.
Do not enable the descriptor before the service and approved courses are ready.

An initial socket message supplies Auth and App Check tokens; tokens never enter
URLs, room records or results. The production entry point verifies revocation and
App Check, rejects anonymous accounts and emulator variables, and revalidates
active credentials every thirty seconds. Credentials expiring or being revoked
end their connection. Origin, payload, message queue and buffered output limits
apply before accepting gameplay commands.

## Authority and recovery

Admission checks active room membership, Earth origin/seed, community consent,
symmetric blocking, owned car/setup, the existing personal-car lease and proximity
to the approved grid. Drive to the start; online admission is not remote travel.
The starter BMW first acquires its ordinary room lease through the existing personal-car and room owners, retaining its original mesh and typed driving admission. The existing car custody and player-upgrade record receive a short reservation.
Ordinary vehicle updates yield until the reservation releases or expires.

The service reconstructs each approved course from a server-owned district and
route reference. Private creator drafts are owner-only solo qualification; approved time trials also allow one driver. Competition still requires two humans. Publication revision/status and the active district are rechecked during admission, renewal and settlement. Private tests mint only a test receipt, not Credits, wins or public times. See [course publication](../../docs/racing-rnd/COURSE_PUBLICATION.md). It never trusts client road geometry, poses, clocks, finish
claims, prices or car upgrades. Ordered controls drive the shared simulation.
Car contact and boosts are off. Inputs older than 400 ms brake; a stale browser stops predicting, open-but-silent connections reconnect, and the server bounds dead peers with ping/pong on its existing service clock. Lobbies publish once per second; active races publish at twenty Hz. Disconnects have
a ten-second grace. A departing host does not own or reset the race clock.

One immutable crossing snapshot owns result retries. A Firestore transaction
fences the room lease, creates the receipt, updates compatible personal/shared
times and career statistics, and credits the existing Explorer wallet once. Different starting grid rows/lengths stay in distinct grid-to-finish record classes.
Both drivers must finish for awards; at most three finishes pay per player/day.
Winners receive 250 Credits and other finishers 150; exact ties share first place.
Personal board classes are paged, rather than dropped after a fixed recent list.
The Journal records existing character skill separately; practice cannot submit
to these verified boards or award competitive Credits.

Completed receipts recover after a connection interruption. An instance failure
before committing a finish cancels the volatile race; it does not invent an award
or resume on an unrelated clock. The car reservation expires in fifteen seconds.
Cloud Run affinity alone cannot preserve a session across instance replacement.
See [Google's WebSocket guidance](https://docs.cloud.google.com/run/docs/triggering/websockets).

## Verification status

Focused source checks, real Auth/Firestore emulators and real WebSocket transport
have passed two-player timing, reconnect, host departure, stale-authority rejection,
idempotent awards, blocked-player reads, result recovery and paged personal classes.
Two isolated browser accounts also completed the real racing UI/controller flow,
saved real IndexedDB Journals, opened shared Rankings and returned to exploration.
Actual BMW models and desktop/mobile layouts were inspected.

Those browser checks used a controlled road, room/admission adapters and a local
App Check seam. They are not acceptance of a deployed service, a real city, race
venues, physical input devices or sustained performance. The production entry
point has no corresponding App Check bypass. Runtime dependencies are pinned;
the inspected Firebase Admin 14.5.0 / ws 8.22.0 lock had no reported production
dependency advisories. Firebase Admin release details are available in the
[official release notes](https://firebase.google.com/support/release-notes/admin/node).

Full release tracking: [finish goal](../../docs/racing-rnd/FINISH_GOAL.md) and
[remaining acceptance](../../docs/racing-rnd/RELEASE_READINESS.md). This service
implementation does not certify unbuilt venues or an unfinished social career.
