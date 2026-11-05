import { explorerCareerSummary, explorerCareerView } from './explorer-career.js';
import { harborJourneyEventIds } from './lunar-homecoming.js';
import { normalizeOpeningChapter } from './first-bearings.js?v=1';
import { CORAL_SHELF_SITE } from '../ocean/habitat-plan.js';
export function bindExplorerCareer(
  runtime,
  experiences,
  {
    loadHousing = async () =>
      (await import('../game/property-ui.js?v=10')).getPersonalHousing().snapshot(),
  } = {}
) {
  let events = [];
  return experiences.registerAdapter('explorer', {
    equipment:
      'Use your existing field tools for First Bearings. Continue with a local delivery, photo album or Maker workspace, then your home, coastal vessel and lunar field kit. Each chapter explains its tools when you open it.',
    async places({ profile, context = {} } = {}) {
      events = await (await experiences.getStore()).getEventsById(harborJourneyEventIds);
      const chapter = normalizeOpeningChapter(profile?.openingChapter);
      let homePlace = null;
      if (explorerCareerView(profile, events).next?.target === 'home') {
        const housing = await loadHousing(),
          home =
            housing.homes.find((h) => h.id === housing.primaryHomeId) ||
            housing.homes.find((h) => h.id === housing.starterHomeId),
          origin = home?.workspace?.projects?.worldOrigin,
          legacy = home?.locationId?.match(/:([-\d.]+):([-\d.]+)$/);
        homePlace =
          origin ||
          (legacy
            ? { lat: Number(legacy[1]), lon: Number(legacy[2]), name: home.locationLabel }
            : null);
      }
      const p = homePlace ||
        (chapter.phase === 'active' && chapter.locationSnapshot) ||
        context.place || { name: 'Baltimore', lat: 39.2904, lon: -76.6122 };
      return [
        {
          id: 'explorer-start',
          name: p.name || chapter.regionLabel || 'Your starting place',
          lat: p.lat,
          lon: p.lon,
          environment: 'earth',
        },
      ];
    },
    summary: ({ profile, journeyEvents }) => explorerCareerSummary(profile, journeyEvents || events),
    offer: ({ profile, place }) =>
      normalizeOpeningChapter(profile?.openingChapter).schemaVersion !== 1
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason:
              'Your saved opening needs a newer version of World Explorer. Your journey is kept.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Open Explorer journey' : 'Choose a place',
            reason:
              'Your saved chapters are kept. Continue the next unfinished step, review a result or explore freely.',
            enabled: !!place,
          },
    start: ({ intent, isCurrent }) =>
      isCurrent() && intent.variantId === 'campaign'
        ? runtime.startGameplayPlugin?.('research-career', { intent })
        : false,
  });
}
export async function createExplorerCareerRuntime({
  runtime,
  isActive,
  onActivity,
  onNext,
  travelToOcean,
}) {
  const owner = runtime.worldDiscoveryRuntime?.ui;
  if (!owner || !isActive())
    throw Error('Your journey is still preparing. Reopen Activities to continue.');
  const options = {
    isActive,
    onNext,
    onNavigate: async (target) => {
      if (target.startsWith('career:')) {
        onActivity(target);
        return true;
      }
      if (target === 'careers') {
        onActivity();
        return true;
      }
      if (target === 'coast') {
        const store = runtime.discoveryProfileStore,
          [profile, events] = await Promise.all([
            store.getProfile(),
            store.getEventsById(harborJourneyEventIds),
          ]);
        if (!isActive()) return false;
        const marine = runtime.marineResearch;
        if (
          !marine ||
          (
            await Promise.all([
              marine.coastal.refresh(),
              marine.investigation.refresh(),
              marine.refresh(),
            ])
          ).some((ready) => ready === false)
        )
          throw Error(
            'Your coastal records could not be read. Your saved voyage is kept; reopen Activities to retry.'
          );
        if (!isActive()) return false;
        const voyage = explorerCareerView(profile, events).resumeVoyage;
        runtime.toggleWorldDiscoveryJournal?.(false);
        if (voyage) {
          if (!runtime.oceanVoyage?.resume)
            throw Error('The saved vessel is still preparing. Reopen Activities to retry.');
          return runtime.oceanVoyage.resume(voyage);
        }
        return travelToOcean({
          ...CORAL_SHELF_SITE,
          id: 'explorer-coral-shelf',
          name: 'Coral Shelf · research vessel',
          environment: 'ocean',
        });
      }
      throw Error('Choose an available chapter action.');
    },
  };
  try {
    if (!(await owner.startExplorerCareer(options)))
      throw Error('Your journey could not open. Reopen Activities to retry.');
  } catch (error) {
    owner.stopExplorerCareer(options);
    throw error;
  }
  return {
    update() {},
    snapshot: () => ({ careerId: 'explorer', variantId: 'campaign', ...owner.explorerSnapshot() }),
    dispose() {
      owner.stopExplorerCareer(options);
    },
  };
}
