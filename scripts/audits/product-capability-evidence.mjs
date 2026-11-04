// Contributor audit metadata stays outside the shipped application.
// These notes describe recorded evidence, not player-visible feature promises.
const records = {
  "public-cameras": {
    "owner": "app/js/live-earth/public-camera-ui.js",
    "acceptance": "Actual Fintraffic/Caltrans imagery, wall, IndexedDB favorites/reload, no-reward Journal, failed-image retry and phone viewport verified locally; physical-device acceptance remains. See LIVE-EARTH-CAMERAS.md."
  },
  "maps": {
    "owner": "app/js/map.js"
  },
  "sharing": {
    "owner": "app/js/ui/share-links.js"
  },
  "account": {
    "owner": "account/account-center.js"
  },
  "controls": {
    "owner": "app/js/ui/accessibility.js"
  },
  "graphics": {
    "owner": "app/js/perf-settings.js"
  },
  "earth": {
    "owner": "app/js/world.js"
  },
  "walk": {
    "owner": "app/js/walking.js"
  },
  "drive": {
    "owner": "app/js/physics.js"
  },
  "drone": {
    "owner": "app/js/travel-mode.js"
  },
  "plane": {
    "owner": "app/js/plane-mode.js"
  },
  "boat": {
    "owner": "app/js/boat-mode.js"
  },
  "ocean": {
    "owner": "app/js/ocean.js",
    "acceptance": "P10–P12: local voyage, regional habitat and complete research-outing browser checks passed. Broader biomes and physical-device release acceptance remain."
  },
  "swimming": {
    "owner": "app/js/walking.js"
  },
  "research-ship": {
    "owner": "app/js/boat-mode/research/runtime.js"
  },
  "moon": {
    "owner": "app/js/planetary/entry.js"
  },
  "mars": {
    "owner": "app/js/planetary/mars-world.js"
  },
  "space": {
    "owner": "app/js/space.js"
  },
  "solis": {
    "owner": "app/js/expedition/runtime.js"
  },
  "fishing": {
    "owner": "app/js/fishing-game.js"
  },
  "flowers": {
    "owner": "app/js/flower-challenge.js"
  },
  "paint-town": {
    "owner": "app/js/game/paint-town/core.js"
  },
  "deflock": {
    "owner": "app/js/deflock/runtime.js"
  },
  "journal": {
    "owner": "app/js/discovery/profile-store.js"
  },
  "backpack": {
    "owner": "app/js/player/backpack-store.js"
  },
  "companions": {
    "owner": "app/js/discovery/companion-runtime.js"
  },
  "rooms": {
    "owner": "app/js/multiplayer/ui-room-events.js"
  },
  "economy": {
    "owner": "app/js/economy/connected-wallet-authority.js"
  },
  "blocks": {
    "owner": "app/js/blocks.js"
  },
  "property": {
    "owner": "app/js/real-estate.js"
  },
  "capture": {
    "owner": "app/js/reality-capture/runtime.js"
  },
  "gps": {
    "owner": "app/js/live-gps/runtime.js"
  },
  "ar": {
    "owner": "app/js/ar/capabilities.js"
  },
  "weather": {
    "owner": "app/js/water-dynamics.js"
  },
  "route:": {
    "owner": "app/js/activity-discovery/session.js"
  },
  "field:": {
    "owner": "app/js/discovery/field-activities.js"
  },
  "tool:": {
    "owner": "app/js/discovery/tools.js"
  },
  "layer:": {
    "owner": "app/js/live-earth/registry.js"
  }
};
const defaultAcceptance = 'Source-reviewed; complete current player-journey acceptance is still pending.';
export function capabilityAuditEvidence(id) {
  const record = records[id] || records[String(id).split(':', 1)[0] + ':'];
  if (!record) throw new Error('Missing capability audit owner: ' + id);
  return { owner: record.owner, acceptance: record.acceptance || defaultAcceptance };
}
