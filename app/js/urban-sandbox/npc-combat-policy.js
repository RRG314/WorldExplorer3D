const NPC_WEAPON_PROFILES = Object.freeze({
  'compact-sidearm': Object.freeze({ label: 'Compact sidearm', projectileKind: 'pulse', projectileSpeed: 55, range: 38, force: 14, intervalMs: 1450 }),
  'laser-gun': Object.freeze({ label: 'Laser gun', projectileKind: 'laser', projectileSpeed: 82, range: 46, force: 17, intervalMs: 1180 }),
  'paintball-gun': Object.freeze({ label: 'Paintball gun', projectileKind: 'paintball', projectileSpeed: 42, range: 32, force: 7, intervalMs: 920 })
});

const NPC_COMBAT_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  ALERT: 'ALERT',
  FLEE: 'FLEE',
  DEFEND: 'DEFEND',
  COMBAT: 'COMBAT',
  DOWN: 'DOWN',
  RECOVER: 'RECOVER'
});

function beginNpcDefense(npc = {}, at = 0, destroyed = false) {
  if (!npc.heldEquipment || !NPC_WEAPON_PROFILES[npc.heldEquipment] || destroyed) return null;
  const current = Math.max(0, Number(at) || 0);
  return Object.freeze({
    hostileUntil: current + 14000,
    nextShotAt: Math.max(Number(npc.nextShotAt || 0), current + 520),
    reaction: 'defending'
  });
}

function beginNpcResponse(npc = {}, at = 0, destroyed = false) {
  const current = Math.max(0, Number(at) || 0);
  if (destroyed || Number(npc.condition ?? 1) <= .05) {
    return Object.freeze({
      hostileUntil: 0,
      nextShotAt: 0,
      reaction: 'downed',
      combatState: NPC_COMBAT_STATES.DOWN,
      combatStateUntil: Infinity
    });
  }
  const defense = beginNpcDefense(npc, current, false);
  if (defense) {
    return Object.freeze({
      ...defense,
      combatState: NPC_COMBAT_STATES.DEFEND,
      combatStateUntil: defense.hostileUntil
    });
  }
  return Object.freeze({
    hostileUntil: 0,
    nextShotAt: 0,
    reaction: 'fleeing',
    combatState: NPC_COMBAT_STATES.FLEE,
    combatStateUntil: current + 6000
  });
}

function resolveNpcCombatState(npc = {}, at = 0, options = {}) {
  const current = Math.max(0, Number(at) || 0);
  if (Number(npc.condition ?? 1) <= .05) return NPC_COMBAT_STATES.DOWN;
  if (Number(npc.knockdownUntil || 0) > current || npc.reaction === 'knocked-down') return NPC_COMBAT_STATES.RECOVER;
  if (Number(npc.hostileUntil || 0) > current) {
    return Number(npc.shotsFired || 0) > 0 ? NPC_COMBAT_STATES.COMBAT : NPC_COMBAT_STATES.DEFEND;
  }
  if (npc.combatState === NPC_COMBAT_STATES.FLEE && Number(npc.combatStateUntil || 0) > current) {
    return NPC_COMBAT_STATES.FLEE;
  }
  if (options.alert === true) return NPC_COMBAT_STATES.ALERT;
  return NPC_COMBAT_STATES.NORMAL;
}

function npcFireDecision(npc = {}, actor = null, at = 0, options = {}) {
  const profile = NPC_WEAPON_PROFILES[npc.heldEquipment];
  const current = Math.max(0, Number(at) || 0);
  if (!profile || !actor || options.multiplayer === true || options.walking === false) return null;
  if (Number(npc.condition ?? 1) <= .05 || Number(npc.hostileUntil || 0) <= current) return null;
  const x = Number(npc.x || 0);
  const z = Number(npc.z || 0);
  const distance = Math.hypot(Number(actor.x || 0) - x, Number(actor.z || 0) - z);
  const ready = distance >= 4 && distance <= profile.range && current >= Number(npc.nextShotAt || 0);
  const cadenceOffset = [...String(npc.id || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 180;
  return Object.freeze({
    profile,
    distance,
    ready,
    yaw: Math.atan2(Number(actor.x || 0) - x, Number(actor.z || 0) - z),
    nextShotAt: current + profile.intervalMs + cadenceOffset
  });
}

export { NPC_COMBAT_STATES, NPC_WEAPON_PROFILES, beginNpcDefense, beginNpcResponse, npcFireDecision, resolveNpcCombatState };
