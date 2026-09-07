# Onboarding, controls, notices, and accessibility

## Product rule

World Explorer teaches the smallest useful loop, then gets out of the way. The
First Journey is optional and has three steps:

1. move and look;
2. use one nearby door, person, parked vehicle, or object;
3. choose any adventure from Explorer, Travel, Build, water, aircraft, or Space.

It does not require the player to sample every system or complete a field record.
Deeper help remains available in Explorer, Controls, and Settings. Optional
system tips appear once when the player first enters that system.

This follows the platform pattern of short, optional, interactive onboarding
rather than an exhaustive tour. See Apple’s
[Onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding).

## Notice priority

Only the highest useful layer should occupy the play view.

| Priority | Layer | Rule |
| --- | --- | --- |
| 1 | Immediate context action | A usable door, vehicle, person, item, or field subject within its real action range |
| 2 | Active activity or mission | Persistent only while the player has deliberately started it |
| 3 | First Journey | Compact lower-right guidance; hidden while an immediate action or panel needs attention |
| 4 | Nearby suggestion | Within 45 m, dismissible, and normally expires after about seven seconds |

Immediate prompts use the lower-right desktop zone and the area above the touch
deck on phones. They suppress broader nearby suggestions instead of stacking.
Building entry requires a published exterior entrance and a 3.25 m door approach.
Parked-vehicle entry requires the driver-door approach within 2.8 m. Familiar
interaction families collapse after their first successful use.

Status changes use polite, atomic live-region semantics so they do not interrupt
assistive-technology speech. This follows the WAI-ARIA
[`status` role](https://www.w3.org/WAI/ARIA/apg/patterns/alert/) behavior.

## One action authority across devices

`controls/keyboard-bindings.js` owns saved keyboard actions. The same action
identities feed movement, panels, prompts, First Journey copy, Earth vehicles,
aircraft, boats, Space flight, and touch-button fallbacks. Reassigning an occupied
key swaps the two actions, preventing ambiguous double bindings. Reserved pause,
diagnostic, and quick-slot keys cannot be captured.

Defaults use WASD movement, world-drag camera while walking, E context action, Space primary,
Shift modifier, C camera, Q rear view, and visible Travel controls. Arrow keys
remain a complete movement/flight alternate. F cycles the primary Character,
BMW, Plane, and Drone modes; H opens a mapped mechanic only when one is nearby.
The Travel menu remains the direct mode chooser, and Shift+N retains the
deliberate next-city shortcut.

Gamepad input is action-based: left stick moves or steers, right stick looks, A is
the primary movement action, X is context interaction, D-pad Up opens the Backpack,
LB changes camera, View opens the map, and Menu pauses. Phone and tablet controls
use separate analog move/look pads, configurable handedness, sensitivity, and
camera recentering. Touch camera gestures do not impersonate keyboard keys.

This action/action-set approach matches Steam Input’s
[action-based model](https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_devs)
and Xbox’s requirement that remapped actions and their displayed prompts stay in
sync in [XAG 107](https://learn.microsoft.com/gaming/accessibility/xbox-accessibility-guidelines/107).

Activity-specific controls remain intentionally scoped: fishing rod/reel keys,
numbered quick slots, and developer diagnostics are fixed inside those focused
contexts. A remapped world action is blocked from leaking through an open activity.

## Accessibility settings

The dark Controls workspace contains one saved accessibility panel with:

- text scaling at 100%, 115%, 130%, 160%, or 200%;
- standard, longer, or persistent nearby notices;
- standard or large aiming reticle;
- reduced interface motion, including the operating-system preference;
- reduced flashes and full-screen crash pulses;
- increased contrast;
- an option to keep full descriptions after an interaction becomes familiar;
- a dedicated accessibility reset independent of mobile-control reset.

Browser zoom remains enabled. Interactive controls retain visible focus, modal
focus is contained and restored, status regions have accessible names, and coarse
pointer targets are at least 44 px. The implementation is informed by WCAG 2.2
guidance for [resizable text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html),
[animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions),
and [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Connected-system constraints

- Mouse camera changes are mode-specific for walking, cars, boats, planes, and drones.
- Changing desktop movement bindings cannot turn a phone look gesture into movement.
- Input is cleared on panel, pause, and travel-mode transitions, including custom keys.
- Door and vehicle prompts consume existing entrance and driver-door authorities.
- Terrain and road contact remain owned by the existing surface systems.
- Tutorial and nearby-notice state are device-local preferences and do not change gameplay progression.

## Verification

The current implementation is covered by focused module tests plus live browser
journeys for saved remapping, real actor movement, tutorial progression, immediate
prompt priority, desktop/mobile layout, keyboard-only operation, focus containment,
44 px touch targets, walking/driving/plane touch cameras, vehicle surface contact,
multi-city traffic, and terrain-boundary continuity. Production deployment is a
separate operation and is not performed by this work.
