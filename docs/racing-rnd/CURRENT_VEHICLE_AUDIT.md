# Current vehicle audit

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

| System | Actual owner/evidence | Assessment |
|---|---|---|
| Controls | `controls/`, `physics.js`, `transport/control-state.js` | One action reader and current controller. Touch steering/pedals/tilt already exist; do not replace them. |
| Handling | `physics.js`, `physics/vehicle-config.js`, `engine/vehicle-catalog.js` | Custom arcade longitudinal/lateral velocity, slip, steering, yaw and brake/grip profiles. No validated engine torque curve, gear train or tyre thermal model. |
| Support | `world/surface-contract.js`, `engine/vehicle-road-attitude.js`, `physics/road-vehicle-airborne.js` | Canonical road/terrain contact and landing. Bridges/tunnels require layer-aware support; a blanket terrain-height clamp would break them. |
| Fleet | `assets/model-asset-catalog.js`, `urban-sandbox/curated-traffic-vehicle.js` | Default BMW plus14 enterable world categories, five detailed licensed models. Models are visuals, not imported physics. |
| Upgrades | `transport/vehicle-upgrades.js`, existing commerce receipts | Four upgrades actually change acceleration, braking, grip, recovery/landing protection. Legacy identities must survive. |
| Collection | Baseline had no permanent garage | New `vehicle-garage-rules.js` consumes existing wallet/Backpack atomic local saves or account `gameplay/vehicleUpgrades`. No second wallet/inventory. |
| Selection | Baseline Travel Drive selected no alternative car | New owned-car selector stages the matching GLB before mounting through urban/session owners. Failure keeps the old car. |
| Damage | `urban-sandbox/crash-physics.js`, `transport/damage-model.js` | Baseline force-to-health too harsh on small contacts; damage material styling repeated even without health change. Corrected crush curve and change-only presentation. |
| Traffic | `living-world/population.js`, navigation graphs, traffic signals | Baseline3.2m following gap could overlap5.7m cars; crossing/connector motion lacked chassis clearance. New dimension-aware swept footprints and upstream yielding. |
| Cars/property | `game/property-ui.js`, property authority | Home assignment must verify actual ownership. Vehicle storage is collection custody, not spawning a car inside a furnished room. |
| Multiplayer | `multiplayer/presence.js`, room authority | Casual presence heartbeat2500ms, minimum writes2250ms; room vehicle lease heartbeat1000ms. Unsuitable as competitive race timing. |
| Records | `leaderboards/catalog.js`, activity-specific publishers | Existing activity boards mostly disclose player-reported results. A racing category must distinguish personal/unverified from server-verified records. |
| Audio/camera | current audio, HUD and `hud/vehicle-camera-body.js` | Existing chase/cockpit and effects remain. RPM/transmission sound cannot be accurately driven by nonexistent gears. |

Free-roam correctness comes before racing. Road vehicles remain useful for exploration, transport and everyday collection; classes such as buses and delivery vans must not be forced into sports-car events. Read the implementation plan for migration boundaries and the release record for actual acceptance status.
