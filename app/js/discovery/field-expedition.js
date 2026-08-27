import { FIELD_DISCOVERY_CATALOG } from './catalog.js?v=2';
import { prioritizeProgressiveSlots } from './pacing.js?v=2';

function distanceTo(position, slot) {
  return Math.hypot(Number(position?.x || 0) - Number(slot?.position?.x || 0), Number(position?.z || 0) - Number(slot?.position?.z || 0));
}

function createFieldExpedition(options = {}) {
  const plan = options.plan;
  if (plan?.type !== 'FieldActivityPlan') throw new TypeError('A FieldActivityPlan is required.');
  const claimedIds = options.claimedIds instanceof Set ? options.claimedIds : new Set(options.claimedIds || []);
  const candidates = prioritizeProgressiveSlots(plan.slots, options)
    .filter((slot) => typeof options.isSlotAvailable !== 'function' || options.isSlotAvailable(slot))
    .sort((left, right) => distanceTo(options.position, left) - distanceTo(options.position, right));
  const selected = [];
  const usedActivities = new Set();
  const usedCatalogs = new Set();
  for (const preferVariety of [true, false]) {
    for (const slot of candidates) {
      if (selected.some((entry) => entry.id === slot.id)) continue;
      if (preferVariety && (usedActivities.has(slot.activityId) || usedCatalogs.has(slot.catalogId))) continue;
      selected.push(slot);
      usedActivities.add(slot.activityId);
      usedCatalogs.add(slot.catalogId);
      if (selected.length >= 3) break;
    }
    if (selected.length >= 3) break;
  }
  const objectives = selected.map((slot, index) => ({
    index,
    slot,
    complete: claimedIds.has(slot.claimId)
  }));

  function markComplete(claimId) {
    const objective = objectives.find((entry) => entry.slot.claimId === claimId);
    if (!objective || objective.complete) return false;
    objective.complete = true;
    return true;
  }

  function snapshot(position = {}, evaluateTarget = null) {
    const rows = objectives.map((objective) => {
      const discovery = FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === objective.slot.catalogId);
      const proximity = typeof evaluateTarget === 'function' ? evaluateTarget(objective.slot.position) : null;
      const distanceMeters = proximity?.distanceMeters ?? distanceTo(position, objective.slot);
      return Object.freeze({
        index: objective.index,
        slotId: objective.slot.id,
        claimId: objective.slot.claimId,
        activityId: objective.slot.activityId,
        activityLabel: objective.slot.activityLabel,
        targetLabel: objective.complete ? discovery?.names?.common || 'Field record' : `${objective.slot.activityLabel} stop`,
        complete: objective.complete,
        distanceMeters: Number.isFinite(distanceMeters) ? Number(distanceMeters.toFixed(1)) : null,
        proximityState: objective.complete ? 'complete' : proximity?.state || 'manual',
        eligible: objective.complete || proximity?.eligible === true,
        pauseReason: proximity?.pauseReason || null,
        targetWorld: Object.freeze({ x: Number(objective.slot.position.x.toFixed(2)), z: Number(objective.slot.position.z.toFixed(2)) })
      });
    });
    return Object.freeze({
      type: 'FieldExpeditionSnapshot',
      objectiveCount: rows.length,
      completedCount: rows.filter((entry) => entry.complete).length,
      complete: rows.length > 0 && rows.every((entry) => entry.complete),
      objectives: Object.freeze(rows)
    });
  }

  return Object.freeze({ markComplete, snapshot });
}

export { createFieldExpedition };
