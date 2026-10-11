import { lunarPreparationReady } from '../planetary/lunar-survey.js';
import { normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { activePlanetaryBodyId } from '../planetary/runtime/surface-query.js?v=3';

// Missions select a route; the existing Solar/Universe flight owners execute it.
export function missionSurfaceBody(ctx) {
  return ['MOON', 'MARS', 'PLANETARY'].includes(ctx?.getEnv?.()) ? activePlanetaryBodyId(ctx) : null;
}

export function missionNavigationTarget(ctx, mission) {
  if (mission?.scope !== 'solar-body') return ctx?.getUniverseHudTarget?.() || null;
  if (ctx?.universeRuntime?.current?.id !== 'sol' || ctx.universeRuntime.transition) return null;
  const body = ctx.getAllSpaceBodies?.().find(entry => normalizeAstronomicalBodyId(entry.name) === mission.destinationId);
  return body?.position ? { ...body, destinationId: mission.destinationId } : null;
}

export function setMissionCourse(ctx, mission) {
  if (!mission || ctx?.universeRuntime?.transition || ctx?.activeShipInterior) return false;
  if (mission.scope === 'solar-body') {
    if (ctx?.universeRuntime?.current?.id !== 'sol') return false;
    return ctx.setSolarSystemCourse?.(mission.destinationId)?.accepted === true;
  }
  return ctx?.travelToUniverseDestination?.(mission.destinationId, { kind: 'destination-mission', routeLabel: mission.title }) === true;
}

export function localMoonOuting(ctx, mission, expedition) {
  return Boolean(mission?.destinationId === 'moon' && mission.systemId === 'sol'
    && ctx?.universeRuntime?.current?.id === 'sol' && !ctx.universeRuntime.transition
    && expedition?.id && ['planned', 'arrived', 'completed'].includes(expedition.state));
}

export function missionPodLaunchReady(ctx, mission, expedition) {
  if (!mission?.surfaceRequired || !expedition || ctx?.universeRuntime?.transition) return false;
  const pod = expedition.podJourney;
  if (pod && !['recovered', 'failed', 'aboard'].includes(pod.phase)) return false;
  return localMoonOuting(ctx, mission, expedition)
    ? (mission.phase === 'fieldwork' || mission.phase === 'approach' && lunarPreparationReady(mission.preparation, expedition.id))
    : mission.phase === 'fieldwork' && mission.atDestination === true;
}
