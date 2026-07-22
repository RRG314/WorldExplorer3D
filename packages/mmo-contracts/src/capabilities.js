const ROOM_ROLES = Object.freeze([
  'owner',
  'administrator',
  'builder',
  'player',
  'visitor'
]);

const CAPABILITIES = Object.freeze({
  ENTER: 'room.enter',
  CHAT: 'room.chat',
  INTERACT: 'world.interact',
  DRIVE: 'vehicle.drive',
  COMBAT: 'combat.use',
  BUILD: 'world.build',
  DEMOLISH: 'world.demolish',
  SPAWN_VEHICLE: 'vehicle.spawn',
  MANAGE_CLAIMS: 'world.claims.manage',
  MANAGE_ACTIVITIES: 'activity.manage',
  MANAGE_RULES: 'room.rules.manage',
  MODERATE: 'room.moderate',
  MANAGE_ROLES: 'room.roles.manage',
  ROLLBACK: 'room.rollback',
  DELETE_ROOM: 'room.delete'
});

const roleCapabilities = Object.freeze({
  visitor: Object.freeze([
    CAPABILITIES.ENTER,
    CAPABILITIES.CHAT,
    CAPABILITIES.INTERACT
  ]),
  player: Object.freeze([
    CAPABILITIES.ENTER,
    CAPABILITIES.CHAT,
    CAPABILITIES.INTERACT,
    CAPABILITIES.DRIVE,
    CAPABILITIES.COMBAT
  ]),
  builder: Object.freeze([
    CAPABILITIES.ENTER,
    CAPABILITIES.CHAT,
    CAPABILITIES.INTERACT,
    CAPABILITIES.DRIVE,
    CAPABILITIES.COMBAT,
    CAPABILITIES.BUILD,
    CAPABILITIES.DEMOLISH,
    CAPABILITIES.SPAWN_VEHICLE,
    CAPABILITIES.MANAGE_ACTIVITIES
  ]),
  administrator: Object.freeze(Object.values(CAPABILITIES).filter((value) => (
    value !== CAPABILITIES.DELETE_ROOM
  ))),
  owner: Object.freeze(Object.values(CAPABILITIES))
});

function normalizeRoomRole(value, fallback = 'visitor') {
  const role = String(value || '').trim().toLowerCase();
  return ROOM_ROLES.includes(role) ? role : fallback;
}

function capabilitiesForRole(role) {
  const normalized = normalizeRoomRole(role);
  return roleCapabilities[normalized] || roleCapabilities.visitor;
}

function roleHasCapability(role, capability) {
  return capabilitiesForRole(role).includes(String(capability || ''));
}

export {
  CAPABILITIES,
  ROOM_ROLES,
  capabilitiesForRole,
  normalizeRoomRole,
  roleHasCapability
};
