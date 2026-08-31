import { withExpeditionChanges } from './model.js?v=6';
import { resolveSystemFailure } from './failure-authority.js?v=1';
import { reinforceGenerationTraining, wakeReserveSpecialist } from './long-duration.js?v=1';

const STATION_VIEWS = Object.freeze({
  'bridge-flight': Object.freeze({ title: 'Flight Controls', systemId: 'navigation', summary: 'Review heading, velocity, and the margins on the active route.' }),
  'bridge-log': Object.freeze({ title: "Captain's Log", systemId: 'navigation', summary: 'Review the decisions, discoveries, repairs, and milestones recorded for this voyage.' }),
  'navigation-course': Object.freeze({ title: 'Navigation & Cartography', systemId: 'navigation', summary: 'Compare the active course with fuel, power, and arrival margins.', actions: ['verify-course'] }),
  'communications-status': Object.freeze({ title: 'Mission Communications', systemId: 'navigation', summary: 'Review outbound reports and the increasing signal delay to home.' }),
  'science-survey': Object.freeze({ title: 'Physical Sciences', systemId: 'sensors', summary: 'Record a bounded stellar baseline from the ship’s current position.', actions: ['record-baseline'] }),
  'sensor-scan': Object.freeze({ title: 'Sensor Control', systemId: 'sensors', summary: 'Run a calibrated local scan. Results are observations in the game world, not claims that a real object is present.', actions: ['run-sensor-scan'] }),
  'analysis-review': Object.freeze({ title: 'Analysis & Data', systemId: 'sensors', summary: 'Review collected evidence, provenance, uncertainty, and unresolved observations.' }),
  'briefing-status': Object.freeze({ title: 'Crew Briefing', systemId: 'navigation', summary: 'Review the current watch, resting crew, and the ship’s most urgent system.' }),
  'generation-continuity': Object.freeze({ title: 'Generation Continuity', systemId: 'education', summary: 'Review population, role succession, training coverage, and the knowledge archive.', actions: ['train-successors'] }),
  'observation-view': Object.freeze({ title: 'Observation Gallery', systemId: 'sensors', summary: 'Observe local space without changing the ship’s course.' }),
  'galley-meal': Object.freeze({ title: 'Galley & Wardroom', systemId: 'food-production', summary: 'Serve a measured crew meal and give the active watch a short recovery period.', actions: ['serve-crew-meal'] }),
  'medical-status': Object.freeze({ title: 'Medical Bay', systemId: 'medical', summary: 'Review crew health, fatigue, and treatment reserves.' }),
  'medical-treatment': Object.freeze({ title: 'Treatment Station', systemId: 'medical', summary: 'Treat the crew member with the greatest current need.', actions: ['treat-crew'] }),
  'cryogenic-status': Object.freeze({ title: 'Cryogenic Reserve', systemId: 'cryogenic', summary: 'Review speculative human suspension, reserve specialists, wake risk, and medical support.', actions: ['wake-reserve-specialist'] }),
  'exercise-session': Object.freeze({ title: 'Exercise Bay', systemId: 'medical', summary: 'Complete the crew’s scheduled resistance and cardiovascular session.', actions: ['complete-exercise'] }),
  'quarters-status': Object.freeze({ title: 'Crew Quarters', systemId: 'life-support', summary: 'Review the player’s berth, current assignment, and rest status.' }),
  'hygiene-status': Object.freeze({ title: 'Water Recovery', systemId: 'life-support', summary: 'Inspect hygiene loads, stored water, and recovery-loop condition.', actions: ['service-water-loop'] }),
  'life-support-status': Object.freeze({ title: 'Life-Support Control', systemId: 'life-support', summary: 'Review atmosphere, water recovery, and environmental reserves.', actions: ['stabilize-life-support'] }),
  'hydroponics-tend': Object.freeze({ title: 'Hydroponics', systemId: 'food-production', summary: 'Tend the existing crop cycle. This protects food production; it does not create supplies from nothing.', actions: ['tend-crops'] }),
  'storm-shelter-status': Object.freeze({ title: 'Storm Shelter', systemId: 'hull', summary: 'Verify that crew capacity, dosimeters, water, food, and medical stores are positioned for a radiation alert.', actions: ['verify-storm-shelter'] }),
  'engineering-status': Object.freeze({ title: 'Main Engineering', systemId: 'propulsion', summary: 'Review propulsion, power, thermal control, and current maintenance demand.' }),
  'engineering-repair': Object.freeze({ title: 'Engineering Workbench', systemId: 'thermal', summary: 'Use maintenance material to repair the ship’s most degraded repairable system.', actions: ['repair-priority-system'] }),
  'power-status': Object.freeze({ title: 'Power Control', systemId: 'power', summary: 'Review generation, storage, and distribution margins.', actions: ['balance-power'] }),
  'thermal-status': Object.freeze({ title: 'Thermal Control', systemId: 'thermal', summary: 'Inspect coolant loops and heat-rejection margins.', actions: ['service-thermal-loop'] }),
  'fabricator-status': Object.freeze({ title: 'Fabrication Shop', systemId: 'fabrication', summary: 'Convert carried feedstock into a bounded batch of maintenance parts.', actions: ['fabricate-parts'] }),
  'cargo-status': Object.freeze({ title: 'Cargo Hold', systemId: 'hull', summary: 'Review carried food, water, feedstock, maintenance parts, and science cargo.' }),
  'resource-processor-status': Object.freeze({ title: 'Resource Processing', systemId: 'fabrication', summary: 'Inspect and process samples transferred from a supported surface operation.', actions: ['process-resource-sample'] }),
  'airlock-status': Object.freeze({ title: 'EVA Airlock', systemId: 'hull', summary: 'Inspect suits and airlock readiness. EVA requires a supported local destination operation.', actions: ['verify-eva'] }),
  'craft-bay-status': Object.freeze({ title: 'Local-Craft Bay', systemId: 'hull', summary: 'Inspect the secured survey craft used for supported local landings and field operations.', actions: ['verify-local-craft'] })
});

