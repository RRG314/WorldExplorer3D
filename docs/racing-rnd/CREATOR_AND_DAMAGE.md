# Racing creation and contact release work

The October 31 owner request adds three creator entry points to the accepted
three-venue candidate: overhead selection of existing roads, recording a drive,
and a clean marked course on supported open ground. All feed one editable route,
one test flow, the existing activity library and existing room race authority.
The prior candidate remains preserved. The replacement coordinated candidate
includes this scope; acceptance and delivery identities are recorded in
[release readiness](RELEASE_READINESS.md).

## Design evidence

- Rockstar's [Midnight Club LA manual](https://manuals.plus/m/5d4246d3f7123b1252b71d46a945682079fc08ca7561a4a1c2f5ebd90b3e6070.pdf)
  describes overhead checkpoints, drive-and-drop, testing and room racing.
- EA's [Need for Speed Heat manual](https://www.ea.com/able/resources/need-for-speed/need-for-speed-heat/pc/text-manual)
  separates road/race/offroad/drift handling and connects damage with repair.
- Microsoft's [Forza creator documentation](https://support.forza.net/hc/en-us/articles/48409181275539-Forza-Horizon-6-FAQ)
  describes building anywhere, movable starting grids and precision editing.
- The [GDC cars/tracks design presentation](https://www.gdcvault.com/play/1028060/Reinforcement-Learning-for-Efficient-Cars)
  motivates evaluating car/track combinations rather than inferring playability
  from an editor outline. No new learning service is needed here.

Our interpretation: keep drafting forgiving and reversible, then qualify the
finished corridor and require a test. Road recording records graph choices,
not steering wobble. Ground recording becomes sparse editable anchors with
bounded smoothing, not a raw GPS ribbon. Reject overlapping or unsupported
corridors rather than silently moving them through buildings or water.

## Existing owners and implementation order

1. Portable vehicle contact uses the existing crash response and damage model;
   live condition affects handling. Practice and authority return damage through
   the existing garage/condition custody. New contact rules have distinct record
   identities; historic times and saved routes are preserved.
2. One creator draft supports overhead road selection and ordinary driving
   capture. Undo, reset, closed-loop completion, ordered anchors and explicit
   preview/test/save stay in the existing Racing runtime and library.
3. Open-ground corridors query the existing published surface and building/water
   owners. Their facts explicitly identify authored terrain courses; they never
   masquerade as OSM roads, flatten terrain or create another height authority.
4. Event equipment derives one clean perimeter from the accepted corridor.
   Closed city events block unused road mouths with readable chevrons; open
   ground uses appropriate course markers. All equipment retires with the race.
5. Room-only routes use existing authenticated room presence, publication,
   socket authority and car custody. Unreviewed room courses create no global
   rankings, Credits or career wins. Public competition keeps its existing
   reviewed-district, timed-test and moderation requirements.
6. Verify changed collision/damage, editor journeys and room scope, then create
   one matching coordinated candidate. Reuse accepted venue laps, interpolation,
   VR, Ocean/Space and platform evidence except where a change affects them.

## Acceptance gates

- Glancing contact, hard impact, low-speed parking contact, disabled car,
  condition-dependent handling, leave/reconnect and durable garage handback.
- Road map draft, undo/close, recorded drive to the same graph route, clean
  preview, save/reload, test and room access at the current location.
- Ground route on real published support; reject water, buildings, missing
  support, sharp folds, self-crossings, excessive grade and stale worlds.
- Visible perimeter/closure and highlight agree with playable boundaries;
  no equipment or controller remains after leave or location change.
- Authenticated room race, replay-safe unranked result, no public rewards,
  production-configured artifact and coordinated backend/source identity.

## Shipped design boundaries

The creator is one Racing workspace with a map beside its settings. Recorded
roads retain their qualified source path; repeated laps become one layout and
intermediate survey nodes do not become hundreds of numbered checkpoints.
Ground recording removes steering noise, keeps the end of an open route and
recognizes a completed loop. The preview qualifies the resulting corridor;
recording alone cannot make an obstructed or unsupported route raceable.

Surface courses derive continuous inner and outer equipment/paint boundaries
with the existing street polygon kernel. Bridges, tunnels and reviewed venue
perimeters retain their established presentation. Temporary equipment and map
resize observers retire through their existing race/UI owners.

Room tracks last up to 24 hours and are limited to eight active tracks per room.
Their bounded geometry must match the current room world and each driver's
loaded, qualified surfaces. They use standard damage, shared timing and the
existing vehicle custody. Room results save as unranked Journal practice,
separated by car setup and starting grid. They create no public board, Credits
or career wins. Approved venue competition, moderation and public records keep
their existing rules. Narrow reviewed venues use their complete approved event;
a custom room road corridor must be at least six metres wide.

The accepted three-pack candidate predates this creator/contact scope. Its
complete venue laps and pits remain evidence for unchanged support geometry;
the changed creator, contact, room authority and delivery boundaries have their
own accepted native, browser, database and artifact checks. Their scopes and
limits are listed in the readiness document.
