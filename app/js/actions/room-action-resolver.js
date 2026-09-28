import { createInputSequenceLedger } from './input-sequence.js';
// Server simulation component, not an HTTP handler or an alternative inventory.
// Caller supplies admitted actors, server-owned poses, existing Backpack/condition
// objects and a collision query over the accepted room geometry. Firestore client
// presence is explicitly not a suitable source for these actor records.
const MAX_ACTORS = 32;
const MAX_PROJECTILES = 64;
const validVector = v => v && ['x', 'y', 'z'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
function directionOf(value) {
  if (!validVector(value)) return null;
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < .0001 || length > 2) return null;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}
function sphereDistance(origin, direction, center, radius) {
  const x = origin.x - center.x, y = origin.y - center.y, z = origin.z - center.z;
  const b = x * direction.x + y * direction.y + z * direction.z;
  const c = x*x + y*y + z*z - radius*radius;
  const discriminant = b*b - c;
  if (discriminant < 0) return Infinity;
  const far = -b + Math.sqrt(discriminant);
  return far < 0 ? Infinity : Math.max(0, -b - Math.sqrt(discriminant));
}
export function createRoomActionResolver({ worldId, getActors, firstObstacleDistance, isWorldReady, now }) {
  if (!worldId || ![getActors, firstObstacleDistance, isWorldReady, now].every(f => typeof f === 'function')) throw new TypeError('Trusted room simulation dependencies required');
  const receipts = createInputSequenceLedger(), projectiles = [], events = [];
  let disposed = false;
  const actors = () => getActors().slice(0, MAX_ACTORS);
  const active = actor => actor && actor.connected === true && actor.worldId === worldId &&
    actor.poseAuthority === 'room-simulation-v1' && typeof actor.epoch === 'string' && actor.epoch.length > 0 && validVector(actor.pose) && actor.inventory?.prepareUse && actor.condition?.applyImpact;
  const emit = event => { events.push(Object.freeze(event)); if (events.length > 128) events.shift(); };
  function impact(victim, force, sourceUid, actionId) {
    if (victim.condition.snapshot().incapacitated) return;
    const change = victim.condition.applyImpact(force, 'room-action');
    emit({ type: 'impact', actionId, sourceUid, targetUid: victim.uid, condition: change.after });
  }
  function obstruction(origin, direction, range) {
    const distance = firstObstacleDistance(origin, direction, range);
    // An unavailable/invalid geometry response blocks resolution rather than
    // turning a missing world into an unobstructed arena.
    return distance === Infinity ? range : Number.isFinite(distance) && distance >= 0 ? Math.min(range, distance) : 0;
  }
  function direct(origin, direction, range, force, sourceUid, actionId) {
    let nearest = obstruction(origin, direction, range), victim = null;
    for (const candidate of actors()) {
      if (!active(candidate) || candidate.uid === sourceUid || candidate.condition.snapshot().incapacitated) continue;
      const center = { x: candidate.pose.x, y: candidate.pose.y + 1, z: candidate.pose.z };
      const distance = sphereDistance(origin, direction, center, .55);
      if (distance < nearest) { nearest = distance; victim = candidate; }
    }
    if (victim) impact(victim, force, sourceUid, actionId);
    return victim?.uid || null;
  }
  function attempt(uid, input = {}) {
    if (disposed || !isWorldReady()) return { accepted: false, reason: 'world_not_ready' };
    const actor = actors().find(a => a.uid === uid);
    if (!active(actor)) return { accepted: false, reason: 'not_admitted' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { accepted: false, reason: 'invalid_attempt' };
    if (input.epoch !== actor.epoch || !Number.isSafeInteger(input.sequence) || input.sequence < 0 || input.sequence > 0x7fffffff) return { accepted: false, reason: 'invalid_sequence' };
    const ticket = receipts.lookup(uid, actor.epoch, input.sequence);
    if (ticket.receipt) return ticket.receipt;
    if (ticket.reason) return { accepted: false, reason: ticket.reason };
    const direction = directionOf(input.direction);
    if (!direction || Object.hasOwn(input, 'targetUid') || Object.hasOwn(input, 'damage') || Object.hasOwn(input, 'origin')) return { accepted: false, reason: 'invalid_attempt' };
    const time = now();
    if (!Number.isFinite(time) || time < 0) return { accepted: false, reason: 'invalid_clock' };
    const finish = ticket.commit;
    if (actor.condition.snapshot().incapacitated) return finish({ accepted: false, reason: 'incapacitated' });
    const equipment = actor.inventory.equipped();
    if (!equipment || !['unarmed', 'melee', 'sidearm', 'explosive'].includes(equipment.category)) return finish({ accepted: false, reason: 'unsupported_action' });
    if (equipment.category === 'explosive' && projectiles.length >= MAX_PROJECTILES) return finish({ accepted: false, reason: 'projectile_budget' });
    const prepared = actor.inventory.prepareUse(time);
    if (!prepared.ok) return finish({ accepted: false, reason: prepared.reason });
    const actionId = `${uid}:${actor.epoch}:${input.sequence}`;
    const origin = { x: actor.pose.x, y: actor.pose.y + 1, z: actor.pose.z };
    let targetUid = null;
    if (equipment.category === 'explosive') {
      projectiles.push({ actionId, sourceUid: uid, equipment, position: origin,
        velocity: { x: direction.x*equipment.projectileSpeed, y: direction.y*equipment.projectileSpeed, z: direction.z*equipment.projectileSpeed }, elapsed: 0 });
    } else {
      targetUid = direct(origin, direction, equipment.range, equipment.force, uid, actionId);
    }
    emit({ type: 'action', actionId, sourceUid: uid, category: equipment.category, equipmentId: equipment.id });
    return finish({ accepted: true, actionId, targetUid });
  }
  function step(dt) {
    if (disposed || !isWorldReady()) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > .05) throw new RangeError('Use fixed simulation steps at 20 Hz or faster');
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i];
      projectile.elapsed += dt;
      projectile.velocity.y -= 9.81 * dt;
      const speed = Math.hypot(...Object.values(projectile.velocity));
      const direction = { x: projectile.velocity.x/speed, y: projectile.velocity.y/speed, z: projectile.velocity.z/speed };
      const travel = speed * dt;
      const clear = obstruction(projectile.position, direction, travel);
      for (const axis of ['x','y','z']) projectile.position[axis] += direction[axis] * clear;
      if (clear < travel) projectile.velocity = { x: 0, y: 0, z: 0 };
      if (projectile.elapsed < projectile.equipment.fuseSeconds) continue;
      for (const candidate of actors()) {
        if (!active(candidate)) continue;
        const center = { x: candidate.pose.x, y: candidate.pose.y + 1, z: candidate.pose.z };
        const delta = { x: center.x-projectile.position.x, y: center.y-projectile.position.y, z: center.z-projectile.position.z };
        const distance = Math.hypot(delta.x,delta.y,delta.z), radius = projectile.equipment.blastRadius;
        if (distance > radius) continue;
        const direction = distance > .0001 ? { x: delta.x/distance, y: delta.y/distance, z: delta.z/distance } : { x: 0, y: 1, z: 0 };
        if (obstruction(projectile.position, direction, distance) < distance) continue;
        impact(candidate, projectile.equipment.force * (1-distance/radius), projectile.sourceUid, projectile.actionId);
      }
      emit({ type: 'detonation', actionId: projectile.actionId, position: { ...projectile.position } });
      projectiles.splice(i,1);
    }
  }
  return Object.freeze({ attempt, step, drainEvents: () => events.splice(0),
    snapshot: () => ({ worldId, projectiles: projectiles.length, pendingEvents: events.length, disposed }),
    releaseSession(uid, epoch) { return receipts.release(uid, epoch); },
    dispose() { disposed = true; projectiles.length = 0; events.length = 0; receipts.clear(); } });
}
