import { FIELD_DISCOVERY_CATALOG } from './catalog.js?v=1';

const WALKING_ENCOUNTER_SCHEMA_VERSION = 1;

function distanceBetween(left = {}, right = {}) {
  return Math.hypot(
    Number(left.x || 0) - Number(right.x || 0),
    Number(left.z || 0) - Number(right.z || 0)
  );
}

function bearingTo(position = {}, target = {}) {
  const radians = Math.atan2(
    Number(target.x || 0) - Number(position.x || 0),
    Number(target.z || 0) - Number(position.z || 0)
  );
  return (radians * 180 / Math.PI + 360) % 360;
}

function leadPresentation(slot = {}) {
  const discovery = FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === slot.catalogId);
  const family = String(discovery?.family || 'field-record');
  if (/wildlife|animal|bird/.test(family)) return { kind: 'wildlife', label: 'Wildlife sign', tone: 'nature' };
  if (/botany|plant|fung/.test(family)) return { kind: 'botany', label: 'Plant life', tone: 'nature' };
  if (/rock|mineral|sediment|fossil|gem|ore|metal/.test(family)) return { kind: 'earth-science', label: 'Earth science trace', tone: 'earth' };
  if (/beach|shore|ocean|water/.test(family)) return { kind: 'shoreline', label: 'Shoreline lead', tone: 'water' };
  if (/place|urban|history/.test(family)) return { kind: 'place', label: 'Place clue', tone: 'place' };
  return { kind: 'field', label: slot.activityLabel || 'Field lead', tone: 'field' };
}

function slotRichnessPenalty(slot = {}) {
  const discovery = FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === slot.catalogId);
  const family = String(discovery?.family || '');
  if (/wildlife|animal|bird|botany|plant|fung|rock|mineral|sediment|fossil|beach/.test(family)) return 0;
  if (slot.catalogId === 'area-survey-note') return 90;
  return 32;
}

