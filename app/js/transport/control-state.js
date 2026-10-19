// One interpretation of controller, occupancy and camera ownership. Controllers
// still own their state; consumers must not invent a different priority order.
const profile = (mode, locomotion, controller, camera, occupancy, frame = 'surface') =>
  Object.freeze({mode, locomotion, controller, camera, occupancy, frame});
const states = Object.freeze({
  ship: profile('walk', 'walk', 'walk', 'walk', 'ship-interior', 'ship-interior'),
  diver: profile('ocean', 'swim', 'ocean', 'ocean', 'water', 'ocean'),
  submarine: profile('ocean', 'submarine', 'ocean', 'ocean', 'pilot', 'ocean'),
  space: profile('rocket', 'rocket', 'space', 'space', 'pilot', 'space'),
  deck: profile('boat', 'walk', 'boat', 'research-deck', 'vessel-deck'),
  boat: profile('boat', 'boat', 'boat', 'boat', 'helm'),
  plane: profile('plane', 'plane', 'plane', 'plane', 'pilot'),
  drone: profile('drone', 'drone', 'drone', 'drone', 'remote'),
  swim: profile('walk', 'swim', 'walk', 'walk', 'water'),
  interior: profile('walk', 'walk', 'walk', 'walk', 'interior'),
  walk: profile('walk', 'walk', 'walk', 'walk', 'ground'),
  drive: profile('drive', 'drive', 'drive', 'drive', 'driver')
});
export function resolveControlState(context) {
  if (context.activeShipInterior) return states.ship;
  if (context.spaceFlight?.active) return states.space;
  if (context.oceanMode?.active) return context.oceanMode.diver?.active ? states.diver : states.submarine;
  if (context.boatMode?.active) return context.boatDeck?.active ? states.deck : states.boat;
  if (context.planeMode?.active) return states.plane;
  if (context.droneMode) return states.drone;
  if (context.Walk?.state?.mode === 'walk') {
    if (context.boatSwimming?.active || context.Walk.state.walker?.swimming) return states.swim;
    return context.activeInterior ? states.interior : states.walk;
  }
  return states.drive;
}
