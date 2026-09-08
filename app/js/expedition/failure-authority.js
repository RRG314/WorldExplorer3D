const ESSENTIAL_SYSTEMS = Object.freeze(['life-support', 'power', 'propulsion']);
const THRESHOLDS = Object.freeze([
  Object.freeze({ id: 'degraded', condition: 0.55 }),
  Object.freeze({ id: 'critical', condition: 0.25 }),
  Object.freeze({ id: 'offline', condition: 0.001 })
]);

function freezeChain(entries) {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

function appendSystemTransitions(chain = [], beforeSystems = {}, afterSystems = {}, atMissionS = 0) {
  const next = chain.map((entry) => ({ ...entry }));
  for (const [systemId, current] of Object.entries(afterSystems || {})) {
    const before = Number(beforeSystems?.[systemId]?.condition ?? 1);
    const after = Math.max(0, Number(current?.condition ?? 0));
    for (const threshold of THRESHOLDS) {
      if (before > threshold.condition && after <= threshold.condition) {
        const id = `${systemId}:${threshold.id}:${Math.round(Number(atMissionS) || 0)}`;
        next.push({
          id,
          systemId,
          stage: threshold.id,
          status: 'active',
          atMissionS: Number(atMissionS) || 0,
          causeId: next.filter((entry) => entry.systemId === systemId && entry.status === 'active').at(-1)?.id || null,
          message: `${systemId.replaceAll('-', ' ')} became ${threshold.id}.`
        });
      }
    }
  }
  return freezeChain(next);
}

function resolveSystemFailure(chain = [], systemId, condition, atMissionS = 0, message = '') {
  const thresholdByStage = Object.fromEntries(THRESHOLDS.map((entry) => [entry.id, entry.condition]));
  const next = chain.map((entry) => entry.systemId === systemId
      && entry.status === 'active'
      && Number(condition) > Number(thresholdByStage[entry.stage] ?? 1)
    ? { ...entry, status: 'resolved', resolvedAtMissionS: Number(atMissionS) || 0 }
    : { ...entry });
  next.push({
    id: `${systemId}:recovered:${Math.round(Number(atMissionS) || 0)}:${next.length}`,
    systemId,
    stage: 'recovered',
    status: 'resolved',
    atMissionS: Number(atMissionS) || 0,
    condition: Number(condition) || 0,
    causeId: next.filter((entry) => entry.systemId === systemId).at(-1)?.id || null,
    message: message || `${systemId.replaceAll('-', ' ')} recovered to ${Math.round((Number(condition) || 0) * 100)}%.`
  });
  return freezeChain(next);
}

function repairCapacity(expedition) {
  const resources = expedition?.resources || {};
  const systems = expedition?.systems || {};
  const engineeringCrew = (expedition?.crew || []).some((member) => member.status !== 'dead' && (member.roles || []).includes('engineering'));
  const directParts = Number(resources.maintenanceKg || 0) >= 12;
  const fabricatable = Number(resources.feedstockKg || 0) >= 25
    && Number(resources.powerMWh || 0) >= 0.35
    && Number(systems.fabrication?.condition ?? 1) >= 0.25;
  return Object.freeze({ engineeringCrew, directParts, fabricatable, available: engineeringCrew && (directParts || fabricatable) });
}

function assessCausalFailure(expedition) {
  const offline = ESSENTIAL_SYSTEMS.find((id) => Number(expedition?.systems?.[id]?.condition ?? 1) <= 0.001);
  if (!offline) return null;
  const capacity = repairCapacity(expedition);
  const causes = (expedition?.failureChain || []).filter((entry) => entry.systemId === offline && entry.status === 'active');
  if (causes.length < 3 || capacity.available) return null;
  const report = [
    ...causes.map((entry) => entry.message),
    capacity.engineeringCrew ? 'No carried or fabricatable repair material remained.' : 'No active crew member retained engineering coverage.',
    `${offline.replaceAll('-', ' ')} could not be recovered.`
  ];
  return Object.freeze({
    systemId: offline,
    atMissionS: Number(expedition?.strategicElapsedS) || 0,
    causes: Object.freeze(report),
    summary: `Solis Reach was lost after ${offline.replaceAll('-', ' ')} became unrecoverable.`
  });
}

function shipAlertState(expedition) {
  const systems = Object.entries(expedition?.systems || {}).sort((a, b) => Number(a[1]?.condition ?? 1) - Number(b[1]?.condition ?? 1));
  const [systemId, system] = systems[0] || ['ship', { condition: 1, status: 'optimal' }];
  const condition = Number(system?.condition ?? 1);
  const encounter = expedition?.activeEncounter;
  const encounterPending = encounter && encounter.phase !== 'COMPLETE';
  const pending = expedition?.pendingEvent || (encounterPending ? {
    title: 'Pirate boarding interception',
    roomId: 'Pathfinder defensive control'
  } : null);
  const level = condition < 0.25 ? 'critical' : condition < 0.55 || pending ? 'attention' : 'normal';
  return Object.freeze({
    level,
    systemId,
    condition,
    message: pending
      ? `${pending.title} · respond in ${String(pending.roomId || 'assigned room').replaceAll('-', ' ')}`
      : level === 'normal'
        ? 'All monitored systems within operating limits.'
        : `${systemId.replaceAll('-', ' ')} ${Math.round(condition * 100)}% · ${system?.status || level}`
  });
}

export { appendSystemTransitions, assessCausalFailure, ESSENTIAL_SYSTEMS, repairCapacity, resolveSystemFailure, shipAlertState };