function createWalkingEncounterDirector(options = {}) {
  const plan = options.plan;
  if (plan?.type !== 'FieldActivityPlan') throw new TypeError('Walking encounters require a FieldActivityPlan.');
  const claimedIds = options.claimedIds instanceof Set ? options.claimedIds : new Set(options.claimedIds || []);
  const canUseSlot = typeof options.canUseSlot === 'function' ? options.canUseSlot : () => true;
  const initialDelaySeconds = Math.max(0, Number(options.initialDelaySeconds) || 2.5);
  const fallbackDelaySeconds = Math.max(initialDelaySeconds, Number(options.fallbackDelaySeconds) || 6);
  const requiredWalkMeters = Math.max(0, Number(options.requiredWalkMeters) || 4);
  const cooldownSeconds = Math.max(0, Number(options.cooldownSeconds) || 24);
  const maxLeadDistance = Math.max(30, Number(options.maxLeadDistance) || 145);
  const suppressedSlotIds = new Set();
  let elapsed = 0;
  let walkedMeters = 0;
  let cooldown = 0;
  let previousPosition = null;
  let current = null;
  let lastActivityId = '';
  let revision = 0;

  function availableSlots(position) {
    return plan.slots
      .filter((slot) => !claimedIds.has(slot.claimId))
      .filter((slot) => !suppressedSlotIds.has(slot.id))
      .filter((slot) => canUseSlot(slot) === true)
      .map((slot) => ({ slot, distance: distanceBetween(position, slot.position) }))
      .filter((entry) => entry.distance <= maxLeadDistance)
      .sort((left, right) => {
        const leftScore = left.distance + slotRichnessPenalty(left.slot) + (left.slot.activityId === lastActivityId ? 45 : 0);
        const rightScore = right.distance + slotRichnessPenalty(right.slot) + (right.slot.activityId === lastActivityId ? 45 : 0);
        return leftScore - rightScore || left.slot.id.localeCompare(right.slot.id);
      });
  }

  function clear(reason = 'cleared') {
    if (current) revision += 1;
    current = null;
    return String(reason || 'cleared');
  }

  function update(input = {}) {
    const dt = Math.max(0, Math.min(1, Number(input.dt) || 0));
    const position = input.position || { x: 0, z: 0 };
    cooldown = Math.max(0, cooldown - dt);
    const walkingEarth = input.walking === true && input.earth === true;
    const cadenceEligible = walkingEarth && input.blocked !== true && input.operationActive !== true;
    if (cadenceEligible) elapsed += dt;
    if (cadenceEligible && previousPosition) {
      const segment = distanceBetween(position, previousPosition);
      if (segment <= 25) walkedMeters += segment;
    }
    previousPosition = { x: Number(position.x || 0), z: Number(position.z || 0) };

    if (!walkingEarth) {
      elapsed = 0;
      walkedMeters = 0;
    }
    if (!cadenceEligible) {
      clear('walking-ineligible');
      return snapshot(position, input.liveGpsActive === true);
    }
    if (cooldown > 0) return snapshot(position, input.liveGpsActive === true);

    if (current) {
      const stillAvailable = !claimedIds.has(current.slot.claimId) && canUseSlot(current.slot) === true;
      const distance = distanceBetween(position, current.slot.position);
      if (!stillAvailable || distance > maxLeadDistance * 1.25) clear('lead-stale');
    }
    const cadenceReady = elapsed >= fallbackDelaySeconds || (elapsed >= initialDelaySeconds && walkedMeters >= requiredWalkMeters);
    if (!current && cadenceReady) {
      const candidate = availableSlots(position)[0];
      if (candidate) {
        current = { slot: candidate.slot, presentation: leadPresentation(candidate.slot) };
        revision += 1;
      }
    }
    return snapshot(position, input.liveGpsActive === true);
  }

  function accept(position = {}, liveGpsActive = false) {
    if (!current) return null;
    const accepted = snapshot(position, liveGpsActive);
    lastActivityId = current.slot.activityId;
    suppressedSlotIds.add(current.slot.id);
    current = null;
    elapsed = 0;
    walkedMeters = 0;
    cooldown = cooldownSeconds;
    revision += 1;
    return accepted;
  }

  function reject(slotId = current?.slot?.id) {
    if (slotId) suppressedSlotIds.add(String(slotId));
    clear('lead-rejected');
    cooldown = Math.min(cooldownSeconds, 8);
    return true;
  }

  function snapshot(position = previousPosition || {}, liveGpsActive = false) {
    const slot = current?.slot;
    const distance = slot ? distanceBetween(position, slot.position) : null;
    return Object.freeze({
      type: 'WalkingEncounterSnapshot',
      schemaVersion: WALKING_ENCOUNTER_SCHEMA_VERSION,
      revision,
      available: !!slot,
      mode: liveGpsActive ? 'live-gps' : 'free-roam',
      slotId: slot?.id || null,
      claimId: slot?.claimId || null,
      activityId: slot?.activityId || null,
      activityLabel: slot?.activityLabel || '',
      catalogId: slot?.catalogId || null,
      kind: current?.presentation?.kind || null,
      leadLabel: current?.presentation?.label || '',
      tone: current?.presentation?.tone || 'field',
      distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null,
      bearingDegrees: slot ? Number(bearingTo(position, slot.position).toFixed(1)) : null,
      targetWorld: slot ? Object.freeze({ x: Number(slot.position.x.toFixed(2)), z: Number(slot.position.z.toFixed(2)) }) : null,
      walkedMeters: Number(walkedMeters.toFixed(1)),
      cooldownSeconds: Number(cooldown.toFixed(1))
    });
  }

  return Object.freeze({ accept, reject, snapshot, update });
}

export { WALKING_ENCOUNTER_SCHEMA_VERSION, createWalkingEncounterDirector, leadPresentation };
