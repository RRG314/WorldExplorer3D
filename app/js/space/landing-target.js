import { normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=3';

function resolveCompletedLandingTarget(spaceFlight = {}, journey = null) {
  const runtimeTarget = String(spaceFlight._runtimeLandingTarget || '').trim().toLowerCase();
  if (runtimeTarget) return runtimeTarget;
  const journeyDestination = ['surface', 'complete'].includes(journey?.phase)
    ? normalizeAstronomicalBodyId(journey.destinationBodyId)
    : null;
  if (journeyDestination) return journeyDestination;
  return normalizeAstronomicalBodyId(spaceFlight._landingTarget) ||
    normalizeAstronomicalBodyId(spaceFlight.destination) ||
    null;
}

export { resolveCompletedLandingTarget };
