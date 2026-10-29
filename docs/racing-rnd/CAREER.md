# Rivals and crews

Racing and Account → Friends & Invites expose the same optional career. The
existing Explorer account, garage, room admission, Journal, skill and wallet
remain their owners. This component does not create a second identity, car
inventory, progression currency, subscription or frame loop.

## Player flow

- Finish an approved online race to unlock its exact course/car-setup class for
  challenges and series. Practice remains available separately.
- Challenge a friend or a current room player. They accept before joining a
  race. Each driver's **first accepted finish** in that class counts; DNF does
  not post a time. Challenges last seven days. One open challenge per pair and
  class prevents multiplying wins through duplicate invitations.
- Create or join a private crew of up to eight players. The leader chooses one
  to five verified classes for a series. Players opt in before joining races;
  each stage retains their best eligible time. Completion count ranks before
  aggregate time, and equal results share a place.
- The leader can finalize after at least two active entrants finish every
  stage. Expiry closes entries, allows ten minutes plus thirty seconds for
  races already running to commit, then any entrant/read recovery can finalize.
  Incomplete or withdrawn entries cannot receive a series win.
- Invitations and completed results persist in Account. Leaving transfers
  leadership and withdraws unfinished entries; cars, skill and prior results
  remain. Challenges and series award no additional Credits.

## Authorities and lifecycle

`functions/racing-career.js` owns commands and read projections in existing
Firestore transactions. Admission captures bounded challenge/series membership
in the race roster. Only an accepted, matching human result with a server
crossing time can advance it. The immutable result's per-player application
marker makes create-trigger retries and read recovery idempotent. Clients cannot
submit a time or edit global career facts.

Community consent, symmetric blocks and existing friends/current room presence
control invitation admission. Both incoming and outgoing invitations, active
challenges, series and members are bounded. The existing car race reservation
prevents changing commitments after joining a race. Create commands retain one
request ID across a failed response; a successful command clears that retry ID
so a later intentional creation works.

The in-game view belongs to the current account, world publication and existing
environment session. Closing, replacing the world or changing accounts disposes
the view and pending requests through existing lifecycle scopes. Account uses
its current section/auth owner. These views do not take transport controls or
join a multiplayer room automatically. Existing VR presentation releases before
opening the native racing dialog.

The existing whole-account closing marker fences admission, settlement and
career writers. A retryable Auth deletion consumer detaches crew membership,
transfers leadership, removes invitations/private projections/board entries,
withdraws authored routes and anonymizes retained shared results. Cleanup does
not remove another game's collection-group entries or recreate the account.

## Verification boundaries

Current automated coverage includes actual isolated Auth/Firestore, WebSocket
authority, two browser accounts, real car models, keyboard driving, IndexedDB
Journals, challenge completion, a two-stage series, tied final standings and
durable history. Focused transaction checks cover command retry, duplicate and
reverse challenges, blocks, admitted custody, expiry, leadership transfer and
deletion retries. UI checks cover retry IDs and owner disposal. Controlled road
facts, prior-class read fixtures and App Check adapters are explicitly test
seams; this evidence does not establish real-city or physical-device acceptance.

Deploy the career endpoints, result projection and Auth deletion consumer
together with the service's admission-context/result fields. The two cleanup
collection-group indexes in `firestore.indexes.json` must be ready before live
deletion verification. History uses the automatic descending timestamp/name
index and a stable page cursor. The public service descriptor remains disabled
until the coordinated geographic and service journey passes.