const ACTION_LABELS = Object.freeze({
  'verify-course': 'Verify course',
  'record-baseline': 'Record baseline',
  'run-sensor-scan': 'Run local scan',
  'serve-crew-meal': 'Serve meal',
  'treat-crew': 'Treat crew member',
  'wake-reserve-specialist': 'Wake needed specialist',
  'train-successors': 'Train next watch',
  'complete-exercise': 'Complete session',
  'service-water-loop': 'Service recovery loop',
  'stabilize-life-support': 'Stabilize life support',
  'tend-crops': 'Tend crop cycle',
  'verify-storm-shelter': 'Verify shelter',
  'repair-priority-system': 'Repair priority system',
  'balance-power': 'Balance distribution',
  'service-thermal-loop': 'Service thermal loop',
  'fabricate-parts': 'Fabricate parts',
  'process-resource-sample': 'Process loaded sample',
  'verify-eva': 'Verify EVA readiness',
  'verify-local-craft': 'Verify craft readiness'
});

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function operationCycle(expedition) {
  return `${expedition?.state || 'planned'}:${Math.floor((Number(expedition?.progress) || 0) * 20)}`;
}

function operationKey(expedition, actionId) {
  if (actionId === 'process-resource-sample') {
    const sample = (expedition?.scienceSamples || []).find((entry) => entry.processed !== true);
    return `${actionId}:${sample?.id || 'none'}`;
  }
  return `${actionId}:${operationCycle(expedition)}`;
}

function lowestSystem(expedition, allowed = null) {
  const entries = Object.entries(expedition?.systems || {}).filter(([id]) => !allowed || allowed.includes(id));
  entries.sort((a, b) => Number(a[1]?.condition ?? 1) - Number(b[1]?.condition ?? 1));
  return entries[0] || null;
}

function conditionStatus(condition) {
  const value = Math.max(0, Math.min(1, Number(condition) || 0));
  return value < 0.25 ? 'critical' : value < 0.55 ? 'degraded' : value < 0.85 ? 'operational' : 'optimal';
}

