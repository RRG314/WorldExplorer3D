// One optional intention, using the existing activity, building and room systems.
export const SANDBOX_PATHS = Object.freeze({
  explore: {
    title: 'Explore this place', action: 'Find something nearby',
    steps: ['Choose a nearby field activity or a route.', 'Follow its world cues and finish the activity. For fieldwork, record the finding.', 'Open your Journal to review the result and return to its location.'],
    note: 'No purchase is needed. Tools explain their controls when you select them.'
  },
  build: {
    title: 'Make something here', action: 'Open block builder',
    steps: ['Find an open spot, then choose a shape and material in the block builder.', 'Place a block. Use Undo to correct it; add more when you are happy with the placement.', 'Review the building record in your Journal. Return to this location to keep building.'],
    note: 'Solo blocks save on this device. A home is optional; Homes & Property has its own ownership and storage controls.'
  },
  together: {
    title: 'Play together', action: 'Open multiplayer rooms',
    steps: ['Create a room or join one by code. Check its edit permissions before building.', 'Build together or finish a room activity. Joining a room alone does not finish this journey.', 'Review your shared action in the Journal. Keep the room code to return to the shared world.'],
    note: 'Room edits need a connection and permission. Your personal Journal stays on this device; it is separate from the shared room.'
  }
});
export function normalizeSandboxPath(path) {
  return Object.hasOwn(SANDBOX_PATHS, path) ? path : '';
}
export function resultMatchesSandboxPath(path, result = {}) {
  if (path === 'build') return ['building-milestone', 'creation-saved'].includes(result.eventType);
  if (path === 'together') return result.shared === true && ['building-milestone', 'activity-completed'].includes(result.eventType);
  if (path === 'explore') return ['discovery-recorded', 'specimen-collected', 'activity-completed', 'vehicle-route-completed', 'companion-befriended'].includes(result.eventType);
  return true;
}
