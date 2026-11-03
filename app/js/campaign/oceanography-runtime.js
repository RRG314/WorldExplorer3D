import {
  normalizeOceanographyCareer,
  OCEANOGRAPHY_STUDIES,
  OCEANOGRAPHY_STATIONS,
  OCEANOGRAPHY_PROTOCOL as P,
} from './oceanography-career.js';
import { createOceanographyCastRecorder } from './oceanography-cast-recorder.js';
import { earthLocalToGeographic } from '../earth-core/location-origin.js?v=1';
import { fieldDistance } from './field-study-contract.js';
import { contactAdmission, contactLineClear } from './coastal-investigation.js';
import { marineStudyOffset } from '../ocean/habitat-plan.js';
import { oceanParentPosition } from '../ocean/stream-runtime.js';
import { fetchBundledCoastalDepth } from '../ocean/bundled-depth.js';

// A finite career within the existing marine research owner. Its vessel/deck
// and submarine updates supply ticks; all durable results use the profile store.
export function createOceanographyRuntime(ctx, { store, now = Date.now } = {}) {
  const recorder = createOceanographyCastRecorder();
  let state = normalizeOceanographyCareer(),
    ready = false,
    enabled = false,
    selectedVoyageId = null,
    busy = false,
    disposed = false,
    epoch = 0,
    refreshGeneration = 0,
    variantId = 'campaign',
    error = '',
    message = '',
    depths = null,
    navigation = {};
  const unit = () => ctx.METERS_PER_WORLD_UNIT || 1,
    mode = () => ctx.oceanMode,
    voyage = () => ctx.oceanVoyage?.current,
    underwater = () => !!mode()?.active;
  const active = () =>
    state.schemaVersion === 1 && state.active?.variantId === variantId ? state.active : null;
  const phase = () => active()?.phase || 'planning';
  const same = () => {
    const a = active(),
      v = voyage();
    return (
      !a ||
      (v?.id === a.voyage.id &&
        v.ship.transportEntityId === a.voyage.ship.transportEntityId &&
        v.subId === a.voyage.subId)
    );
  };
  const supported = () =>
    !disposed &&
    enabled &&
    ctx.gameStarted &&
    !ctx.worldLoading &&
    !ctx.sharedMarine?.active &&
    !ctx.getLiveGpsSnapshot?.().active &&
    voyage()?.ship.transportCatalogId === 'ocean-research-vessel' &&
    same();
  const stationDistance = (id) =>
    ctx.boatDeck?.active ? (ctx.boatDeck.stationDistance?.(id) ?? Infinity) : Infinity;
  const stopped = () =>
    Math.hypot(ctx.boat?.speed || 0, ctx.boat?.vx || 0, ctx.boat?.vz || 0) * unit() <= 0.5;
  const stationReady = (id) =>
    supported() &&
    !ctx.paused &&
    ctx.boatMode?.active &&
    ctx.boatMode.moored === true &&
    stopped() &&
    stationDistance(id) <= 2.4;
  const geo = () =>
    underwater()
      ? earthLocalToGeographic(
          mode().frameOrigin || mode().launchSite,
          ctx.SCALE,
          mode().submarine.position.x,
          mode().submarine.position.z
        )
      : earthLocalToGeographic(ctx.LOC, ctx.SCALE, ctx.boat?.x, ctx.boat?.z);
  const rig = () => (ctx.boatMode?.active ? ctx.boatMode.mesh?.userData.researchCtd : null);
  const contacts = () => (mode()?.active ? mode().habitat?.plan.contacts || [] : []);
  const nextContact = () =>
    phase() === 'mapping'
      ? ['habitat', 'rock', 'case'].find((id) => !active().pings.some((p) => p.target.id === id))
      : active()?.selected || OCEANOGRAPHY_STUDIES[variantId]?.target;
  const target = () => contacts().find((t) => t.id === nextContact());
  function studyPosition(p) {
    const off = marineStudyOffset(mode()?.launchSite || voyage()?.site, ctx.SCALE);
    return { x: p.x - off.x, y: p.y, z: p.z - off.z };
  }
  function contactGate(range = 80) {
    return contactAdmission({
      actor: mode()?.submarine,
      target: target(),
      units: unit(),
      range,
      paused: !supported() || !!ctx.paused,
      ready:
        !!mode()?.active &&
        !mode()?.diver?.active &&
        mode().habitat?.group.userData.habitat.assetState === 'ready',
      lineClear: (from, to) =>
        contactLineClear(mode().habitat.plan, mode().habitat.sampleSeabedHeight, from, to),
    });
  }
  function evidence(stationId = null) {
    const v = voyage();
    return {
      voyage: v,
      shared: !!ctx.sharedMarine?.active,
      liveGps: !!ctx.getLiveGpsSnapshot?.().active,
      paused: !!ctx.paused,
      at: now(),
      position: geo(),
      localPosition: underwater()
        ? { ...mode().submarine.position }
        : { x: ctx.boat.x, y: ctx.boat.y, z: ctx.boat.z },
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
      state = normalizeOceanographyCareer(profile.researchCareers?.oceanography);
      ready = true;
      return true;
    } catch {
      error = 'The survey Journal could not load. Your saved vessel and records are kept.';
      ready = false;
      return false;
    }
  }
  async function save(command, stationId = null) {
    const run = epoch,
      e = evidence(stationId),
      ids = [e.voyage?.id, e.voyage?.ship.transportEntityId, e.voyage?.subId].join(':'),
      current = () =>
        !disposed &&
        enabled &&
        run === epoch &&
        supported() &&
        [voyage()?.id, voyage()?.ship.transportEntityId, voyage()?.subId].join(':') === ids &&
        underwater() === (e.environment === 'OCEAN') &&
        (!stationId || stationDistance(stationId) <= 2.4);
    const result = await store().updateResearchCareer(
      'oceanography',
      { ...command, revision: state.revision, evidence: e },
      { now: now(), isCurrent: current }
    );
    if (!current()) return false;
    state = result.state;
    message =
      phase() === 'complete' ? 'Annotated transect saved to Journal.' : 'Survey record saved.';
    return true;
  }
  function castSample() {
    const a = active(),
      v = voyage(),
      r = rig(),
      reading = r?.read(ctx);
    return {
      ...reading,
      position: geo(),
      voyageId: v?.id,
      shipId: v?.ship.transportEntityId,
      subId: v?.subId,
      active: !!ctx.boatDeck?.active && !!ctx.boatMode?.active,
      moored: !!ctx.boatMode?.moored,
      atInstrument: stationDistance('sub') <= 2.4,
      shared: !!ctx.sharedMarine?.active,
      liveGps: !!ctx.getLiveGpsSnapshot?.().active,
      paused: !!ctx.paused,
      hidden: typeof document !== 'undefined' && document.hidden,
      runId: a?.runId,
    };
  }
  async function choose(selected) {
    if (!OCEANOGRAPHY_STUDIES[selected]) throw Error('Choose a supported ocean survey.');
    if (!(await refresh())) throw Error(error);
    if (state.schemaVersion !== 1) throw Error('This saved ocean survey needs a newer version.');
    if (state.active && state.active.phase !== 'complete' && state.active.variantId !== selected)
      throw Error('Continue the current vessel survey first.');
    epoch++;
    enabled = true;
    selectedVoyageId = voyage()?.id || null;
    variantId = selected;
    error = message = '';
    recorder.reset();
    if (state.records[selected] && state.active?.variantId !== selected)
      await save({ type: 'accept', variantId: selected, runId: crypto.randomUUID() });
    return true;
  }
  async function act(type, fields = {}) {
    if (busy || disposed) return false;
    busy = true;
    error = '';
    try {
      if (type === 'retry') return await refresh();
      if (!ready || state.schemaVersion !== 1 || !supported())
        throw Error('Return to this survey’s original supported research vessel.');
      if (type === 'check-plan') {
        if (!stationReady('chart'))
          throw Error('Walk to the chart table on the stopped, moored vessel.');
        const run = epoch,
          values = [];
        for (const station of OCEANOGRAPHY_STATIONS) {
          const depth = await fetchBundledCoastalDepth(station.lat, station.lon);
          if (!depth || depth.depthMeters < 8)
            throw Error('The archived station chart does not admit this six-metre training cast.');
          values.push({ stationId: station.id, lat: station.lat, lon: station.lon, ...depth });
        }
        if (run !== epoch || !stationReady('chart')) return false;
        depths = values;
        message =
          'Both archived chart depths checked. Choose the matched protocol and retain the model source/date.';
        return true;
      }
      if (type === 'accept') {
        if (!stationReady('chart') || !depths)
          throw Error(
            'Review both archived station depths at the chart table before accepting the plan.'
          );
        return await save(
          {
            type,
            runId: crypto.randomUUID(),
            variantId,
            protocolId: fields.protocolId,
            stationOrder: OCEANOGRAPHY_STATIONS.map((s) => s.id),
            stationDepths: depths,
          },
          'chart'
        );
      }
      const a = active();
      if (!a) throw Error('Accept the two-station survey plan first.');
      if (type === 'start-cast') {
        const station = OCEANOGRAPHY_STATIONS[a.stationIndex];
        if (
          a.phase !== 'casts' ||
          !stationReady('sub') ||
          !rig() ||
          fieldDistance(station, geo()) > 25
        )
          throw Error(
            'Moor within 25 m of the planned station, then walk to the instrument control beside the submarine cradle.'
          );
        const reading = rig().read(ctx);
        if (!rig().recovered || reading.depthMeters > 0)
          throw Error('Recover the probe before starting a fresh downcast.');
        recorder.start(
          {
            runId: a.runId,
            variantId,
            stationId: station.id,
            voyageId: voyage().id,
            shipId: voyage().ship.transportEntityId,
            subId: voyage().subId,
          },
          { position: geo(), ...reading }
        );
        message = 'Downcast started. Remain at the instrument until it is recovered.';
        return true;
      }
      if (type === 'cast') {
        if (!stationReady('sub'))
          throw Error('Return to the stopped, moored instrument control to file its cast.');
        const result = await save({ type, cast: recorder.result() }, 'sub');
        if (result) recorder.reset();
        return result;
      }
      if (type === 'ping') {
        const admission = contactGate();
        if (!admission.allowed) throw Error(admission.reason);
        const actor = mode().submarine,
          t = target(),
          bottom = mode().habitat.sampleSeabedHeight(actor.position.x, actor.position.z);
        if (!Number.isFinite(bottom))
          throw Error('This part of the seafloor has no supported geometry.');
        return await save({
          type,
          return: {
            truthType: 'authored-geometry',
            method: 'geometry-sonar',
            voyageId: voyage().id,
            target: {
              id: t.id,
              x: t.x,
              y: t.y,
              z: t.z,
              radius: t.radius,
              returnShape: t.returnShape,
            },
            distanceMeters: admission.distance,
            lineClear: true,
            inCone: true,
            speedMetersPerSecond: actor.speed || 0,
            uncertaintyMeters: Math.max(1, t.radius),
            sampledBottomY: bottom,
            at: now(),
            position: geo(),
            studyPosition: studyPosition(actor.position),
            samplePosition: { ...actor.position },
            metersPerUnit: unit(),
          },
        });
      }
      if (type === 'select-target')
        return await save({ type, targetId: fields.targetId, uncertainty: fields.uncertainty });
      if (type === 'inspect') {
        const admission = contactGate(6);
        if (!admission.allowed) throw Error(admission.reason);
        return await save({
          type,
          observation: {
            targetId: a.selected,
            method: 'direct-submersible-view',
            truthType: 'authored-geometry',
            visible: true,
            lineClear: true,
            distanceMeters: admission.distance,
            at: now(),
            studyPosition: studyPosition(mode().submarine.position),
            form: fields.form,
          },
        });
      }
      if (type === 'return-approach') {
        if (!underwater() || mode().diver?.active)
          throw Error('Pilot the survey submarine back to its parent vessel.');
        const p = mode().submarine.position,
          parent = oceanParentPosition(mode(), ctx.SCALE),
          water = mode().waterSurface?.sample(p.x, p.z);
        if (!Number.isFinite(water?.surfaceY))
          throw Error('The parent-vessel water surface is unavailable.');
        return await save({
          type,
          return: {
            shipId: voyage().ship.transportEntityId,
            subId: voyage().subId,
            distanceMeters: Math.hypot(p.x - parent.x, p.z - parent.z) * unit(),
            depthMeters: (water.surfaceY - p.y) * unit(),
            position: geo(),
            at: now(),
          },
        });
      }
      if (type === 'report')
        return await save(
          {
            type,
            result: fields.result,
            limitation: fields.limitation,
            geometryContext: fields.geometryContext,
            followUp: fields.followUp,
          },
          'lab'
        );
      throw Error('Choose an action for the current survey step.');
    } catch (e) {
      error =
        e.message ||
        'The survey record could not save. Previous records are kept; retry this step.';
      return false;
    } finally {
      busy = false;
    }
  }
  function tick(dt) {
    if (disposed) return;
    const r = rig(),
      s = recorder.snapshot();
    if (!r) {
      if (s && !s.interrupted) recorder.tick(dt, {});
      return;
    }
    if (!enabled || !s || s.interrupted) {
      if (r.recovered) return;
      try {
        r.update(ctx.paused ? 0 : dt, null, ctx);
      } catch {}
      return;
    }
    if (s.ready) {
      recorder.tick(dt, castSample());
      return;
    }
    try {
      const reading = r.update(
        ctx.paused || (typeof document !== 'undefined' && document.hidden) ? 0 : dt,
        s.measurementComplete ? null : s.targetDepthMeters,
        ctx
      );
      recorder.tick(dt, { ...castSample(), ...reading });
    } catch (e) {
      recorder.tick(dt, {});
      error = e.message;
    }
  }
  function snapshot() {
    const a = active(),
      p = phase(),
      t = ['mapping', 'select-target', 'inspection'].includes(p) ? target() : null,
      actor = mode()?.submarine,
      station = p === 'planning' ? 'chart' : p === 'casts' ? 'sub' : p === 'report' ? 'lab' : null,
      cast = recorder.snapshot(),
      nextStation = p === 'casts' ? OCEANOGRAPHY_STATIONS[a.stationIndex] : null,
      parent = underwater() ? oceanParentPosition(mode(), ctx.SCALE) : null;
    return {
      visible:
        enabled &&
        !!voyage() &&
        same() &&
        (!selectedVoyageId || selectedVoyageId === voyage().id) &&
        !ctx.sharedMarine?.active &&
        !!(ctx.boatMode?.active || mode()?.active),
      ready,
      unsupported: state.schemaVersion !== 1,
      busy,
      error,
      message,
      variantId,
      study: OCEANOGRAPHY_STUDIES[variantId],
      phase: p,
      active: a,
      depths: a?.plan?.stationDepths || depths,
      cast,
      station,
      stationDistance: station ? stationDistance(station) : null,
      stationReady: station ? stationReady(station) : false,
      sameVessel: same(),
      nextStation,
      nextStationMeters: nextStation && geo() ? fieldDistance(nextStation, geo()) : null,
      target: t ? { id: t.id, x: t.x, y: t.y, z: t.z, returnShape: t.returnShape } : null,
      targetDistance:
        actor && t
          ? Math.hypot(actor.position.x - t.x, actor.position.y - t.y, actor.position.z - t.z) *
            unit()
          : null,
      contactGate:
        underwater() && ['mapping', 'inspection'].includes(p)
          ? contactGate(p === 'inspection' ? 6 : 80)
          : null,
      parentDistance:
        actor && parent
          ? Math.hypot(actor.position.x - parent.x, actor.position.z - parent.z) * unit()
          : null,
      underwater: underwater(),
      supported: supported(),
      annotations: contacts()
        .filter((t) => a?.pings.some((row) => row.target.id === t.id))
        .map((t, i) => ({
          id: t.id,
          x: t.x,
          y: t.y,
          z: t.z,
          code: `S${i + 1}`,
          selected: a.selected === t.id,
          label: t.returnShape,
        })),
    };
  }
  return {
    setNavigation(value) {
      navigation = value || {};
    },
    journal() {
      if (navigation.onJournal) return navigation.onJournal();
      void import('../discovery/journey-journal.js').then((m) =>
        m.openJourneyJournal(ctx, 'journal')
      );
    },
    next() {
      if (navigation.onNext) return navigation.onNext();
    },
    refresh,
    choose,
    act,
    tick,
    snapshot,
    pause() {
      epoch++;
      enabled = false;
      selectedVoyageId = null;
      recorder.reset();
    },
    dispose() {
      disposed = true;
      epoch++;
      recorder.dispose();
    },
  };
}