function stationMetrics(expedition, view) {
  const system = expedition?.systems?.[view.systemId];
  const resources = expedition?.resources || {};
  const crew = expedition?.crew || [];
  const averageFatigue = crew.length ? crew.reduce((sum, member) => sum + Number(member.fatigue || 0), 0) / crew.length : 0;
  return Object.freeze([
    Object.freeze({ label: 'System', value: system ? `${Math.round(Number(system.condition || 0) * 100)}% · ${system.status}` : 'Operational context' }),
    Object.freeze({ label: 'Crew', value: `${crew.filter((member) => member.status !== 'dead').length} aboard · ${Math.round(averageFatigue * 100)}% avg. fatigue` }),
    Object.freeze({ label: 'Stores', value: `${Math.round(Number(resources.maintenanceKg || 0))} kg parts · ${Math.round(Number(resources.feedstockKg || 0))} kg feedstock` }),
    Object.freeze({ label: 'Mission', value: `${Math.round((Number(expedition?.progress) || 0) * 100)}% · ${expedition?.state || 'planned'}` })
  ]);
}

function actionAvailability(expedition, actionId) {
  const resources = expedition?.resources || {};
  const used = expedition?.operationFlags?.[operationKey(expedition, actionId)] === true;
  if (used) return Object.freeze({ enabled: false, reason: 'Completed during this voyage segment.' });
  if (actionId === 'fabricate-parts' && (Number(resources.feedstockKg) < 25 || Number(resources.powerMWh) < 0.35)) return Object.freeze({ enabled: false, reason: 'Requires 25 kg feedstock and 0.35 MWh.' });
  if (actionId === 'serve-crew-meal' && (Number(resources.foodKg) < 8 || Number(resources.waterKg) < 3)) return Object.freeze({ enabled: false, reason: 'Requires 8 kg food and 3 kg water.' });
  if (actionId === 'treat-crew' && Number(resources.medicalUnits) < 1) return Object.freeze({ enabled: false, reason: 'No treatment unit is available.' });
  if (actionId === 'wake-reserve-specialist') {
    if (expedition?.longDuration?.kind !== 'cryogenic') return Object.freeze({ enabled: false, reason: 'Available only on a cryogenic mission.' });
    if (!(expedition.longDuration.reserveCrew || []).some((member) => member.status === 'cryogenic')) return Object.freeze({ enabled: false, reason: 'No reserve specialist remains asleep.' });
    if (Number(resources.medicalUnits || 0) < 3 || Number(resources.powerMWh || 0) < 2) return Object.freeze({ enabled: false, reason: 'Requires 3 medical units and 2 MWh.' });
  }
  if (actionId === 'train-successors' && expedition?.longDuration?.kind !== 'generation') return Object.freeze({ enabled: false, reason: 'Available only on a generation voyage.' });
  const maintenanceCost = {
    'repair-priority-system': 12,
    'service-water-loop': 5,
    'stabilize-life-support': 8,
    'service-thermal-loop': 8
  }[actionId];
  if (maintenanceCost && Number(resources.maintenanceKg) < maintenanceCost) return Object.freeze({ enabled: false, reason: `Requires ${maintenanceCost} kg of maintenance parts.` });
  if (actionId === 'process-resource-sample' && !(expedition?.scienceSamples || []).some((sample) => sample.processed !== true)) {
    return Object.freeze({ enabled: false, reason: 'Acquire and transfer a sample from a supported local operation first.' });
  }
  if (actionId === 'verify-local-craft' && expedition?.state !== 'arrived') return Object.freeze({ enabled: false, reason: 'The craft remains secured during interstellar cruise.' });
  return Object.freeze({ enabled: true, reason: '' });
}

function getShipStationView(expedition, stationId) {
  const base = STATION_VIEWS[stationId] || Object.freeze({ title: 'Surveyor Station', systemId: 'hull', summary: 'Review the station.' });
  const actions = (base.actions || []).map((id) => Object.freeze({ id, label: ACTION_LABELS[id] || id, ...actionAvailability(expedition, id) }));
  return Object.freeze({ ...base, metrics: stationMetrics(expedition, base), actions: Object.freeze(actions) });
}

