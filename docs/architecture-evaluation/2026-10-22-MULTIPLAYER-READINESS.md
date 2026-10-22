# Multiplayer readiness and geographic room ownership

Owner request October 22: verify personal rooms, public weekly play and the
streaming architecture; keep rooms at one location if geographic streaming is
not ready. Baseline clean e3209775, canonical architecture-evaluation worktree.
No push, production deploy or Godot work. One heavyweight local process at a time.

## Source findings and exact scope before edits

- Personal room creation uses signed-in Firestore batches, existing account
  quotas and a server admission transaction. Public joins can establish a guest.
- Weekly UI currently creates an ordinary user-owned room if it is missing. That
  consumes the first player's quota, gives them deletion/settings ownership and
  uses their device-dependent capacity. Week identity lacks the ISO year and
  uses local-calendar getters, so clients can disagree at a week boundary.
- Presence and ghosts carry explicit world frames. Ghosts reject different
  origins; global geographic room streaming is not implemented. Transport detail
  uses a finite selected-area source. Existing accepted regional residency is
  retained and must not be described as worldwide streaming.
- Room subscriptions start before location admission completes; wrong/unfinished
  world poses need to be withheld. A different selected Earth location must
  release the existing room session through its current owner before reset.

Implement a server-owned weekly room through existing joinRoom/admitRoomPlayer,
with canonical shared city facts, UTC ISO year/week identity and no personal
quota charge. Reserve new weekly codes against client creation; preserve existing
rooms and their data. Keep the existing supported 32-person upper bound unless
the owner requests a different concurrency target. Joining is public/guest,
while personal creation keeps existing plan limits. No new scheduler or store.

Bind each Earth room to its selected geographic origin. A different Earth-world
load detaches the room before reset; nearby streamed detail keeps the same
origin/session. Continue solo travel normally, without forced reload. Preserve
separate aircraft/maritime/interior and shared expedition frame rules.

## Acceptance checks

- Pure current tests: UTC/year rollover; server/browser weekly facts parity;
  no quota or first-player ownership; concurrent capacity; no wrong-frame pose;
  old session callbacks remain obsolete after leave/travel; failed world load
  cannot report a successful connection.
- Isolated real Firestore/Auth/Functions emulator: ordinary personal create,
  public/private joining and ownership, weekly creation by guests with exhausted
  personal quota, same room for two clients, direct weekly mutation denial,
  capacity/expiry/reconnect boundaries. Current rules, no production test writes.
- Owned Chrome, two clients, sequential world loading: normal room UI, shared
  chat/movement, weekly admission and location-change cleanup. Keep controlled
  component, actual gameplay and live-service observations separately labelled.
- Reuse existing streaming/contact/coverage checks for unchanged geometry. Inspect
  screenshots and console errors. Preserve failures before bounded reruns.

Evidence root: output/research/multiplayer-readiness-2026-10-22/. Existing verified
mail/game candidates and readiness pointers remain historical until a new hash-
bound candidate includes this change. No broad release matrix is restarted.

## Implemented outcome

Weekly entry now uses the existing server admission transaction. Its UTC ISO
week/year, city coordinates, deterministic seed and reserved code come from one
shared browser/server model. The first player cannot own/delete/reconfigure it,
and weekly entry consumes no personal creation quota. The ordinary public and
private room flows and their existing quotas remain in place. New personal codes
avoid the reserved prefix; existing W-prefixed room data stays intact. A collision
with an existing legacy room is a visible conflict, never an overwrite.

The weekly button works while signed out, establishes a guest session and can be
retried after failure. Its copy explains the Monday UTC rotation and 32-player
ceiling. The room menu explains the geographic boundary before joining. The
weekly room is open to all eligible guests/accounts **subject to capacity**;
"everyone" does not mean unbounded simultaneous participants.

Earth room activation prepares the world before installing room subscriptions,
then announces connection. Failed preparation releases the session. Different
room seeds at the same coordinates force the correct publication. The room owns
its seed override and restores the captured solo override on leave, without
clearing a newer owner's value. World replacement uses the existing room owner
to detach listeners, shared editing, ghosts and presence before reset. Ordinary
solo travel continues without a page reload. Detail residency within one origin
keeps the room. Aircraft, maritime, ocean/space and interior frame/admission
contracts are preserved.

During preparation, the existing bounded heartbeat renews admission metadata
without writing a pose. This retains the slot through a load longer than its
90-second lease, avoids publishing the previous world's coordinates, and resets
velocity inference across the loading boundary. Expired slots still require
server readmission and obey capacity; no direct resurrection was added.

## Executed evidence and retained failures

All files below are relative to the evidence root stated above.

- 51 distinct current focused cases passed: weekly identity/catalog parity,
  world/frame policy, room activation/session races, seed ownership, discovery,
  presence leases and world-load boundaries. `focused-first.tap` is the initial
  46-case run; later files overlap it. The old null-pose assertion was superseded
  by the stronger lease-only preparation and expired-slot cases in
  `loading-lease.tap`. Added activation/seed failures are retained in
  `activation-regressions-before.tap`; fixes in `activation-regressions-fixed.tap`
  and `seed-ownership-observable.tap`. `failed-load-admission-fixed.tap` checks the
  actual failed-load consumer. `weekly-ui-retry.tap` checks duplicate/failing joins
  and the restored retry control. This is not 51 plus every overlapping rerun.
