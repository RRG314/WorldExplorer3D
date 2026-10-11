# Navigation proposal — October 11

Open `index.html` in this folder to try the layout. This is an interactive design
study over a released game image; it does not replace the game, alter saves,
or claim to implement its sample journeys. Desktop and phone layouts are included.

## Decision

Keep the visual identity and reduce competing entry points. Show four primary
choices: **Explore, Journeys, Journal, Create**. Put account, controls, settings and
social management under Menu. Keep an immediately available contextual action
near the bottom of the view. A person can continue free roam without enrolling in
a career or dismissing repeated onboarding.

The current interface groups Journal under Backpack, puts several travel modes
under Explore, and has separate travel, mission, marine and activity panels. This
makes players learn the implementation categories. The proposal groups actions
by the player's intention and retains the existing implementation owners.

| Player intention | Proposed location | Existing owner or entry |
| --- | --- | --- |
| Choose a place, coordinates or current location | Explore → Places & map | Globe selector, location selection, Live GPS |
| Change movement or board nearby transport | Explore → How to travel | Shared travel mode, active actor, boarding interactions |
| Find a guided first step | Journeys | Existing campaign catalogue and current journey card |
| See discoveries, earned badges and return to a voyage | Journal | Existing Journal, guide and profile stores |
| Equip items or tools | Context action + Explore → Equipment | Existing Backpack and equipment authority |
| Build blocks or manage a home | Create | Existing room permissions, block and property authorities |
| Join others or invite a friend | Menu → People & rooms | Existing multiplayer room flow |
| Find key bindings or change accessibility options | Menu → Controls & accessibility | Existing controls panel and accessibility settings |
| See cameras, weather or observed events | Explore → Live Earth | Existing attributed Live Earth registry |

The prototype's four Explore results are a layout sample, not a replacement
capability registry. Implementation must populate available actions from existing
catalogues and environment admission. No new save, travel, reward or room owner.

## Layout rules

- Top left: location, active mode and only the measurements useful to that mode.
  Driving needs speed; a diver needs depth/air; an interior walk needs neither a
  large speedometer nor stale outdoor weather. Keep detail expandable.
- One tracked objective, with a plain next step and an option to stop tracking.
  Do not simultaneously show a career card, a voyage card and a tutorial covering
  the same next action. Existing objective arbitration remains the authority.
- One contextual action, supplied by the current interaction resolver. Nearby
  doors, helm, cradle, water entry and cockpit controls take priority over generic
  vehicle selection. Show why an action is unavailable.
- One active panel. Desktop uses a left drawer; phones use a bounded lower sheet.
  Suspend conflicting camera/input actions while a panel is focused. Restore focus
  and the prior simulation pause owner on close, Escape and environment changes.
- On phones, hide the objective while a navigation sheet is open. Keep touch
  movement and action zones distinct; do not place a panel under the thumb controls.
- Preserve the existing minimap as a collapsible navigation instrument. The study
  shows its proposed entry point; it does not remove the map renderer.
- Use semantic buttons, labels, visible focus, native keyboard navigation and at
  least 44-pixel touch targets. A search field must not swallow the first Escape.
  Announce changed objective/save status without narrating every game frame.

## Finite implementation and acceptance

1. Map every existing menu action to the table above, including activities,
   companions, camera/capture, shared rooms, equipment and accessibility. Keep a
   parity check of action IDs; no disappearing feature during the reorganization.
2. Move entry points through the existing screen-layout service. Keep original
   action callbacks and save ownership. Convert clickable `div` menu items to
   buttons as they move. Retain a recoverable feature flag for the navigation
   transition, without duplicating panels or input listeners.
3. Prove Earth walk/drive/flight, research deck/sub/diver, ship interior, space,
   planetary travel and room editing. Check one-panel exclusivity, keyboard and
   phone input, environment changes, closing during loading, reconnect, reload,
   text scaling and reduced motion. Keep the native HUD until parity passes.
4. Capture the actual new HUD only after adoption. The design study must never
   appear in a gameplay gallery as a screenshot of the running product.

## Verification

`output/facilities-20261011/navigation/report.json` records the actual dialog and
prototype checks. Desktop/phone captures are separate from gameplay evidence.
The prototype tests search, journey selection, objective tracking, free-roam
return, focus restoration and a bounded phone sheet. It is not a usability study
with new players and is not yet the production HUD.