function applyShipOperation(expedition, actionId) {
  const availability = actionAvailability(expedition, actionId);
  if (!availability.enabled) return Object.freeze({ expedition, changed: false, message: availability.reason });
  if (actionId === 'wake-reserve-specialist' || actionId === 'train-successors') {
    const result = actionId === 'wake-reserve-specialist' ? wakeReserveSpecialist(expedition) : reinforceGenerationTraining(expedition);
    if (!result.changed) return result;
    return Object.freeze({
      ...result,
      expedition: withExpeditionChanges(result.expedition, {
        operationFlags: Object.freeze({ ...(result.expedition.operationFlags || {}), [operationKey(expedition, actionId)]: true })
      })
    });
  }
  const resources = clone(expedition.resources || {});
  const systems = clone(expedition.systems || {});
  const crew = clone(expedition.crew || []);
  const materialLedger = clone(expedition.materialLedger || { installedRepairKg: 0 });
  const recoveredSystems = [];
  const flags = { ...(expedition.operationFlags || {}), [operationKey(expedition, actionId)]: true };
  let message = ACTION_LABELS[actionId] || actionId;
  let kind = 'ship-operation';

  const improveSystem = (id, amount, cost = 0) => {
    if (!systems[id]) return;
    const before = Number(systems[id].condition || 0);
    resources.maintenanceKg = Math.max(0, Number(resources.maintenanceKg || 0) - cost);
    materialLedger.installedRepairKg = Math.max(0, Number(materialLedger.installedRepairKg || 0)) + Math.max(0, cost);
    systems[id].condition = Math.min(1, Number(systems[id].condition || 0) + amount);
    systems[id].status = conditionStatus(systems[id].condition);
    if (systems[id].condition > before) recoveredSystems.push(id);
  };

  if (actionId === 'fabricate-parts') {
    resources.feedstockKg -= 25;
    resources.powerMWh -= 0.35;
    resources.maintenanceKg += 18;
    resources.processingResidueKg = Number(resources.processingResidueKg || 0) + 7;
    message = 'Fabrication converted 25 kg of feedstock into 18 kg of inspected maintenance parts and retained 7 kg of process residue.';
  } else if (actionId === 'serve-crew-meal') {
    resources.foodKg -= 8;
    resources.waterKg -= 3;
    crew.forEach((member) => { member.fatigue = Math.max(0, Number(member.fatigue || 0) - 0.035); });
    message = 'The crew shared a measured meal and the active watch recovered.';
  } else if (actionId === 'complete-exercise') {
    crew.forEach((member) => { member.fatigue = Math.max(0, Number(member.fatigue || 0) - 0.02); });
    message = 'The scheduled exercise session was completed.';
  } else if (actionId === 'treat-crew') {
    const patient = [...crew].sort((a, b) => (Number(a.health ?? 1) - Number(b.health ?? 1)) || (Number(b.fatigue || 0) - Number(a.fatigue || 0)))[0];
    resources.medicalUnits -= 1;
    patient.health = Math.min(1, Number(patient.health ?? 1) + 0.04);
    patient.fatigue = Math.max(0, Number(patient.fatigue || 0) - 0.04);
    message = `${patient.name} received a scheduled treatment.`;
    kind = 'medical';
  } else if (actionId === 'repair-priority-system') {
    const target = lowestSystem(expedition, ['propulsion', 'power', 'life-support', 'thermal', 'medical', 'fabrication', 'sensors', 'hull']);
    if (target) improveSystem(target[0], 0.08, 12);
    message = target ? `Engineering repaired ${target[0].replaceAll('-', ' ')} and verified the work.` : 'No repairable system was found.';
    kind = 'repair';
  } else if (actionId === 'service-water-loop') {
    improveSystem('life-support', 0.035, 5);
    message = 'The water-recovery loop was cleaned, resealed, and returned to service.';
  } else if (actionId === 'stabilize-life-support') {
    improveSystem('life-support', 0.05, 8);
    resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - 0.2);
    message = 'Life-support loads were balanced and the environmental loop stabilized.';
  } else if (actionId === 'service-thermal-loop') {
    improveSystem('thermal', 0.05, 8);
    message = 'The crew serviced the thermal loop and verified coolant flow.';
  } else if (actionId === 'balance-power') {
    improveSystem('power', 0.025, 0);
    message = 'Nonessential loads were shifted and the power margin was rebalanced.';
  } else if (actionId === 'tend-crops') {
    improveSystem('food-production', 0.03, 0);
    resources.waterKg = Math.max(0, Number(resources.waterKg || 0) - 1.5);
    message = 'The crew tended the active crop cycle and used 1.5 kg from the water reserve.';
  } else if (actionId === 'run-sensor-scan') {
    resources.powerMWh = Math.max(0, Number(resources.powerMWh || 0) - 0.1);
    message = 'A calibrated local scan was recorded for later analysis.';
    kind = 'science';
  } else if (actionId === 'verify-course') {
    improveSystem('navigation', 0.015, 0);
    message = 'Navigation verified the active course and arrival margins.';
  } else if (actionId === 'verify-storm-shelter') {
    message = 'The storm shelter was checked for crew capacity, dosimetry, water, food, and medical access.';
  } else if (actionId === 'verify-eva') {
    message = 'Suit pressure, oxygen, communications, and airlock seals were verified.';
  } else if (actionId === 'verify-local-craft') {
    message = 'The local survey craft passed its readiness inspection.';
  } else if (actionId === 'record-baseline') {
    message = 'A stellar baseline was recorded with the current mission position and instrument state.';
    kind = 'science';
  } else if (actionId === 'process-resource-sample') {
    const samples = clone(expedition.scienceSamples || []);
    const sample = samples.find((entry) => entry.processed !== true);
    sample.processed = true;
    sample.processedAtMissionS = Number(expedition.strategicElapsedS) || 0;
    const recovery = sample.recoveryRequirement;
    if (recovery?.kind === 'repair-feedstock') {
      const feedstockKg = Math.max(0, Number(recovery.recoveredFeedstockKg || 0));
      const residueKg = Math.max(0, Number(recovery.processingResidueKg || 0));
      if (Math.abs(feedstockKg + residueKg - Number(sample.massKg || 0)) > 1e-9) {
        return Object.freeze({ expedition, changed: false, message: 'The sample manifest does not conserve mass.' });
      }
      resources.scienceCargoKg = Math.max(0, Number(resources.scienceCargoKg || 0) - Number(sample.massKg || 0));
      resources.feedstockKg = Number(resources.feedstockKg || 0) + feedstockKg;
      resources.processingResidueKg = Number(resources.processingResidueKg || 0) + residueKg;
      sample.outputs = Object.freeze({ feedstockKg, processingResidueKg: residueKg });
      message = `${sample.label} yielded ${feedstockKg} kg of fabrication feedstock and ${residueKg} kg of retained process residue.`;
      kind = 'resupply';
    } else {
      message = `${sample.label} was documented, separated, and sealed. Its ${Number(sample.massKg || 0)} kg remains in science cargo.`;
      kind = 'science';
    }
    const log = Object.freeze([...(expedition.log || []), Object.freeze({
      atMissionS: Number(expedition.strategicElapsedS) || 0,
      kind,
      message
    })]);
    const next = withExpeditionChanges(expedition, {
      scienceSamples: Object.freeze(samples.map((entry) => Object.freeze(entry))),
      resources: Object.freeze(resources),
      operationFlags: Object.freeze(flags),
      log
    });
    return Object.freeze({ expedition: next, changed: true, message });
  }

  const log = Object.freeze([...(expedition.log || []), Object.freeze({
    atMissionS: Number(expedition.strategicElapsedS) || 0,
    kind,
    message
  })]);
  let failureChain = expedition.failureChain || [];
  recoveredSystems.forEach((systemId) => {
    if (failureChain.some((entry) => entry.systemId === systemId && entry.status === 'active')) {
      failureChain = resolveSystemFailure(failureChain, systemId, systems[systemId].condition, expedition.strategicElapsedS, message);
    }
  });
  const next = withExpeditionChanges(expedition, {
    resources: Object.freeze(resources),
    systems: Object.freeze(systems),
    crew: Object.freeze(crew.map((member) => Object.freeze(member))),
    materialLedger: Object.freeze(materialLedger),
    failureChain,
    operationFlags: Object.freeze(flags),
    log
  });
  return Object.freeze({ expedition: next, changed: true, message });
}

export { ACTION_LABELS, applyShipOperation, getShipStationView, operationCycle, STATION_VIEWS };