- Ten distinct actual emulator backend cases passed. The four existing admission
  cases are retained in `first-backend.log`, four new HTTP/rule cases in
  `backend-passed.log`, plus `loading-lease-backend.log` and
  `private-room-backend.log`. Current local Auth/Firestore/Functions and current
  rules were used in isolated demo-we3d-multiplayer. Ordinary free creation,
  private code/member access, public joining, role/ownership denial, weekly
  quota independence, system-room protection, concurrent capacity, lease expiry
  and admission authentication were checked. Metadata-only renewals preserve
  the server's frame, pose and role. Two incomplete added test fixtures failed
  (missing room code and profile fields); their first logs are retained, with
  no rules weakened to accommodate them.
- `browser/receipt-sixth.json` records two independent actual game clients:
  public create/discover/join, identical origin/seed, mobile chat received by the
  other client, keyboard walking committed to Firestore, short offline recovery
  and travel releasing the captured membership. This run stops at a later
  weekly fixture restriction, so its overall status remains failed; its five
  completed assertions are retained without relabelling the whole run passed.
- `browser-weekly/receipt.json` is passed. Two signed-out clients admitted to the
  same system weekly room through the actual weekly UI action (controlled world
  activation for those two), followed by a fresh **full game** guest entry through
  the normal weekly button. Actual current Nürburgring world: 1,427 buildings,
  5,724 roads and 64 terrain tiles. Walking committed; normal Leave removed
  membership and preserved the system room. This city load used public map
  providers/fallback as observed, not the Logan recording.
- Actual screenshots `browser/chat-mobile.png`, `browser/walking-mobile.png`
  and `browser-weekly/weekly-city-guest.png` were opened and visually inspected.
  No JavaScript page errors in these completed journeys. Local optional marine,
  weather and reverse-geocoding routes returned 503; console resource errors are
  retained. Deliberate offline errors are also retained. This is **not** a claim
  that every console/resource request succeeded.
- Logan used the existing complete recorded primary desktop/mobile map inputs;
  controlled-empty ancillary boundaries and nearby-city suggestions are labelled
  in the receipt. Not live-map completeness acceptance. The replacement destination
  load was canceled by closing that owned client after room cleanup; no completed
  second-city tour is claimed.
- Earlier browser attempts are retained. Firebase root-config/project routing
  errors were local setup defects, not cloud writes. Installed Playwright's
  injected wait treats a returned Promise as truthy, so asynchronous readiness
  predicates falsely passed before loading completed. The corrected synchronous
  probe observes the real world/room owners, seed and loading cover. Only the
  affected gameplay check was repeated. The next controlled weekly fixture's
  intercepted document hit Chrome loopback permission enforcement; serving its
  real HTML from the local static server fixed that test setup. No browser
  security policy was disabled. The completed personal-room journey was retained
  while only weekly entry was rerun.
- `live-read-only.json`: production/staging joinRoom was ACTIVE and required room
  discovery indexes READY. Production remains 5.6.1 / 233a5a7f; staging remains
  the previous tester package. This inventory is **not** a live execution of the
  new multiplayer source. No production player/database mutation was performed.

After those gameplay journeys, the small heartbeat delta was verified with the
full focused presence suite and one current-rule emulator case; unchanged worlds
were not replayed. Existing transport residency/contact/coverage evidence remains
retained for unchanged geometry. No historical release matrix was restarted.

## Boundaries and activation

This supports location-bound social multiplayer and existing shared activities.
It does not implement geographic room shards, worldwide shared coordinates,
server-authoritative competitive physics, an MMO or an unlimited world source.
Transport detail still comes from a finite selected-area source. No forced
reload, competing state store, scheduler, asset reduction or save migration.

The existing presence interval is 2.5 seconds, suitable for the existing social
room model; it is not a competitive networking tick. The 32-player weekly ceiling
was checked transactionally. This run did not load/render 32 game clients, measure
32-player latency/cost or verify a physical phone. The owner has not provided a
larger concurrency target. Higher concurrent population requires separate load
and cost measurements before increasing the limit; it must not be inferred from
successful two-client play. A full room gives a retry message and personal rooms
remain available. Weekly room identity rotates; old room records are preserved.

The new scope changes **one existing Function, joinRoom**, plus one room-create
rule and canonical-model predeploy generation. That explicitly supersedes the
prior mail-only restriction on changing existing Functions for this multiplayer
request; preserve all other existing Function configurations, secrets, rules and
data. Preserve the four additive tester Functions and their separately documented
activation requirements. New backend, reserved-prefix rule and frontend must be
released together through the protected workflow. Cached older clients use the
old weekly scheme; existing W rooms remain accessible, but creating missing old
weekly rooms is blocked by the reservation. Do not activate this rule alone as an
uncoordinated background change.

Local endpoint: implement, focused verification, compile an isolated production
candidate, bind source/artifact/evidence, and commit. Actual staged activation and
protected production promotion with a bounded hosted multiplayer smoke remain
release actions. No push/deploy, release branch change, cloud setting change or
Godot work is included. The older tester package/pointer remains historical,
with a recoverable staging package if its generated candidate slot is retired.
