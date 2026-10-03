import { getDestinationMission } from './mission-catalog.js?v=3';

export function planetarySurveyEquipment(ledger) {
  const earned = Object.values(ledger?.missions || {}).some(state => {
    const definition = getDestinationMission(state.destinationId);
    return state.phase === 'complete' && definition?.scope === 'planet' && definition.operation.includes('surface')
      && new Set((state.evidence || []).filter(id => !id.startsWith('analysis:'))).size >= 3 && state.history?.some(entry => entry.event === 'complete_analysis');
  });
  return Object.freeze({ id: earned ? 'field-link-ii' : 'field-link-i', label: earned ? 'Field Link II' : 'Field Link I', remoteRangeM: earned ? 30 : 18, sampleRangeM: 18, earned });
}

export function canAnalyzeDestination(ctx, mission) {
  const ship = ctx?.getShipInteriorSnapshot?.();
  if (!ship?.active || ship.shipId !== 'solis-reach' || ship.deckId !== 'command' || !ctx.activeShipInterior) return false;
  const expedition = ctx.getInterstellarExpeditionSnapshot?.();
  if (expedition?.destinationId !== mission?.systemId || !['arrived','completed'].includes(expedition?.state)) return false;
  if (expedition?.podJourney && expedition.podJourney.phase !== 'recovered') return false;
  if (mission?.operation?.includes('surface') && (expedition?.podJourney?.bodyId !== mission.destinationId || expedition.podJourney.expeditionId !== expedition.id || expedition.podJourney.returnFrameId !== mission.systemId)) return false;
  const player = ctx.Walk?.state?.walker;
  if (!Number.isFinite(player?.x) || !Number.isFinite(player?.z)) return false;
  return (ctx.activeInterior?.interactions || []).some(station =>
    (station.id === 'analysis-review' || station.stationId === 'analysis-review') &&
    Math.hypot(player.x - station.x, player.z - station.z) <= Number(station.radius || 2.15));
}

export function canResumeDestinationSurvey(ctx, mission) {
  const expedition = ctx?.getInterstellarExpeditionSnapshot?.();
  const pod = expedition?.podJourney;
  return Boolean(ctx?.activeShipInterior && !ctx.universeRuntime?.transition &&
    ctx.universeRuntime?.current?.id === mission?.systemId && expedition?.destinationId === mission?.systemId &&
    ['arrived','completed'].includes(expedition?.state) && pod?.phase === 'recovered' &&
    pod.expeditionId === expedition.id && pod.bodyId === mission.destinationId && pod.returnFrameId === mission.systemId);
}
