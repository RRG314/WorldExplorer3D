import { FIND_CATALOG } from './catalog.js?v=2';
import { fieldProgress, prioritizeProgressiveSlots } from './pacing.js?v=2';
import { resolveExcavationTool } from './tools.js?v=1';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function distanceTo(position, target) {
  return Math.hypot(Number(position?.x || 0) - Number(target?.x || 0), Number(position?.z || 0) - Number(target?.z || 0));
}

function detectorBearing(position, target) {
  const radians = Math.atan2(Number(target?.x || 0) - Number(position?.x || 0), Number(target?.z || 0) - Number(position?.z || 0));
  return (radians * 180 / Math.PI + 360) % 360;
}

function createDetectorSession(options = {}) {
  const plan = options.plan;
  if (plan?.type !== 'EncounterPlan') throw new TypeError('Detector session requires an EncounterPlan.');
  const claimed = options.claimedIds instanceof Set ? options.claimedIds : new Set(options.claimedIds || []);
  const observedCatalogIds = options.observedCatalogIds instanceof Set ? options.observedCatalogIds : new Set(options.observedCatalogIds || []);
  let availableToolIds = Array.isArray(options.availableToolIds) ? options.availableToolIds.map(String) : [];
  let progress = options.progress || fieldProgress({ collectionCount: options.collectionCount || 0 });
  let phase = 'idle';
  let target = null;
  let elapsed = 0;
  let signalStrength = 0;
  let message = 'Sweep a suitable area to search for a virtual field find.';
  let error = '';
  let collectionResult = null;
  let activeToolId = 'metal-detector';

  function nearestUnclaimed(position) {
    return prioritizeProgressiveSlots(plan.slots, { claimedIds: claimed, observedCatalogIds, progress })
      .map((slot) => ({ slot, distance: distanceTo(position, slot.position) }))
      .sort((a, b) => a.distance - b.distance || a.slot.id.localeCompare(b.slot.id))[0] || null;
  }

  function sweep(position) {
    const candidate = nearestUnclaimed(position);
    error = '';
    collectionResult = null;
    activeToolId = 'metal-detector';
    elapsed = 0;
    if (!candidate) {
      phase = 'complete';
      target = null;
      signalStrength = 0;
      const rankLocked = plan.slots.some((slot) => !claimed.has(slot.claimId));
      message = rankLocked ? `Remaining signals require a higher field rank. Explore a new cell or reach ${progress.next?.label || 'the next rank'}.` : 'This survey area is documented. Walk into another cell to find new signals.';
      return false;
    }
    target = candidate.slot;
    phase = 'sweeping';
    signalStrength = clamp(1 - candidate.distance / 90, 0.02, 1);
    message = candidate.distance <= 16
      ? 'A focused signal is under the coil. Refine it.'
      : 'A weak signal is nearby. Follow the bearing and watch the meter.';
    return true;
  }

  function update(position, dt = 0) {
    if (!target || !['sweeping', 'signal', 'classified', 'excavating'].includes(phase)) return snapshot(position);
    elapsed += Math.max(0, Number(dt) || 0);
    const distance = distanceTo(position, target.position);
    signalStrength = clamp(1 - distance / 90, 0.02, 1);
    if (phase === 'sweeping' && distance <= 16) {
      phase = 'signal';
      message = 'Focused signal found. Refine the signal to classify it.';
    } else if (phase === 'signal' && distance > 22) {
      phase = 'sweeping';
      message = 'The signal weakened. Move back toward the indicated bearing.';
    } else if (phase === 'excavating' && elapsed >= 1.25) {
      phase = 'revealed';
      const find = FIND_CATALOG.find((entry) => entry.id === target.catalogId);
      message = `${find?.names?.common || 'Virtual find'} revealed. Inspect it, collect it, or leave it in place.`;
    }
    return snapshot(position);
  }

  function refine(position) {
    error = '';
    if (!target || !['signal', 'sweeping'].includes(phase)) return false;
    const distance = distanceTo(position, target.position);
    if (distance > 16) {
      error = `Move ${Math.ceil(distance - 16)} m closer before refining.`;
      return false;
    }
    phase = 'classified';
    message = `Signal classified as ${target.signalClass.replaceAll('-', ' ')} at ${target.depthBand} virtual depth.`;
    return true;
  }

  function excavate() {
    error = '';
    if (!target || phase !== 'classified') return false;
    const toolMatch = resolveExcavationTool(target.depthBand, availableToolIds);
    if (!toolMatch.allowed) {
      error = `This ${target.depthBand} target needs ${toolMatch.requiredToolIds?.join(' or ') || 'a supported excavation tool'}.`;
      return false;
    }
    phase = 'excavating';
    elapsed = 0;
    activeToolId = toolMatch.tool.id;
    message = `Excavating with ${toolMatch.tool.label}. This is virtual gameplay—not permission to dig here.`;
    return true;
  }

  async function collect(profileStore, context = {}) {
    error = '';
    if (!target || phase !== 'revealed') return false;
    const find = FIND_CATALOG.find((entry) => entry.id === target.catalogId);
    const result = await profileStore.collect({
      instanceId: `item:${target.id}`,
      claimId: target.claimId,
      catalogId: target.catalogId,
      name: find?.names?.common || target.catalogId,
      description: find?.description || '',
      family: find?.family || 'fictional-find',
      material: find?.material || 'unknown',
      rarityBand: find?.rarityBand || 'common',
      depthBand: target.depthBand,
      signalClass: target.signalClass,
      discipline: 'history-service',
      activityId: 'metal-detect',
      toolId: context.toolId || 'metal-detector',
      regionId: plan.worldIdentity.id,
      regionLabel: context.regionLabel || 'Current region',
      locationKey: context.locationKey || '',
      locationSnapshot: context.locationSnapshot || null,
      worldIdentity: plan.worldIdentity.id,
      environment: context.environment || 'EARTH',
      localPosition: context.localPosition || target.position,
      evidenceClass: target.evidenceClass,
      supportingEvidence: target.supportingEvidence,
      sourceRefs: target.sourceRefs,
      collectedAt: Date.now()
    });
    if (!result.collected) {
      error = result.reason === 'already-claimed' ? 'That target was already collected.' : 'The find could not be saved.';
      return false;
    }
    claimed.add(target.claimId);
    observedCatalogIds.add(target.catalogId);
    progress = fieldProgress(result.profile || { collectionCount: progress.records + 1 });
    collectionResult = result;
    phase = 'collected';
    activeToolId = 'metal-detector';
    message = `${result.item.name} saved to your Journal, Field Guide, and Backpack.`;
    return true;
  }

  function leave() {
    if (!target) return false;
    phase = 'left';
    message = 'Find left in place. Its stable target will remain for a future visit.';
    collectionResult = null;
    activeToolId = 'metal-detector';
    return true;
  }

  function reset() {
    phase = 'idle';
    target = null;
    elapsed = 0;
    signalStrength = 0;
    error = '';
    collectionResult = null;
    activeToolId = 'metal-detector';
    message = 'Sweep a suitable area to search for a virtual field find.';
  }

  function setAvailableToolIds(toolIds = []) {
    availableToolIds = Array.isArray(toolIds) ? toolIds.map(String) : [];
    return availableToolIds.slice();
  }

  function snapshot(position = {}) {
    const find = target ? FIND_CATALOG.find((entry) => entry.id === target.catalogId) : null;
    const distance = target ? distanceTo(position, target.position) : null;
    return Object.freeze({
      active: phase !== 'idle', phase, message, error,
      targetId: target?.id || null,
      targetName: ['revealed', 'collected'].includes(phase) ? find?.names?.common || target?.catalogId : null,
      targetCatalogId: target?.catalogId || null,
      depthBand: ['classified', 'excavating', 'revealed', 'collected'].includes(phase) ? target?.depthBand || null : null,
      signalClass: ['classified', 'excavating', 'revealed', 'collected'].includes(phase) ? target?.signalClass || null : null,
      signalStrength: Number(signalStrength.toFixed(3)),
      distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null,
      bearingDegrees: target ? Number(detectorBearing(position, target.position).toFixed(1)) : null,
      claimState: target ? claimed.has(target.claimId) ? 'claimed' : 'unclaimed' : null,
      activeToolId,
      collectionResult: collectionResult ? {
        recorded: true,
        collected: true,
        instanceId: collectionResult.item.instanceId,
        eventId: collectionResult.event?.eventId || null,
        event: collectionResult.event || null,
        progress: collectionResult.progress || null
      } : null,
      fieldProgress: progress
    });
  }

  return Object.freeze({ collect, excavate, leave, refine, reset, setAvailableToolIds, snapshot, sweep, update });
}

export { createDetectorSession, detectorBearing, distanceTo };
