import { planetaryCareerSummary } from './planetary-career.js';
import {
  lunarStudyEventIds,
  lunarStudyReport,
  lunarStudyState,
} from '../planetary/lunar-study-records.js';
import { lunarStudyMissionId } from '../planetary/lunar-survey.js';
const loadOwner = async () => {
  const [{ createDestinationMissionStore }, { getDestinationMission }, { createExpeditionStore }] =
    await Promise.all([
      import('../universe/mission-authority.js?v=3'),
      import('../universe/mission-catalog.js?v=3'),
      import('../expedition/store.js?v=12'),
    ]);
  const expedition = createExpeditionStore();
  return {
    store: createDestinationMissionStore(),
    moon: getDestinationMission('moon'),
    journey: expedition.load()?.podJourney || null,
    expeditionProtected: expedition.status().protectedRecord,
  };
};
const resumeOwner = async (runtime) =>
  (await import('../expedition/runtime.js?v=52')).resumeSavedExpedition(runtime);
const boardShip = async (runtime, options) =>
  (await import('../expedition/runtime.js?v=52')).boardSolisReachDirect(runtime, options);
export function bindPlanetaryCareer(
  runtime,
  experiences,
  { loadMissionOwner = loadOwner, board = boardShip, resume = resumeOwner } = {},
) {
  let view = { ready: false, profileVersion: null, events: [], ledger: null, status: 'ready' };
  async function ensureMissionOwner(isCurrent) {
    // A cold Moon launch also needs the existing ascent gateway ready before
    // Pathfinder's synchronous departure commit. This does not enter Space.
    if (typeof runtime.startSpaceFlightFromExpeditionSurface !== 'function') {
      await runtime.ensureSpaceRuntime?.();
      if (!isCurrent()) return false;
    }
    if (typeof runtime.selectLunarStudy !== 'function') {
      const { initDestinationMissionRuntime } = await import('../universe/mission-runtime.js?v=8');
      if (!isCurrent()) return false;
      initDestinationMissionRuntime(runtime);
    }
    return isCurrent();
  }
  const sameProfile = (profile) => view.ready && view.profileVersion === profile?.updatedAt;
  return experiences.registerAdapter('planetary', {
    equipment:
      'Solis Reach supplies the lunar field kit, Pathfinder, analysis lab and return reserve. The Moon uses the existing NASA/ASU terrain; samples are virtual analogs. Bring the field book back to your Earth workspace.',
    async places({ profile, context = {}, variantId = 'campaign' } = {}) {
      const [owner, store] = await Promise.all([loadMissionOwner(), experiences.getStore()]);
      const events = await store.getEventsById(lunarStudyEventIds);
      view = {
        ready: true,
        profileVersion: profile?.updatedAt,
        events,
        ledger: owner.store.load(),
        status: owner.expeditionProtected ? 'protected' : owner.store.status,
        journey: owner.journey,
      };
      const p = context.place || runtime.LOC || { lat: 39.29095, lon: -76.61085 };
      // Launch anchors retain the existing Earth return location. The lunar
      // surface and pod owners supply their own native coordinates.
      const onSurface =
        owner.journey?.phase === 'surface' &&
        owner.journey.bodyId === 'moon' &&
        view.ledger.activeMissionId === lunarStudyMissionId(variantId);
      return [
        {
          id: onSurface ? 'lunar-pod-return-site' : 'solis-reach-lunar-study',
          name: onSurface ? 'Moon · Pathfinder return site' : 'Solis Reach · Earth orbit',
          environment: onSurface ? 'moon' : 'space',
          lat: p.lat,
          lon: p.lon,
        },
      ];
    },
    summary: ({ profile, variantId, planetaryView }) => {
      const context = planetaryView ? {...planetaryView} : sameProfile(profile) ? { ...view } : { ready: false },
        live = runtime.getDestinationMissionSnapshot?.();
      context.environment = runtime.getEnv?.();
      if (live?.destinationId === 'moon' && live.activeMissionId)
        context.ledger = {
          ...(context.ledger || {}),
          activeMissionId: live.activeMissionId,
          missions: {
            ...(context.ledger?.missions || {}),
            [live.activeMissionId]: { ...live, missionId: live.activeMissionId },
          },
        };
      return planetaryCareerSummary(context, { variantId });
    },
    offer({ place, profile }) {
      if (sameProfile(profile) && view.status !== 'ready')
        return {
          state: 'unavailable',
          label: 'Saved mission needs attention',
          reason:
            'Your saved mission is retained. Use its compatible build or reload after another tab finishes before starting a lunar assignment.',
          enabled: false,
        };
      if (
        runtime.gameStarted &&
        runtime.getEnv?.() === 'SPACE_FLIGHT' &&
        runtime.universeRuntime?.current?.id &&
        runtime.universeRuntime.current.id !== 'sol'
      )
        return {
          state: 'unavailable',
          label: 'Return to the Solar System',
          reason:
            'Finish the active transfer and return to the Solar System before this local Moon study. Your expedition plan is kept.',
          enabled: false,
        };
      return {
        state: place ? 'ready' : 'needs-place',
        label: place ? 'Visit Solis Reach' : 'Choose the ship',
        reason:
          'Choose and calibrate the field method at the ship’s Science Lab. Each assignment keeps its own observations, specimens and Earth display.',
        enabled: !!place,
      };
    },
    async travel({ intent, isCurrent }) {
      if (!isCurrent() || !(await ensureMissionOwner(isCurrent))) return false;
      if (view.journey && !['aboard', 'recovered', 'failed'].includes(view.journey.phase)) {
        await resume(runtime);
        if (!isCurrent()) return false;
      }
      if (
        runtime.gameStarted &&
        !runtime.worldLoading &&
        ['SPACE_FLIGHT', 'MOON'].includes(runtime.getEnv?.())
      ) {
        if (runtime.getEnv() === 'MOON') return true;
        if (runtime.universeRuntime?.current?.id !== 'sol') return false;
        if (intent.place.environment === 'space') return true;
      }
      return (await experiences.travelToPlace(intent.place)) !== false && isCurrent();
    },
    async start({ intent, isCurrent }) {
      if (!isCurrent()) return false;
      try {
        const events = await (await experiences.getStore()).getEventsById(lunarStudyEventIds);
        if (!isCurrent()) return false;
        const saved = lunarStudyState(events),
          pendingHome = Object.keys(saved.reports).find(
            (id) => saved.reports[id] && !saved.displays[id],
          );
        if (
          (pendingHome && pendingHome !== (intent.variantId || 'campaign')) ||
          ((intent.variantId || 'campaign') !== 'campaign' && !saved.displays.campaign)
        ) {
          runtime.showToast?.(
            'Bring the current field book home and review it at your desk before another assignment.',
          );
          return false;
        }
        const original = lunarStudyReport(
          events.find((e) => e.eventId === 'event:destination-mission:moon'),
        );
        if (!(await ensureMissionOwner(isCurrent))) return false;
        const active = runtime.getDestinationMissionSnapshot?.();
        if (
          runtime.getEnv?.() === 'MOON' &&
          active?.activeMissionId !== lunarStudyMissionId(intent.variantId || 'campaign')
        ) {
          runtime.showToast?.('Return in Pathfinder before preparing another lunar study.');
          return false;
        }
        if (original) runtime.restoreLunarStudyFromJournal?.(original);
        if (!isCurrent() || runtime.selectLunarStudy?.(intent.variantId || 'campaign') !== true)
          return false;
        if (runtime.getEnv?.() === 'MOON') {
          runtime.setTravelMode?.('walk', { source: 'planetary-career' });
          return true;
        }
        if (view.journey && !['aboard', 'recovered', 'failed'].includes(view.journey.phase)) {
          await resume(runtime);
          if (!isCurrent()) return false;
        }
        const pod = runtime.getInterstellarExpeditionSnapshot?.()?.podJourney || view.journey;
        if (
          pod &&
          !['aboard', 'recovered', 'failed'].includes(pod.phase) &&
          !(pod.bodyId === 'earth' && pod.phase === 'surface')
        )
          return true;
        if (runtime.activeShipInterior) return true;
        return (await board(runtime, { isCurrent })) === true && isCurrent();
      } catch (error) {
        runtime.showToast?.(
          error.message || 'Your lunar records are kept. Reopen the assignment to retry.',
        );
        return false;
      }
    },
  });
}
