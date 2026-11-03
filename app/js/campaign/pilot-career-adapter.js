import { normalizeHarborRun } from './harbor-run.js';
import { PILOT_ASSIGNMENTS, pilotSummary, pilotContinuations } from './pilot-assignments.js';
export function bindPilotCareer(runtime, experiences) {
  return experiences.registerAdapter('pilot', {
    equipment:
      'A personal road delivery using your available car, a marked field case and checked loading stops. Review the route and vehicle condition before setting out. New handling reviews use physical speed; pause or mode changes keep cargo safe.',
    places: ({ profile } = {}) => {
      const base = normalizeHarborRun(profile?.harborRun),
        p = base.route?.locationSnapshot;
      return [
        {
          id: 'harbor-run-region',
          name: p?.name || base.route?.regionLabel || 'Baltimore · road logistics',
          environment: 'earth',
          lat: p?.lat ?? 39.2904,
          lon: p?.lon ?? -76.6122,
        },
      ];
    },
    summary: ({ profile, variantId }) =>
      pilotSummary(normalizeHarborRun(profile?.harborRun), variantId),
    offer: ({ profile, place }) => {
      const base = normalizeHarborRun(profile?.harborRun),
        jobs = pilotContinuations(base);
      if (base.schemaVersion !== 1 || jobs.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved delivery needs a newer version of World Explorer.',
          enabled: false,
        };
      if (runtime.activeInterior)
        return {
          state: 'temporarily-unavailable',
          label: 'Go outside first',
          reason:
            'Leave the building before starting a road delivery. Your room and saved delivery are kept.',
          enabled: false,
        };
      if (runtime.getLiveGpsSnapshot?.().active)
        return {
          state: 'temporarily-unavailable',
          label: 'Turn off Live GPS',
          reason: 'This is an in-game driving job. Turn off Live GPS in Travel before starting.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Open delivery' : 'Choose a place',
        reason:
          'Choose a checked local driving route or continue your saved field case. No timer, deposit or purchase.',
        enabled: !!place,
      };
    },
    start: ({ intent, isCurrent }) =>
      isCurrent() && Object.hasOwn(PILOT_ASSIGNMENTS, intent.variantId)
        ? runtime.startGameplayPlugin?.('research-career', { intent })
        : false,
  });
}
export async function createPilotCareerRuntime({ runtime, intent, isActive, onNext }) {
  const owner = runtime.worldDiscoveryRuntime?.harborRun;
  if (!owner || !isActive())
    throw Error('The delivery is still preparing. Reopen Activities to continue.');
  const options = { variantId: intent.variantId, isActive, onNext };
  try {
    if (!(await owner.startCareer(options)))
      throw Error('The delivery could not open. Your saved cargo is kept.');
  } catch (error) {
    owner.stopCareer(options);
    throw error;
  }
  return {
    update() {},
    snapshot: () => owner.snapshot(),
    dispose() {
      owner.stopCareer(options);
    },
  };
}
