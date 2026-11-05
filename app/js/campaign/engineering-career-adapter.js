import { engineeringSummary } from './engineering-workspace.js';
import { WORKSPACE_PROJECTS } from './workspace-projects.js';
// A view of the existing housing owner, never another furniture or frame owner.
export function bindEngineeringCareer(
  runtime,
  experiences,
  {
    loadHousing = async () => (await import('../game/property-ui.js?v=10')).getPersonalHousing(),
  } = {}
) {
  let workspace = null;
  return experiences.registerAdapter('engineering', {
    equipment:
      'Choose an included personal workspace. Use its room plan to arrange a desk and chair, keep access clear and save a reusable design.',
    async places({ context = {} } = {}) {
      const v = (await loadHousing()).snapshot();
      const homes = v.homes;
      const home = homes.find((h) => h.id === v.starterHomeId) || homes.find((h) => h.workspace);
      workspace = home?.workspace || null;
      const current = context.place || {
        name: 'Baltimore · residential streets',
        lat: 39.2904,
        lon: -76.6122,
      };
      // Homes retain their original world origin; their local entrance coordinates
      // are resolved after travel by the property/navigation owner.
      const origin = workspace?.projects?.worldOrigin;
      const savedLocation = home?.locationId?.match(/:([-\d.]+):([-\d.]+)$/);
      const homePlace =
        home && (origin || savedLocation)
          ? {
              id: 'engineering-home',
              name: origin?.name || home.locationLabel || home.label,
              environment: 'earth',
              lat: origin?.lat ?? Number(savedLocation[1]),
              lon: origin?.lon ?? Number(savedLocation[2]),
            }
          : null;
      return [homePlace || { ...current, id: 'engineering-selected-place', environment: 'earth' }];
    },
    summary: ({ variantId, workspace: savedWorkspace }) =>
      engineeringSummary(
        runtime.worldDiscoveryRuntime?.personalHome?.snapshot().workspace || savedWorkspace || workspace || {},
        variantId
      ),
    offer: ({ place }) =>
      (workspace?.schemaVersion && workspace.schemaVersion !== 1) ||
      (workspace?.projects && workspace.projects.schemaVersion !== 1)
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason: 'This saved workspace project needs a newer version of World Explorer.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Open workspace project' : 'Choose a place',
            reason:
              'Use your saved workspace or choose an included personal room at a mapped residential entrance. Public buildings and shared property keep their normal ownership.',
            enabled: !!place,
          },
    start: ({ intent, isCurrent }) =>
      isCurrent() && Object.hasOwn(WORKSPACE_PROJECTS, intent.variantId)
        ? runtime.startGameplayPlugin?.('research-career', { intent })
        : false,
  });
}
export async function createEngineeringCareerRuntime({ runtime, intent, isActive, onNext }) {
  const home = runtime.worldDiscoveryRuntime?.personalHome;
  if (!home || !isActive())
    throw Error('The workspace is still preparing. Reopen Activities to continue.');
  const options = { variantId: intent.variantId, isActive, onNext };
  try {
    if (!(await home.startCareer(options)))
      throw Error('The workspace project could not open. Your saved arrangement is kept.');
  } catch (error) {
    home.stopCareer(options);
    throw error;
  }
  return {
    update() {},
    snapshot: () => home.snapshot(),
    dispose() {
      home.stopCareer(options);
    },
  };
}
