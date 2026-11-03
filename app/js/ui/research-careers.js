import { meteorologyCareerSummary } from '../campaign/meteorology-career.js';
import { hydrologyCareerSummary } from '../campaign/hydrology-career.js';
import { createMarineCareerTravel } from '../campaign/marine-career-travel.js';
import {
  normalizeMarineBiologyCareer,
  marineBiologyCareerSummary,
  MARINE_BIOLOGY_STUDIES,
} from '../campaign/marine-biology-career.js';
import {
  oceanographyCareerSummary,
  OCEANOGRAPHY_STATIONS,
} from '../campaign/oceanography-career.js';
import { createOceanographyTravel } from '../campaign/oceanography-travel.js';
import { ensureMarineResearch } from '../ocean/research-outing.js';
import { botanyCareerSummary } from '../campaign/botany-career.js';
import { wildlifeCareerSummary } from '../campaign/wildlife-career.js';
import { palaeontologyCareerSummary } from '../campaign/palaeontology-career.js';
import { geologyCareerSummary } from '../campaign/geology-career.js';
import { geologyStartingPlaces } from '../campaign/geology-places.js';
import { archaeologyCareerSummary } from '../campaign/archaeology-career.js';
import { fieldResearchPlaces } from '../campaign/field-research-places.js';
// Lazily mount the selected field domain through the existing single active gameplay owner.
export function bindResearchCareers(runtime, experiences, { onJournal, requestWorldFocus } = {}) {
  let active = null,
    generation = 0;
  const domains = {
    'career:meteorologist': async () =>
      (await import('../campaign/meteorology-runtime.js')).createMeteorologyCareerRuntime,
    'career:hydrologist': async () =>
      (await import('../campaign/hydrology-runtime.js')).createHydrologyCareerRuntime,
    'career:botanist': async () =>
      (await import('../campaign/botany-runtime.js')).createBotanyCareerRuntime,
    'career:wildlife-ecologist': async () =>
      (await import('../campaign/wildlife-career-runtime.js')).createWildlifeCareerRuntime,
    'career:palaeontologist': async () =>
      (await import('../campaign/palaeontology-runtime.js')).createPalaeontologyCareerRuntime,
    'career:geologist': async () =>
      (await import('../campaign/geology-runtime.js')).createGeologyCareerRuntime,
    'career:archaeologist': async () =>
      (await import('../campaign/archaeology-runtime.js')).createArchaeologyCareerRuntime,
  };
  runtime.registerGameplayPlugin({
    id: 'research-career',
    label: 'Research fieldwork',
    category: 'fieldwork',
    async start({ intent }) {
      const run = ++generation,
        load = Object.hasOwn(domains, intent?.experienceId) ? domains[intent.experienceId] : null;
      if (!load) return false;
      const [createRuntime, store] = await Promise.all([load(), experiences.getStore()]);
      if (run !== generation) return false;
      const next = await createRuntime({
        runtime,
        store,
        intent,
        onJournal,
        requestWorldFocus,
        isActive: () => run === generation,
        onNext: () => {
          runtime.stopGameplayPlugin?.('next-field-study');
          void experiences.open({ experienceId: intent.experienceId });
        },
      });
      if (run !== generation) {
        next.dispose();
        return false;
      }
      active = next;
      return next.snapshot();
    },
    update: (dt) => active?.update(dt),
    stop() {
      generation++;
      active?.dispose();
      active = null;
    },
    save: () => active?.snapshot() || null,
  });
  const marine = ensureMarineResearch(runtime),
    oceanography = marine.oceanography;
  oceanography.setNavigation({
    onJournal,
    onNext: () => {
      marine.pauseCareer();
      void experiences.open({ experienceId: 'career:oceanographer' });
    },
  });
  experiences.registerAdapter('oceanography', {
    equipment:
      'Your research vessel provides a chart table, physical training CTD, submarine and wet lab. Compare matched profiles, keep sonar uncertainty and return to the same vessel.',
    places: () => [
      { id: 'coral-shelf-research', environment: 'ocean', ...OCEANOGRAPHY_STATIONS[0] },
    ],
    offer: ({ profile, place }) =>
      profile?.researchCareers?.oceanography?.schemaVersion &&
      profile.researchCareers.oceanography.schemaVersion !== 1
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason: 'This saved ocean survey needs a newer version of World Explorer.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Board research vessel' : 'Choose a survey vessel',
            reason:
              'Begin aboard the existing Coral Shelf research vessel. Authored water profiles and virtual features remain distinct from archived regional charts.',
            enabled: !!place && !runtime.sharedMarine?.active,
          },
    summary: ({ profile, variantId }) =>
      oceanographyCareerSummary(profile?.researchCareers?.oceanography, { variantId }),
    travel: createOceanographyTravel({
      runtime,
      readProfile: async () => (await experiences.getStore()).getProfile(),
      travelToOcean: experiences.travelToOcean,
    }),
    start: ({ intent, isCurrent }) =>
      marine.chooseCareer('oceanography', intent.variantId || 'campaign', { isCurrent }),
  });
  const marineBiology = marine.marineBiology;
  marineBiology.setNavigation({
    onJournal,
    requestWorldFocus,
    onNext: () => {
      marine.pauseCareer();
      void experiences.open({ experienceId: 'career:marine-biologist' });
    },
  });
  experiences.registerAdapter('marine-biology', {
    equipment:
      'The research vessel supplies its submarine camera and wet lab. Compare marked water habitats, retain viewing distance and keep each observation with its method.',
    places: ({ variantId = 'campaign' } = {}) => {
      const study = MARINE_BIOLOGY_STUDIES[variantId];
      return study ? [{ id: 'offshore-marine-study', environment: 'ocean', ...study.site }] : [];
    },
    offer: ({ profile, place }) =>
      profile?.researchCareers?.['marine-biology']?.schemaVersion &&
      profile.researchCareers['marine-biology'].schemaVersion !== 1
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason: 'This saved marine study needs a newer World Explorer version.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Board research vessel' : 'Choose an observation vessel',
            reason:
              'A reviewed offshore game habitat with licensed virtual dolphins. Individual sightings remain separate from population estimates.',
            enabled: !!place && !runtime.sharedMarine?.active,
          },
    summary: ({ profile, variantId }) =>
      marineBiologyCareerSummary(profile?.researchCareers?.['marine-biology'], { variantId }),
    travel: createMarineCareerTravel({
      domainId: 'marine-biology',
      normalize: normalizeMarineBiologyCareer,
      sitesForVariant: (id) =>
        MARINE_BIOLOGY_STUDIES[id] ? [MARINE_BIOLOGY_STUDIES[id].site] : [],
      runtime,
      readProfile: async () => (await experiences.getStore()).getProfile(),
      travelToOcean: experiences.travelToOcean,
    }),
    start: ({ intent, isCurrent }) =>
      marine.chooseCareer('marine-biology', intent.variantId || 'campaign', { isCurrent }),
  });
  experiences.registerAdapter('meteorology', {
    recoveryActions: ['relocate-course'],
    equipment:
      'Two supported working cup/vane instruments, miniature replay sky displays, an illustrative shelter screen and forecast bench are supplied. Existing public weather metadata remains separate from the training replay.',
    places: (input = {}) =>
      fieldResearchPlaces('meteorology', {
        ...input,
        completedRecord:
          input.profile?.researchCareers?.meteorology?.records?.[input.variantId || 'campaign'],
        defaultDestination: { name: 'Druid Hill Park · park lawns', lat: 39.3173, lon: -76.64044 },
      }),
    offer: ({ place, profile }) =>
      profile?.researchCareers?.meteorology?.schemaVersion &&
      profile.researchCareers.meteorology.schemaVersion !== 1
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason: 'This saved weather study needs a newer World Explorer version.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Begin weather study' : 'Choose a training site',
            reason:
              'Clear dry support is checked for both instrument footprints. Identify the existing source, measure the replay and save a forecast before its comparison period.',
            enabled: !!place,
          },
    summary: ({ profile, variantId }) =>
      meteorologyCareerSummary(profile?.researchCareers?.meteorology, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('hydrology', {
    recoveryActions: ['relocate-course'],
    equipment:
      'A supported virtual stream, metre gates, three floats, nine-path clarity instrument and catchment bench are supplied. Archived USGS records remain separate from the training readings.',
    places: (input = {}) =>
      fieldResearchPlaces('hydrology', {
        ...input,
        completedRecord:
          input.profile?.researchCareers?.hydrology?.records?.[input.variantId || 'campaign'],
        defaultDestination: { name: 'Druid Hill Park · park lawns', lat: 39.3173, lon: -76.64044 },
      }),
    offer: ({ place, profile }) =>
      profile?.researchCareers?.hydrology?.schemaVersion &&
      profile.researchCareers.hydrology.schemaVersion !== 1
        ? {
            state: 'unavailable',
            label: 'Update required',
            reason: 'This saved water study needs a newer World Explorer version.',
            enabled: false,
          }
        : {
            state: place ? 'ready' : 'needs-place',
            label: place ? 'Begin water study' : 'Choose a training site',
            reason:
              'A clear dry area and the full supported stream footprint are checked after travel. These are virtual instrument readings, not local river data.',
            enabled: !!place,
          },
    summary: ({ profile, variantId }) =>
      hydrologyCareerSummary(profile?.researchCareers?.hydrology, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('geology', {
    equipment:
      'The virtual field course provides a hand lens, grain probe, sample labels and bench. Training specimens stay in your Backpack and Journal.',
    places: geologyStartingPlaces,
    offer: ({ place, profile }) => {
      const state = profile?.researchCareers?.geology;
      if (state?.schemaVersion && state.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved field career needs a newer version of World Explorer.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Begin field course' : 'Choose a field course',
        reason:
          'A clear, dry training area is checked after travel. The virtual exposures do not describe rocks at this real location.',
        enabled: !!place,
      };
    },
    summary: ({ profile, variantId }) =>
      geologyCareerSummary(profile?.researchCareers?.geology, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('botany', {
    recoveryActions: ['relocate-course'],
    equipment:
      'Three training plant beds provide diagnostic structures and paired light/moisture instruments. A marked treatment and untreated plot use the same sixteen sampling points through explicitly virtual seasons. Plant plates and restoration records stay in Journal.',
    places: (input) => fieldResearchPlaces('botany', input),
    offer: ({ place, profile }) => {
      const state = profile?.researchCareers?.botany;
      if (state?.schemaVersion && state.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved plant study needs a newer version of World Explorer.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Begin plant study' : 'Choose a training site',
        reason:
          'A clear, dry area in a mapped park, woodland or field is checked after travel. Authored varieties and virtual seasons do not describe plants or conditions at this real place.',
        enabled: !!place,
      };
    },
    summary: ({ profile, variantId }) =>
      botanyCareerSummary(profile?.researchCareers?.botany, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('wildlife', {
    recoveryActions: ['relocate-course'],
    equipment:
      'Two virtual habitat plots provide observation markers, transects, diagnostic training signs, the walking camera, mounted virtual motion sensors and a comparison bench. Checklists and photographs stay in Journal; no animals are collected.',
    places: (input) => fieldResearchPlaces('wildlife', input),
    offer: ({ place, profile }) => {
      const state = profile?.researchCareers?.wildlife;
      if (state?.schemaVersion && state.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved wildlife career needs a newer version of World Explorer.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Begin habitat study' : 'Choose a training site',
        reason:
          'A clear, dry area in a mapped park, woodland or field is checked after travel. Virtual habitat models do not establish real wildlife sightings.',
        enabled: !!place,
      };
    },
    summary: ({ profile, variantId }) =>
      wildlifeCareerSummary(profile?.researchCareers?.wildlife, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('palaeontology', {
    recoveryActions: ['relocate-course'],
    equipment:
      'A freestanding invented fossil formation provides a north marker, scale, camera, bounded preparation tools, supports and comparison bench. Training casts stay in Backpack; photographs and records save in Journal.',
    places: (input) => fieldResearchPlaces('palaeontology', input),
    offer: ({ place, profile }) => {
      const state = profile?.researchCareers?.palaeontology;
      if (state?.schemaVersion && state.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved fossil career needs a newer version of World Explorer.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Begin fossil case' : 'Choose a training site',
        reason:
          'A clear, dry area is checked after travel. The invented formation is not a fossil occurrence at this real location.',
        enabled: !!place,
      };
    },
    summary: ({ profile, variantId }) =>
      palaeontologyCareerSummary(profile?.researchCareers?.palaeontology, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
  experiences.registerAdapter('archaeology', {
    equipment:
      'A freestanding fictional training trench provides a one-metre grid, tape, compass, trowel, brush, labelled packing and catalog bench. Real heritage sites remain observation-only.',
    places: (input) => fieldResearchPlaces('archaeology', input),
    offer: ({ place, profile }) => {
      const state = profile?.researchCareers?.archaeology;
      if (state?.schemaVersion && state.schemaVersion !== 1)
        return {
          state: 'unavailable',
          label: 'Update required',
          reason: 'This saved archaeology career needs a newer version of World Explorer.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Begin training case' : 'Choose a training site',
        reason:
          'A clear, dry area is checked after travel. The fictional site does not alter the terrain or grant real excavation permission.',
        enabled: !!place,
      };
    },
    summary: ({ profile, variantId }) =>
      archaeologyCareerSummary(profile?.researchCareers?.archaeology, { variantId }),
    start: ({ intent, isCurrent }) =>
      isCurrent() ? runtime.startGameplayPlugin?.('research-career', { intent }) : false,
  });
}
