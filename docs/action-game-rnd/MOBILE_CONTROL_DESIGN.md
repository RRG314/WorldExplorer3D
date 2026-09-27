# Mobile control design

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Preserve existing touch-authority ownership and semantic actions. Movement and look require independent pointers; aim/action must not steal a joystick pointer. Inventory/dialog focus cancels active gameplay input. Handle pointercancel, visibility loss, orientation change and returning from menu as releases, not stuck controls.

Use the same action state machine on touch and desktop. A single contextual primary action reflects equipped item and game mode. Secondary aim, quick slots and interaction have stable locations with safe-area clearance. Avoid adding a separate row of buttons for every item. Switching into vehicle controls must release walking aim/action before acquiring vehicle input.

Verification matrix: move + look, move + aim + action, quick-slot change, interaction while near equipment, bag open/close, vehicle enter/exit, chat focus, room join/reconnect, world load, screen rotation and menu return. Assert semantic state and visible feedback, not just clickable DOM elements.

Browser mobile emulation can check layout and pointer logic. It cannot certify physical phone responsiveness, multi-touch ergonomics, thermal throttling or safe-area behavior on every device. No physical touch test has been completed for this new capability. User previously offered to test later; do not record that as a pass.
