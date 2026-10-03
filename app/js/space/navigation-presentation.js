import { normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';
import { SPACE_CONSTANTS } from './constants.js?v=3';
import { computeBodyRelativeNavigation, evaluateLandingEligibility } from './spacecraft-authority.js?v=4';

// Read-only projection: travel/journey and spacecraft authorities retain ownership.
export function resolveFlightTarget(ctx, findBody) {
  const expeditionDock = ctx.getExpeditionPodDockingTarget?.();
  const dock = expeditionDock?.position ? expeditionDock : ctx.getSolisReachDockTarget?.();
  if (dock?.position) return { kind: 'dock', body: dock };
  const universe = ctx.getUniverseHudTarget?.();
  if (universe) return { kind: 'universe', body: universe };
  const session = ctx.getSpaceTravelSession?.();
  const selected = session?.destination?.kind === 'body' ? session.destination.id : null;
  const id = selected || ctx.spaceFlight._manualLandingTarget || ctx.spaceFlight.destination;
  if (id) return { kind: 'body', body: findBody(id), requestedId: id };
  const rocket = ctx.spaceFlight.rocket;
  const bodies = (ctx.getAllSpaceBodies?.() || []).filter(body => body.position);
  const body = bodies.reduce((nearest, candidate) => !nearest || rocket.position.distanceTo(candidate.position) < rocket.position.distanceTo(nearest.position) ? candidate : nearest, null);
  return { kind: 'body', body };
}

export function flightLandingReadout(ctx, target) {
  const body = target?.body;
  const si = ctx.spaceFlight.presentationAuthority === 'si';
  if (!body?.position) return { eligible: false, reason: 'Destination unavailable', si };
  const distance = ctx.spaceFlight.rocket.position.distanceTo(body.position);
  const altitude = Math.max(0, distance - body.radius);
  if (target.kind === 'dock') return { eligible: body.canDock === true, distance, altitude, si: false };
  if (target.kind === 'universe') return {
    eligible: body.targetKind === 'exoplanet' && body.landable === true && distance < body.radius + Math.max(18, body.radius * 3),
    distance, altitude, si: false
  };
  if (!si) return { eligible: body.landable === true && distance < body.radius + SPACE_CONSTANTS.LANDING_DISTANCE, distance, altitude, si: false };
  const bodyId = normalizeAstronomicalBodyId(body.name);
  const ephemeris = ctx.spaceJourneyEphemeris;
  const missionBody = [ephemeris?.source, ephemeris?.destination].find(candidate => candidate?.bodyId === bodyId);
  const navigation = ctx.spacecraftState && missionBody ? computeBodyRelativeNavigation(ctx.spacecraftState, missionBody) : null;
  if (!navigation || ephemeris?.destination?.bodyId !== bodyId) return { eligible: false, reason: 'Set a course to this destination', distance, altitude, navigation, si: true };
  const physical = evaluateLandingEligibility(ctx.spacecraftState, missionBody);
  const phaseReady = ['approach', 'home_approach'].includes(ctx.spaceJourney?.phase);
  const reasons = {
    'outside-landing-corridor': 'Approach within 25 km of the surface',
    'relative-speed-too-high': 'Slow below 120 m/s to begin descent',
    'horizontal-speed-too-high': 'Reduce sideways speed below 80 m/s',
    'spacecraft-ascending': 'Stop climbing before descent',
    'spacecraft-below-surface': 'Recover above the surface before descent',
    'solid-surface-landing-unavailable': 'No solid surface · atmospheric or orbital exploration',
    'landing-target-mismatch': 'Set a course to this destination'
  };
  return {
    eligible: phaseReady && physical.eligible, distance, altitude, navigation, physical, si: true,
    reason: !phaseReady ? 'Continue the course to the approach phase' : reasons[physical.reason] || String(physical.reason || '').replaceAll('-', ' ')
  };
}
