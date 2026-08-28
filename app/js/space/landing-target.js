import { normalizeAstronomicalBodyId } from '../astronomy/body-catalog.js?v=2';

function resolveCompletedLandingTarget(spaceFlight = {}, journey = null) {
  const journeyDestination = ['surface', 'complete'].includes(journey?.phase)
    ? normalizeAstronomicalBodyId(journey.destinationBodyId)
    : null;
  if (journeyDestination) return journeyDestination;
  return normalizeAstronomicalBodyId(spaceFlight._landingTarget) ||
    normalizeAstronomicalBodyId(spaceFlight.destination) ||
    null;
}

export { resolveCompletedLandingTarget };
