import { companionHandlingView } from './companion-handling.js';
export function bindCompanionCareer(runtime, experiences) {
  let companions = [];
  return experiences.registerAdapter('companions', {
    equipment:
      'Your first dog is included. Use the existing companion controls for free care, level 2 Recall practice and a safe resting place. Your companion keeps its name, skills and home.',
    async places({ context = {} } = {}) {
      companions = await (await experiences.getStore()).listCompanions();
      return [
        {
          ...(context.place || { name: 'Baltimore', lat: 39.2904, lon: -76.6122 }),
          id: 'companion-place',
          environment: 'earth',
        },
      ];
    },
    summary: () => {
      const v = companionHandlingView(
        runtime.worldDiscoveryRuntime?.companionRuntime?.snapshot() || { companions }
      );
      return {
        title: v.title,
        summary: v.summary + ' Next: ' + v.next + '.',
        actionLabel: 'Open companions',
      };
    },
    offer: ({ place }) => ({
      state: place ? 'ready' : 'needs-place',
      label: place ? 'Explore together' : 'Choose a place',
      reason:
        'Care and supported practice use your current companions. Progress and resting places are saved on this device.',
      enabled: !!place,
    }),
    start: ({ intent, isCurrent }) =>
      isCurrent() && intent.variantId === 'campaign'
        ? runtime.startGameplayPlugin?.('research-career', { intent })
        : false,
  });
}
export async function createCompanionCareerRuntime({ runtime, isActive, onNext }) {
  const owner = runtime.worldDiscoveryRuntime?.ui;
  if (!owner || !isActive())
    throw Error('Your companions are still preparing. Reopen Activities to continue.');
  const options = {
    isActive,
    onNext,
    onField: () => runtime.stopGameplayPlugin?.('companion-fieldwork'),
  };
  try {
    if (!(await owner.startCompanionCareer(options)))
      throw Error('Your companion controls could not open. Your saved companions are kept.');
  } catch (error) {
    owner.stopCompanionCareer(options);
    throw error;
  }
  return {
    update() {},
    snapshot: () => ({
      careerId: 'companions',
      variantId: 'campaign',
      ...owner.companionSnapshot(),
    }),
    dispose() {
      owner.stopCompanionCareer(options);
    },
  };
}
