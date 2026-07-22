const PLAYER_MAX_HEALTH = 100;

const WEAPON_DEFINITIONS = Object.freeze({
  'weapon.sword': Object.freeze({
    id: 'weapon.sword', label: 'Field Sword', category: 'melee', damage: 35,
    rangeM: 3.2, cooldownMs: 650, aimDegrees: 100, unlockLevel: 1
  }),
  'weapon.bow': Object.freeze({
    id: 'weapon.bow', label: 'Recurve Bow', category: 'projectile', damage: 30,
    rangeM: 90, cooldownMs: 900, projectileSpeedMps: 48, lifetimeSec: 3, unlockLevel: 2
  }),
  'weapon.pistol': Object.freeze({
    id: 'weapon.pistol', label: 'Service Pistol', category: 'hitscan', damage: 22,
    rangeM: 55, cooldownMs: 280, aimDegrees: 18, unlockLevel: 3
  })
});

const MISSION_DEFINITIONS = Object.freeze({
  'mission.explore.local': Object.freeze({
    id: 'mission.explore.local', label: 'Local Explorer', metric: 'distanceWalkedM',
    target: 250, rewardXp: 120, rewardCredits: 60, cadence: 'daily'
  }),
  'mission.drive.route': Object.freeze({
    id: 'mission.drive.route', label: 'Road Trip', metric: 'distanceDrivenM',
    target: 1500, rewardXp: 180, rewardCredits: 90, cadence: 'daily'
  }),
  'mission.build.foundation': Object.freeze({
    id: 'mission.build.foundation', label: 'Build a Foundation', metric: 'objectsPlaced',
    target: 5, rewardXp: 140, rewardCredits: 70, cadence: 'once'
  }),
  'mission.combat.first': Object.freeze({
    id: 'mission.combat.first', label: 'First Victory', metric: 'eliminations',
    target: 1, rewardXp: 160, rewardCredits: 80, cadence: 'once'
  })
});

function levelForXp(value) {
  const xp = Math.max(0, Math.floor(Number(value) || 0));
  return Math.min(100, Math.floor(Math.sqrt(xp / 250)) + 1);
}

function weaponsForLevel(value) {
  const level = Math.max(1, Math.floor(Number(value) || 1));
  return Object.values(WEAPON_DEFINITIONS)
    .filter((weapon) => weapon.unlockLevel <= level)
    .map((weapon) => weapon.id);
}

export {
  MISSION_DEFINITIONS,
  PLAYER_MAX_HEALTH,
  WEAPON_DEFINITIONS,
  levelForXp,
  weaponsForLevel
};
