import {
  MISSION_DEFINITIONS,
  WEAPON_DEFINITIONS,
  levelForXp,
  weaponsForLevel
} from '@we3d/mmo-contracts';

const STAT_KEYS = Object.freeze([
  'distanceWalkedM',
  'distanceDrivenM',
  'objectsPlaced',
  'eliminations',
  'deaths',
  'missionsCompleted'
]);

function finiteCount(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizeStats(input = {}) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, finiteCount(input?.[key])]));
}

function normalizeMission(input, stats) {
  const definition = MISSION_DEFINITIONS[String(input?.id || '')];
  if (!definition) return null;
  const baseline = Math.max(0, Number(input?.baseline) || 0);
  const progress = Math.max(0, Math.min(definition.target, finiteCount(stats[definition.metric]) - baseline));
  return { id: definition.id, baseline, progress };
}

function normalizeMissionCompletions(input = {}) {
  const result = {};
  for (const id of Object.keys(MISSION_DEFINITIONS)) {
    const saved = input?.[id];
    const count = Math.max(0, Math.floor(Number(saved?.count) || 0));
    const lastCompletedAtMs = Math.max(0, Number(saved?.lastCompletedAtMs) || 0);
    if (count || lastCompletedAtMs) result[id] = { count, lastCompletedAtMs };
  }
  return result;
}

function startOfUtcDay(now) {
  const date = new Date(Math.max(0, Number(now) || 0));
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function missionEligibility(profile, mission, now = Date.now()) {
  const definition = typeof mission === 'string' ? MISSION_DEFINITIONS[mission] : mission;
  if (!definition) return { available: false, reason: 'unknown_mission', nextAvailableAtMs: 0 };
  const completion = profile?.missionCompletions?.[definition.id] || { count: 0, lastCompletedAtMs: 0 };
  if (definition.cadence === 'once' && completion.count > 0) {
    return { available: false, reason: 'completed', nextAvailableAtMs: 0 };
  }
  if (definition.cadence === 'daily' && completion.count > 0 && completion.lastCompletedAtMs >= startOfUtcDay(now)) {
    return { available: false, reason: 'daily_complete', nextAvailableAtMs: startOfUtcDay(now) + 86400000 };
  }
  return { available: true, reason: '', nextAvailableAtMs: 0 };
}

function recordMissionCompletion(profile, missionId, now = Date.now()) {
  const id = String(missionId || '');
  if (!MISSION_DEFINITIONS[id]) return null;
  const previous = profile.missionCompletions[id] || { count: 0, lastCompletedAtMs: 0 };
  const completion = {
    count: Math.max(0, Math.floor(Number(previous.count) || 0)) + 1,
    lastCompletedAtMs: Math.max(0, Number(now) || Date.now())
  };
  profile.missionCompletions[id] = completion;
  return completion;
}

function createPlayerProfile(uid, input = {}) {
  const xp = Math.max(0, Math.floor(Number(input.xp) || 0));
  const level = levelForXp(xp);
  const stats = normalizeStats(input.stats);
  const unlockedWeapons = weaponsForLevel(level);
  const requestedWeapon = String(input.equippedWeapon || 'weapon.sword');
  return {
    version: 2,
    uid: String(uid || input.uid || ''),
    xp,
    level,
    credits: Math.max(0, Math.floor(Number(input.credits) || 0)),
    equippedWeapon: unlockedWeapons.includes(requestedWeapon) ? requestedWeapon : unlockedWeapons[0],
    unlockedWeapons,
    stats,
    activeMission: normalizeMission(input.activeMission, stats),
    missionCompletions: normalizeMissionCompletions(input.missionCompletions),
    updatedAtMs: Math.max(0, Number(input.updatedAtMs) || Date.now())
  };
}

function awardProfile(profile, { xp = 0, credits = 0 } = {}) {
  profile.xp += Math.max(0, Math.floor(Number(xp) || 0));
  profile.credits += Math.max(0, Math.floor(Number(credits) || 0));
  profile.level = levelForXp(profile.xp);
  profile.unlockedWeapons = weaponsForLevel(profile.level);
  if (!profile.unlockedWeapons.includes(profile.equippedWeapon)) {
    profile.equippedWeapon = profile.unlockedWeapons[0];
  }
  profile.updatedAtMs = Date.now();
  return profile;
}

function profileForStorage(profile) {
  return structuredClone({ ...profile, updatedAtMs: Date.now() });
}

function leaderboardRow(profile, displayName = '') {
  return {
    uid: profile.uid,
    displayName: String(displayName || profile.uid).slice(0, 80),
    level: profile.level,
    xp: profile.xp,
    credits: profile.credits,
    eliminations: Math.floor(profile.stats.eliminations),
    missionsCompleted: Math.floor(profile.stats.missionsCompleted)
  };
}

export {
  STAT_KEYS,
  awardProfile,
  createPlayerProfile,
  leaderboardRow,
  missionEligibility,
  normalizeMissionCompletions,
  normalizeStats,
  profileForStorage,
  recordMissionCompletion
};
