# Living Portal architecture and destination quality

October 25, 2026. Starting checkpoint `956c03e`, canonical architecture-evaluation
worktree. The tracked tree was clean; 7.2 GiB free before new evidence. This
extends the owner's Living Portal concept with Apple/browser support and a
strict requirement that suggested worlds provide a worthwhile actual experience.

## Product decision

Build one Living Portal feature with a common destination catalog, Exploration
Trail and action contract. Provide Android and Apple native widgets plus an
equivalent responsive Portal in the website. The widget is a small view of the
shared feature, not a second game or another player economy.

**Only qualified destinations should offer Enter World.** Worldwide geographic
selection does not establish worldwide visual or gameplay quality. The current
game cannot honestly guarantee a rich, geographically faithful experience at
every arbitrary coordinate. Expand a reviewed catalog across regions and
experience types; qualify what the Portal recommends before recommending it.

Discover and Save can remain available for an interesting place whose full
world experience is not ready. Explain that distinction. Do not quietly replace
the selected beach with a nearby city or open a generic field while keeping the
beach's photograph and title. The player's ordinary location search remains
available; qualification is an additional standard for promoted Portal entries.

The implemented piece is a portable, read-only destination admission policy and
its focused component checks. Native widgets, a Portal UI, cloud Trail sync,
approved destination content and launch integration remain subsequent work.
No widget or location has been falsely marked ready by this checkpoint.

## Cross-device delivery

| Surface | Implementation | Important boundary |
| --- | --- | --- |
| Android phone/tablet | Kotlin and Jetpack Glance in the existing Android package, with persistent last-good card and bounded background work. | Current native app is a Java Browser Helper/TWA launcher. Kotlin, Glance, widget receiver/configuration and its data client have not been added. Preserve the existing browser/game handoff. |
| iPhone/iPad | A native containing app and SwiftUI/WidgetKit extension, with App Intents for supported in-widget actions. | No iOS project exists in this repository. An Add to Home Screen web icon is not this native widget implementation. Signing, capabilities, devices and distribution need their own delivery. |
| Android/iPhone browsers and installed web apps | Responsive Portal card and Exploration Trail in the existing web shell/Journal. | This is the broadly available baseline, with portrait/landscape and keyboard/screen-reader support. It must not depend on native widget APIs. |
| Desktop and other devices | Same web feature; later native adapters only where useful. | Apple platforms and Windows have their own widget providers and host behavior. Shared content does not imply one native widget binary works everywhere. |

Android's [Glance state/update guidance](https://developer.android.com/develop/ui/compose/glance/glance-app-widget)
describes passive widgets hosted outside the app process and persistent
application state. It allows periodic and action-driven updates but discourages
minute-by-minute refresh. Use scheduled work for occasional content refresh,
with connectivity/battery constraints and backoff; do not keep a renderer,
multiplayer listener or continuous location watcher running.

Apple's [widget extension guide](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension)
defines a native extension and timeline provider. Its
[interactivity guide](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)
uses App Intents with buttons/toggles; use links for opening the app. Provide an
open-the-app alternative where interactive actions are unavailable. Neither
native framework should receive a duplicate copy of the full game runtime.

Apple's [timeline refresh guidance](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
uses a system-managed, variable budget. Daily suggestions can be scheduled or
prefetched, but exact midnight updates are not a promise. A cached card should
say when it was updated; yesterday's offline card must not claim to be today's
fresh discovery. Changing the date must not erase the saved Trail or create
streak pressure.

