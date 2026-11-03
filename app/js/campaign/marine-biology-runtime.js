import {
  normalizeMarineBiologyCareer,
  MARINE_BIOLOGY_STUDIES,
  MARINE_BIOLOGY_PROTOCOL,
  marineBehaviorOptions,
  marineHabitatComparison,
} from './marine-biology-career.js';
import { createMarineObservationRecorder } from './marine-observation-recorder.js';
import { createMarineObservationView, marineVisualSubjects } from './marine-observation-view.js';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { earthLocalToGeographic } from '../earth-core/location-origin.js?v=1';
import { marineGeometryLineClear } from '../ocean/geometry-line-of-sight.js';

// A domain in the existing marine service. That owner supplies normal ticks;
// the existing profile store is the only durable command authority.
export function createMarineBiologyRuntime(
  ctx,
  {
    store,
    now = Date.now,
    createRecorder = createMarineObservationRecorder,
    createView = createMarineObservationView,
  } = {}
) {
  const recorder = createRecorder({ wallClock: now });
  let state = normalizeMarineBiologyCareer(),
    enabled = false,
    ready = false,
    busy = false,
    disposed = false,
    epoch = 0,
    refreshGeneration = 0,
    variantId = 'campaign',
    selectedVoyageId = null,
    selectedIndividualId = '',
    message = '',
    error = '',
    view = null,
    preview = [],
    viewRevision = 0,
    navigation = {};
  const unit = () => ctx.METERS_PER_WORLD_UNIT || 1,
    mode = () => ctx.oceanMode,
    voyage = () => ctx.oceanVoyage?.current,
    study = () => MARINE_BIOLOGY_STUDIES[variantId],
    active = () =>
      state.schemaVersion === 1 && state.active?.variantId === variantId ? state.active : null,
    phase = () => active()?.phase || 'briefing',
    underwater = () => !!mode()?.active,
    same = () => {
      const a = active(),
        v = voyage();
      return (
        !a ||
        (v?.id === a.voyage.id &&
          v.ship.transportEntityId === a.voyage.ship.transportEntityId &&
          v.subId === a.voyage.subId)
      );
    },
    supported = () =>
      !disposed &&
      enabled &&
      ctx.gameStarted &&
      !ctx.worldLoading &&
      !ctx.sharedMarine?.active &&
      !ctx.getLiveGpsSnapshot?.().active &&
      voyage()?.ship.transportCatalogId === 'ocean-research-vessel' &&
      (underwater()
        ? mode().submarine.transportEntityId === voyage().subId
        : ctx.boatMode?.active &&
          ctx.boatMode.transportEntityId === voyage().ship.transportEntityId) &&
      same() &&
      (!selectedVoyageId || selectedVoyageId === voyage().id),
    distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * unit(),
    origin = () => mode()?.frameOrigin || mode()?.launchSite || voyage()?.site,
    geographic = (p) => earthLocalToGeographic(origin(), ctx.SCALE, p.x, p.z),
    currentPosition = () => (underwater() ? mode().submarine.position : ctx.boat),
    stationDistance = (id) =>
      ctx.boatDeck?.active ? (ctx.boatDeck.stationDistance?.(id) ?? Infinity) : Infinity;
  function instrumentAvailable() {
    const m = mode();
    return (
      supported() &&
      !!m?.active &&
      !m.diver?.active &&
      m.depthProfile?.model === 'geographic-metres-v1' &&
      m.cetaceanPlan?.allowed === true &&
      (m.cetaceans || []).some((a) => a.visualState === 'licensed') &&
      (!m.stream || m.stream.canNavigate(m.submarine.position.x, m.submarine.position.z))
    );
  }
  function station(index = active()?.habitats.length || 0) {
    const which = Math.min(1, index),
      site = study().site,
      metres = earthCoordinateFrame(site, 111000),
      recorded = active()?.habitats?.[which]?.contexts?.[0]?.habitat,
      coordinate = recorded?.coordinate || metres.toGeographic(which ? -85 : -65, which ? 100 : 60),
      point = earthCoordinateFrame(origin() || site, ctx.SCALE).toWorld(
        coordinate.lat,
        coordinate.lon
      ),
      water = mode()?.waterSurface?.sample(point.x, point.z),
      depth = study().actorDepths[which];
    return {
      id: study().habitats[which],
      label: which
        ? variantId === 'open-water'
          ? 'Deeper water habitat'
          : 'Lower water habitat'
        : 'Upper water habitat',
      coordinate,
      position: { x: point.x, y: (water?.surfaceY || 0) - depth / unit(), z: point.z },
      depthBand: study().depthBands[which],
      depthMeters: depth,
    };
  }
  function evidence(stationId = null) {
    const p = currentPosition() || {};
    return {
      voyage: voyage(),
      shared: !!ctx.sharedMarine?.active,
      liveGps: !!ctx.getLiveGpsSnapshot?.().active,
      paused: !!ctx.paused,
      at: now(),
      position: underwater() ? geographic(p) : earthLocalToGeographic(ctx.LOC, ctx.SCALE, p.x, p.z),
      localPosition: { x: p.x, y: p.y, z: p.z },
      environment: underwater() ? 'OCEAN' : 'EARTH',
      mode: underwater() ? 'submarine' : 'research-deck',
      stationId,
      stationDistanceMeters: stationId ? stationDistance(stationId) : null,
      moored: !!ctx.boatMode?.moored,
      speedMetersPerSecond:
        Math.hypot(ctx.boat?.speed || 0, ctx.boat?.vx || 0, ctx.boat?.vz || 0) * unit(),
    };
  }
  async function refresh() {
    const token = ++refreshGeneration;
    try {
      const profile = await store().getProfile();
      if (disposed || token !== refreshGeneration) return false;
      state = normalizeMarineBiologyCareer(profile.researchCareers?.['marine-biology']);
      ready = true;
      return true;
    } catch {
      ready = false;
      error = 'The marine Journal could not load. Your vessel and previous observations are kept.';
      return false;
    }
  }
  async function save(command, stationId = null, isCurrent = () => true) {
    const run = epoch,
      e = evidence(stationId),
      ids = [e.voyage?.id, e.voyage?.ship.transportEntityId, e.voyage?.subId].join(':'),
      current = () =>
        !disposed &&
        enabled &&
        run === epoch &&
        isCurrent() &&
        supported() &&
        underwater() === (e.environment === 'OCEAN') &&
        [voyage()?.id, voyage()?.ship.transportEntityId, voyage()?.subId].join(':') === ids &&
        (!stationId || stationDistance(stationId) <= 2.4);
    const result = await store().updateResearchCareer(
      'marine-biology',
      { ...command, revision: state.revision, evidence: e },
      { now: now(), isCurrent: current }
    );
    if (!current()) return false;
    state = result.state;
    message =
      phase() === 'complete' ? 'Habitat plate saved to Journal.' : 'Marine observation saved.';
    return true;
  }
  async function choose(selected, { isCurrent = () => true } = {}) {
    if (!MARINE_BIOLOGY_STUDIES[selected]) throw Error('Choose a supported marine study.');
    if (!isCurrent()) return false;
    if (!(await refresh())) throw Error(error);
    if (!isCurrent()) return false;
    if (state.schemaVersion !== 1) throw Error('This saved marine study needs a newer version.');
    if (state.active && state.active.phase !== 'complete' && state.active.variantId !== selected)
      throw Error('Continue the current marine study first.');
    epoch++;
    enabled = true;
    variantId = selected;
    selectedVoyageId = voyage()?.id || null;
    selectedIndividualId = '';
    error = message = '';
    recorder.reset();
    view?.clear();
    preview = [];
    if (state.records[selected] && state.active?.variantId !== selected)
      return save(
        { type: 'accept', variantId: selected, runId: crypto.randomUUID() },
        null,
        isCurrent
      );
    return true;
  }
  function reading({ force = false } = {}) {
    const m = mode(),
      p = m?.submarine?.position,
      available = instrumentAvailable();
    if (!available || !p)
      return {
        supported: false,
        voyageId: voyage()?.id,
        subId: voyage()?.subId,
        position: p,
        sceneId: mode()?.scene?.uuid,
      };
    view ||= createView(ctx);
    const all = view.read({ force }),
      water = m.waterSurface?.sample(p.x, p.z),
      depth = Math.max(0, ((water?.surfaceY || 0) - p.y) * unit()),
      kind = phase(),
      target = station(),
      lightsReady =
        Number.isFinite(m.ambientLight?.intensity) && Number.isFinite(m.keyLight?.intensity),
      context = {
        at: now(),
        observerPosition: { ...p },
        waterSurfaceY: water?.surfaceY || 0,
        depthMeters: depth,
        depthTruth: 'measured-game-depth',
        depthSourceId: 'water-surface-observer-position-v1',
        light: {
          truthType: 'scene-lighting',
          sourceId: 'rendered-ocean-light-v1',
          relative: Math.max(
            0,
            Math.min(1, ((m.ambientLight?.intensity || 0) + (m.keyLight?.intensity || 0)) / 2)
          ),
        },
        current: { truthType: 'unavailable' },
      },
      band = kind === 'habitat' ? target.depthBand : null,
      observations = band
        ? all.filter((o) => o.depthMeters >= band[0] && o.depthMeters <= band[1])
        : all;
    preview = all;
    let allowed = lightsReady && Number.isFinite(water?.surfaceY) && !ctx.paused;
    if (kind === 'surface') allowed &&= depth <= MARINE_BIOLOGY_PROTOCOL.surfaceDepthMeters;
    if (kind === 'habitat') {
      const clear = marineGeometryLineClear(m.habitat?.plan, m.habitat?.sampleSeabedHeight, p, {
        id: 'water-habitat',
        ...target.position,
        radius: 1,
      });
      const meters = distance(p, target.position);
      allowed &&= meters <= 25 && depth >= band[0] && depth <= band[1] && clear;
      context.habitat = {
        id: target.id,
        truthType: 'virtual-habitat-view',
        ready: true,
        visible: allowed,
        lineClear: clear,
        licensedInvertebrates: false,
        position: target.position,
        coordinate: target.coordinate,
        distanceMeters: meters,
      };
    }
    return {
      supported: allowed,
      sceneId: m.scene.uuid,
      voyageId: voyage().id,
      subId: voyage().subId,
      position: { ...p },
      speedMetersPerSecond: Math.abs(m.submarine.speed || 0) * unit(),
      paused: !!ctx.paused,
      hidden: typeof document !== 'undefined' && document.hidden,
      shared: !!ctx.sharedMarine?.active,
      liveGps: !!ctx.getLiveGpsSnapshot?.().active,
      context,
      observations,
    };
  }
  async function act(type, fields = {}) {
    if (disposed || busy) return false;
    busy = true;
    error = '';
    try {
      if (type === 'retry') return await refresh();
      if (!ready || state.schemaVersion !== 1 || !supported())
        throw Error('Return to this study’s original admitted research vessel.');
      if (type === 'accept') return await save({ type, variantId, runId: crypto.randomUUID() });
      if (type === 'refresh-view') {
        reading({ force: true });
        viewRevision++;
        message = 'Visible individuals refreshed. Their labels describe virtual animals.';
        return true;
      }
      if (type === 'select-individual') {
        const candidates = reading({ force: true }).observations || [],
          candidate = candidates.find((o) => o.individualId === fields.individualId);
        if (!candidate || candidate.kind !== study().followKind)
          throw Error(
            'Look toward a licensed animal at the stated viewing distance before choosing it.'
          );
        selectedIndividualId = candidate.individualId;
        recorder.reset();
        message = 'Individual selected. Keep a clear, respectful view of this same animal.';
        return true;
      }
      if (type === 'begin-window') {
        const kind = phase();
        if (!['surface', 'habitat', 'follow'].includes(kind))
          throw Error('Begin the current observation step first.');
        const sample = reading({ force: true });
        if (sample.supported !== true)
          throw Error(
            kind === 'surface'
              ? 'Rise to the upper three game metres beside the vessel, then stop for the near-surface watch.'
              : 'Approach the marked depth/volume and let the observation assets finish loading.'
          );
        if (kind === 'follow' && !selectedIndividualId)
          throw Error('Choose a visible individual first.');
        const target = station(),
          method =
            kind === 'surface'
              ? 'surface-watch-v1'
              : kind === 'follow'
                ? 'individual-follow-v1'
                : study().method,
          gates =
            method === 'habitat-transect-v1'
              ? [
                  { ...target.position, x: target.position.x - 7.5 / unit() },
                  { ...target.position, x: target.position.x + 7.5 / unit() },
                ]
              : null;
        if (gates && distance(sample.position, gates[0]) > 2)
          throw Error('Start at the first end of the marked fifteen-metre transect.');
        recorder.start(
          {
            runId: active().runId,
            voyageId: voyage().id,
            subId: voyage().subId,
            kind,
            method,
            sceneId: mode().scene.uuid,
            viewProtocol: MARINE_BIOLOGY_PROTOCOL.viewProtocol,
            seconds: 8,
            metersPerUnit: unit(),
            ...(kind === 'habitat' ? { habitatId: target.id } : {}),
            ...(kind === 'follow' ? { individualId: selectedIndividualId } : {}),
            ...(gates ? { gates } : {}),
          },
          sample
        );
        message = 'Observation started. Only supported, unpaused effort is counted.';
        return true;
      }
      if (type === 'file-window') {
        const result = recorder.result(),
          kind = result.config.kind,
          command = {
            type:
              kind === 'surface'
                ? 'surface-watch'
                : kind === 'habitat'
                  ? 'habitat-watch'
                  : 'follow',
            window: result,
            confidence: result.observations.length ? 'virtual-label-supported' : 'not-observed',
            ...(kind === 'follow'
              ? { behavior: fields.behavior, interpretation: fields.interpretation }
              : {}),
          };
        const saved = await save(command);
        if (saved) {
          recorder.reset();
          selectedIndividualId = '';
          view?.clear();
        }
        return saved;
      }
      if (type === 'compare')
        return await save(
          {
            type,
            result: fields.result,
            limitation: fields.limitation,
            currentLimit: fields.currentLimit,
          },
          'lab'
        );
      if (type === 'report')
        return await save(
          { type, followUp: fields.followUp, followUpMethod: fields.followUpMethod },
          'lab'
        );
      throw Error('Choose an action for the current marine observation step.');
    } catch (e) {
      error =
        e.message ||
        'The observation could not save. Your previous records and ready window are kept for retry.';
      return false;
    } finally {
      busy = false;
    }
  }
  function tick(dt) {
    if (disposed || !enabled || !underwater()) return;
    const r = recorder.snapshot();
    if (r && !r.ready && !r.interrupted) recorder.tick(dt, reading());
    else if (!r && phase() === 'follow' && instrumentAvailable()) reading();
  }
  function snapshot() {
    if (state.schemaVersion !== 1)
      return {
        visible: enabled && !!voyage() && !!(ctx.boatMode?.active || underwater()),
        ready,
        unsupported: true,
        busy,
        error,
        message,
        phase: 'unavailable',
      };
    if (!enabled)
      return {
        visible: false,
        ready,
        unsupported: state.schemaVersion !== 1,
        busy,
        error,
        message,
        variantId,
        study: study(),
        active: active(),
        phase: phase(),
      };
    const a = active(),
      p = phase(),
      r = recorder.snapshot(),
      target = underwater() && p === 'habitat' ? station() : null,
      chosen =
        enabled && underwater() && p === 'follow'
          ? marineVisualSubjects(mode()).find((o) => o.individualId === selectedIndividualId)
          : null,
      lead =
        enabled && underwater() && p === 'follow' && !chosen
          ? marineVisualSubjects(mode())
              .filter((o) => o.kind === study().followKind)
              .sort(
                (one, two) =>
                  distance(mode().submarine.position, one.mesh.position) -
                  distance(mode().submarine.position, two.mesh.position)
              )[0]
          : null,
      goal = target
        ? study().method === 'habitat-transect-v1'
          ? { ...target.position, x: target.position.x + (r?.gateIndex ? 7.5 : -7.5) / unit() }
          : target.position
        : p === 'surface' && underwater()
          ? station(0).position
          : (chosen || lead)?.mesh.position,
      deckStation = ['comparison', 'report'].includes(p)
        ? 'lab'
        : ctx.boatDeck?.active && ['surface', 'habitat', 'follow'].includes(p)
          ? 'sub'
          : null;
    return {
      visible:
        enabled &&
        same() &&
        !!voyage() &&
        (!selectedVoyageId || selectedVoyageId === voyage().id) &&
        !ctx.sharedMarine?.active &&
        !!(ctx.boatMode?.active || underwater()),
      ready,
      unsupported: state.schemaVersion !== 1,
      busy,
      error,
      message,
      variantId,
      study: study(),
      active: a,
      phase: p,
      window: r,
      station: deckStation,
      stationDistance: deckStation ? stationDistance(deckStation) : null,
      underwater: underwater(),
      instrumentAvailable: instrumentAvailable(),
      annotations: underwater()
        ? [0, 1]
            .map((i) => {
              const point = station(i);
              return {
                ...point.position,
                code: i ? 'B' : 'A',
                label: point.label,
                selected:
                  (p === 'habitat' && a?.habitats.length === i) ||
                  (p === 'complete' && a?.report.followUp === point.id),
              };
            })
            .concat(
              chosen || lead
                ? [
                    {
                      ...(chosen || lead).mesh.position,
                      code: chosen ? 'I' : 'W',
                      label: chosen
                        ? 'Selected virtual individual'
                        : 'Virtual study lead; not an observation',
                      selected: !!chosen,
                    },
                  ]
                : []
            )
        : [],
      target:
        goal && underwater()
          ? {
              x: goal.x,
              y: goal.y,
              z: goal.z,
              label:
                target?.label ||
                (p === 'surface'
                  ? 'Near-surface watch'
                  : chosen
                    ? 'Selected individual'
                    : 'Virtual study lead'),
              depthBand: target?.depthBand,
            }
          : null,
      targetDistance:
        goal && underwater() && mode()?.submarine
          ? distance(mode().submarine.position, goal)
          : null,
      targetBearing:
        goal &&
        underwater() &&
        Math.hypot(goal.x - mode().submarine.position.x, goal.z - mode().submarine.position.z) > 1
          ? (((180 -
              (Math.atan2(
                goal.x - mode().submarine.position.x,
                goal.z - mode().submarine.position.z
              ) *
                180) /
                Math.PI) %
              360) +
              360) %
            360
          : null,
      individuals: preview
        .filter((o) => o.kind === study().followKind)
        .map((o) => ({
          id: o.individualId,
          label: o.speciesLabel,
          distanceMeters: o.distanceMeters,
        })),
      selectedIndividualId,
      viewRevision,
      behaviorOptions: r?.ready && p === 'follow' ? marineBehaviorOptions(r) : [],
      comparison: a?.habitats.length === 2 ? marineHabitatComparison(a) : null,
      supported: supported(),
    };
  }
  return {
    refresh,
    choose,
    act,
    tick,
    snapshot,
    setNavigation(v) {
      navigation = v || {};
    },
    focusWorld() {
      navigation.requestWorldFocus?.();
    },
    journal() {
      navigation.onJournal?.();
    },
    next() {
      navigation.onNext?.();
    },
    pause() {
      epoch++;
      enabled = false;
      selectedVoyageId = null;
      recorder.reset();
      view?.clear();
      preview = [];
    },
    dispose() {
      disposed = true;
      epoch++;
      recorder.dispose();
      view?.clear();
      preview = [];
    },
  };
}
