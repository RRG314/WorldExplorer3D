# Racing UI and experience

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Use the owner-selected Roam/ConceptB tokens,typography,panels and contextual prompts. Three progression proposals are in `design-preview/racing/`; they are a review UI,not a production racing mode.

Planned entries: main menu Racing and in-world activity entry. Hub: nearby qualified events,garage and creator. Garage: one owned collection,correct vehicle image/model,condition,real installed parts,home custody and clear unavailable/busy errors. Event: geographic map,route coverage,class/build eligibility and assists. Lobby:roster/ready/status/admission;countdown/finish andresults remain server-owned.

Race HUD should prioritize next turn,laps/time,position and recovery. Preserve navigation,readable speed and unobscured road. Do not add a tachometer or gear display until those quantities exist in the controller. Portrait uses thumb-reachable controls and collapsed supporting panels;landscape avoids piling event UI onto both steering and throttle. Native dialog semantics,44px controls,focus return,Escape and reduced effects apply to garage and race panels.

Validation: a new player must find Racing,choose a non-sports starter,enter an event,understand a blocked course,change builds legally,finish,inspect evidence scope and return to exploration. Attractive mockups alone do not pass that journey.

Current practice uses the existing ScreenLayout activity owner for its compact
race HUD, scoped to the race lifecycle. It shows time, position, ordered gate/lap,
speed and condition; it keeps touch controls and Main Menu available and restores
the ordinary exploration HUD on exit. A replacement activity layer cannot be
cleared by late race teardown. The native result dialog scrolls standings and
feedback while keeping retry/race/return actions visible. This was refined from
actual city landscape overlap and checked in a controlled same-city composition
and current-source three-participant browser integration. Major-venue references
in the separate design preview remain explicitly unbuilt, not working game UI.