Windows [widget providers](https://learn.microsoft.com/en-us/windows/apps/develop/widgets/widget-providers)
are another platform-specific implementation option. They are outside the first
native clients; the web Portal supplies the shared experience there initially.

## What the current source establishes

| Finding | Source evidence | Consequence |
| --- | --- | --- |
| Readiness is publication correctness | [world-readiness.js](../../app/js/earth-core/world-readiness.js) checks current sequence/request, geometry, gameplay runtimes and publication identity. | Reuse it after loading, but do not reinterpret it as a scene-fidelity certificate. |
| Layers retain honest partial coverage | [world-layer-products.js](../../app/js/world/compiler/world-layer-products.js) emits `partial` for nonempty terrain, transport, building and place products. | Record counts/one mesh do not certify the whole advertised destination. Never change these to `complete` to pass a Portal check. |
| A published origin is explicit | [world snapshots](../../app/js/earth-core/world-snapshot.js) retain immutable request/location, layer authorities and data records. | The loaded publication must match the selected destination, not merely a previous ready world. |
| Surface domains vary | [world-load-plan.js](../../app/js/earth-core/world-load-plan.js) intentionally omits urban/map features for verified open ocean and cryosphere. | A nature/marine experience cannot share an urban buildings threshold; absence can be geographically correct. Quality must be specific to the promised experience. |
| Ecology is regional and tiered | [regional-packs.js](../../app/js/discovery/ecology/regional-packs.js) selects bounded regional packs and retains reference-fallback/media qualification limits. | A plausible species list is not proof of rich animal presentation, live occurrence or approved media at a new destination. |
| Geographic scenes are bounded | [world-mode assessment](2026-10-24-WORLD-MODE-FEASIBILITY.md) and current transport source/planner describe finite selected areas. | A Portal card names a qualified area/arrival and its experience, not unlimited exploration outside the source. |
| Native launch already preserves web links | [Android launcher](../../android/app/src/main/java/io/worldexplorer3d/app/GameLauncherActivity.java) delegates to Browser Helper and retains the Play distribution context. | Extend that route; do not introduce a second unrestricted native spawn path. |
| Shared web links exist | [share-links.js](../../app/js/ui/share-links.js) parses known Earth/transport settings and restores through transport owners. | A new opaque Portal ID will need an explicit resolver/consumer; adding `?portal=...` alone does not implement arrival. |
| Journal persistence is device-local | [profile-store.js](../../app/js/discovery/profile-store.js) uses IndexedDB profile `local-explorer`; [receipt hydration](../../app/js/discovery/receipt-hydration.js) explicitly is not full Journal cloud backup. | Cross-device Trail requires an account-scoped sync boundary. Native widgets cannot assume access to the browser's save database. |
| Non-reward Journal events are possible | Story events support explicit projections; profile-store skips character/progress projection when `projections.profile` is false. | Record Portal interest/learning without granting field discoveries, XP, inventory or mission completion. |

These are current-source observations. Historical successful city runs are useful
evidence leads, not automatic qualification of every place, current source bundle
or physical phone. The illustrative Iceland/Amazon/Rotterdam photos do not supply
the corresponding 3D assets or demonstrate those scenes render correctly.

## A destination is a content package

An entry needs more than latitude, longitude and a photograph. The proposed
catalog record binds a stable destination/revision to:

- The exact geographic origin, bounded experience area and an authored/admitted
  arrival appropriate for walking, driving or the eventual domain-specific mode.
- Versioned source/content, a meaningful itinerary or activity and the specific
  experience IDs advertised by the card.
- Terrain shape/materials, water/shoreline, structures and land cover appropriate
  to the location. Use geographically grounded generation where suitable; reserve
  authored assets for distinctive features that generic footprints cannot convey.
- Regional learning content, source/attribution and media rights. Prefer actual
  game captures for the preview. Label licensed reference photographs clearly;
  do not imply their photographic detail is the game's rendering.
- Qualification evidence for the relevant rendering/content contract and device
  profile, plus revocation/expiry. Photos, textual claims and a successful data
  response alone cannot approve the entry.

Richness is specific to the place. A city needs coherent streets, buildings,
landmarks/places and a useful exploration loop. A volcanic coast needs the right
landform, shore/water and material character, plus meaningful interpretation or
fieldwork. A remote forest needs regional habitat presentation, terrain and a
purposeful investigation. Inventing a city, wildlife occurrence or settlement
to increase counters would undermine the promise.

Iceland's Black Sands, an Amazon habitat and Rotterdam harbor are **content
candidates**, not approved destinations. Current presets also need scoped
review before being featured. Start with one city and one contrasting landscape,
then publish a small geographically varied collection as each package qualifies.
Do not pick random coordinates over the globe and hope the runtime fills the gap.

## Implemented qualification boundary

[portal-destination-policy.js](../../app/js/earth-core/portal-destination-policy.js)
exports `evaluatePortalOffer` and `evaluatePortalWorldReadiness`. It adds no
cache, scheduler, player state, actor controller or progression writer.

The offer gate requires a versioned Earth destination, matching origin, bounds,
arrival, kind and revision, plus approved evidence for geographic identity,
visual experience, safe arrival, playable content and device performance.
Required layers differ for city, nature and coastal profiles; driving always
requires transport. Advertised experience IDs must be covered. Unknown bodies,
missing/expired evidence, changed content/render contracts or an unqualified
device profile are refused.

The second gate re-evaluates qualification after loading and calls the existing
Earth readiness owner. It also requires the actual immutable publication to have
the matching origin and nonempty, attributed required layers. Partial products
remain partial. A failed, loading, obsolete or replaced world cannot pass just
because a previous suggestion was qualified.

**Trust boundary:** the assessment must come from the approved catalog/resolver,
not a widget parameter, player JSON or a URL. This module validates consistency;
it does not manufacture QA evidence or authenticate a catalog. The publishing
service must authenticate authoring, control promotion/revocation and deliver
trusted catalog data. A loaded-source adapter still needs to bind the current
content version to its real source bundle; supplying an arbitrary version string
is not that integration.

The module is not connected to a live suggestion endpoint or launch UI yet. No
production destination is approved by its synthetic fixtures. This is the first
shared boundary for those consumers, not a claim that the native widgets or
world content are implemented.

`testedBuildId` records provenance; compatibility is governed by the affected
render/content versions. An unrelated documentation, email or widget-copy change
should not force another global rendering sweep. Derive/bump compatibility when
relevant source, assets, data or arrival behavior change, and rerun only affected
destination/device gates. A manual version field without an enforced publishing
process must not silently waive those changes.

Publication readiness does not place the actor or award a visit. The next
consumer must use existing travel/session admission, check the actual actor
arrived within the qualified destination, and confirm the matching world was
presented before recording a virtual visit. The same rule prevents tapping
Enter World, cancelling a load or entering a room lobby from becoming a visit.

## Exploration Trail and identity

Use independent facts rather than a single highest status that loses history:

| Fact | Meaning | Authority |
| --- | --- | --- |
| Offered | A destination card was delivered for a particular daily opportunity. | Catalog delivery ID; no claim the person actually read an offscreen widget. |
| Saved | The person explicitly kept the place. | Idempotent user action; unsaving does not erase learning/visit history. |
| Investigated | The person explicitly opened/completed the informational interaction. | Versioned content/action record; learning is distinct from a field observation. |
| Virtually visited | The matching playable world was entered and presented at the admitted place. | Main-game session/actor/presentation evidence, not a widget click. |
| Expedition completed | A specific supported activity was completed. | Existing activity receipt/authority; never a widget-supplied completion flag. |

Saving, learning and visiting need not occur in that order. Use distinct dates
and IDs, with a readable summary badge while retaining the underlying facts.
Widget previews and pre-generated timeline entries must not create visits or
large numbers of supposedly viewed discoveries.

Project Portal events into the existing Journal with explicit non-reward
projections: Journal on; profile/character, field guide, inventory, place awards
and mission progress off unless an existing game authority later supplies the
appropriate receipt. Do not call generic rewarded story recording with its
default profile projection. Keep guest Trail data local and label it as such.

For account sync, add a bounded Trail domain to the existing Explorer identity,
not another wallet or character. Native and browser clients need authenticated,
owner-scoped commands, durable per-client pending actions and deterministic
operation IDs. Merge/retry must not duplicate saves/investigations or import
another account's history. Protect native API calls with appropriate registered
native attestation/authentication; do not reuse a web debug credential.

Retain existing local saves and do not silently upload the entire local Journal
on sign-in. Offer an explicit account merge for the relevant guest Trail. A
widget cache is a projection; it cannot become a competing progression authority.
Logout/account switching must clear private cards and pending account context
without deleting the user's original device saves.

Apple [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups)
can share a container between the native app and its extension under the same
team. They do not implement browser-to-account Journal synchronization. Android
also needs a persistent native projection rather than assuming the TWA exposes
its browser storage.

## Launch actions and Portal modes

Use opaque destination/opportunity IDs and intent, resolved by the trusted
catalog. Do not put credentials, reward flags, arbitrary renderer coordinates or
redirect URLs in links. Preserve Android's existing origin validation and Play
context. Apple [associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
support universal links through a website association and app entitlement.
Provide a web route when the native app is absent.

The launch journey is: resolve card → authenticate if needed → recheck catalog,
device and current availability → existing session/world preparation → admitted
arrival → matching presentation → virtual-visit event. Failures keep the Trail
and explain the unavailable step. Offer another qualified choice explicitly;
do not switch destinations silently.

Android's [Glance interaction guidance](https://developer.android.com/develop/ui/compose/glance/user-interaction)
distinguishes direct activity launches from callbacks. Enter World should use
the supported direct launch action; a background callback/service should not
try to trampoline into the game.

All modes filter the same catalog:

- **Wander:** rotate among qualified packages, with regional variety and reduced
  repetition; respect user dismissals rather than reward streaks.
- **Home:** follow a chosen saved place. If full world quality is not qualified,
  offer its learning/saved-place view with an honest status.
- **Nature:** require the advertised regional landscape/field content, not just
  a matching biome label or reference-only species list.
- **Together:** fetch a bounded, timestamped public-room summary. Say “recently
  active” when appropriate; never imply a stale cached count is live presence.
  Joining still uses current authentication, moderation, capacity and room-origin
  admission. Private rooms/identities must not leak into a public widget cache.
- **Beyond Earth:** keep the same card/Trail envelope but use planetary or space
  destination facts, supported launch/arrival and domain-specific qualification.
  The implemented Earth gate deliberately rejects these until that adapter
  exists; planetary coordinates cannot be silently interpreted as Earth.

Initial Home selection is manual. Later proximity can use explicitly permitted
foreground/recent coarse location with age/accuracy, rather than a background
tracking requirement. Precise home location and sensitive nature sites should
not appear on a public/locked-screen card by default. Live GPS walking, headset
tracking and local weather remain distinct capabilities; the
[VR research](2026-10-25-VR-FOUNDATION-RESEARCH.md) preserves those boundaries.

## Delivery and focused acceptance

1. **Completed here:** shared Earth offer/publication policy, current-source
   assessment and cross-device design. Twelve distinct component cases pass.
2. **Next complete product slice:** one trusted city package and one landscape
   package, a responsive Portal/Trail in the existing web shell, non-reward
   Journal projection, and the resolved session-owned launch. Implement content
   version binding and promotion/revocation before enabling Enter World.
3. **Native clients:** Android Glance and Apple WidgetKit against the same
   catalog/action/sync API. Compile and test each native client; prove offline
   card, save/investigate, duplicate tap/retry, logout and launch on actual
   supported devices. Preserve the existing Play package's browser ownership.
4. **Expand content and modes:** qualify additional regions and experiences,
   then Together and Beyond Earth with their existing domain authorities.

For each featured destination, inspect the actual rendered arrival, views,
materials and promised place/activity. Exercise a small exploration loop, any
bridge/tunnel or shoreline it uses, provider failure and return. Capture game
screenshots and a scoped source/content/device receipt. Measure mobile and
desktop pacing on representative hardware; emulator layout or a successful
HTTP request is insufficient evidence of phone performance.

Reuse unchanged lifecycle/transport/backend verification. Change-impact checks
should select affected packages; do not reset every day's exploration or rerun
every city after an unrelated UI change. Default to the last good dated card
offline; keep metadata cache separate from a claim of offline 3D world play.

## Evidence and limits

Evidence is retained under `output/research/living-portal-2026-10-25/`.
`destination-policy-final.tap` has 12 passes, no failures/skips. The initial
12-case run passed, then a strengthened antimeridian case reproduced rejection
of +180 while equivalent -180 was accepted. That failed single-case receipt is
retained as `antimeridian-before.tap`; the normalization is fixed. The final
12 cases overlap the initial run and are not 24 distinct cases.

The tests use the actual world request, immutable snapshot and readiness
functions with synthetic qualification records. They include technically ready
but sparse/wrong-location worlds, obsolete publication results, unavailable
checks, device/version mismatch, expiry, invalid arrivals and dateline bounds.
This is controlled component evidence. The policy is not yet a production launch
consumer, and no real destination/device certification, widget gameplay,
cross-device sync or live service check was performed.

Primary Android/Apple/Microsoft sources were consulted October 25, 2026. Apple's
HTML pages exposed a JavaScript shell, and the web reader rejected their linked
Markdown content type. The official Markdown pages were then fetched directly
and retained locally. Source content is reference material, not project policy.
No new SDK, dependency, native build, Hosting candidate, store submission or
deployment was made. Assets, player data and the released game remain intact.
