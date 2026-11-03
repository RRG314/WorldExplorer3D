import { captureEnvironmentSession } from '../session-coordinator.js?v=2';
import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';
import { normalizeAcceleratorCareer, acceleratorTarget } from './accelerator-career.js';
import { acceleratorTargetSite, CERN_ARRIVALS } from './cern-study-sites.js';
import { fieldDistance } from './field-study-contract.js';
import { createAcceleratorTools } from './accelerator-tools.js';
import { createAcceleratorUI, acceleratorStationLabel } from './accelerator-ui.js';

export async function createAcceleratorCareerRuntime({
  runtime,
  store,
  intent,
  onJournal,
  onNext,
  onTravel,
  requestWorldFocus,
  isActive = () => true,
}) {
  const session = captureEnvironmentSession(),
    scope = createLifecycleScope('research-career:accelerator'),
    abort = new AbortController();
  let disposed = false,
    busy = false,
    state,
    ui,
    tools,
    elapsed = 0;
  const current = () => !disposed && scope.isActive() && session.isCurrent() && isActive();
  function dispose() {
    if (disposed) return;
    disposed = true;
    scope.dispose('accelerator-stopped');
    ui?.dispose();
    tools?.dispose();
  }
  scope.defer(() => abort.abort(), 'request');
  scope.listen(session.signal, 'abort', dispose);
  try {
    if (
      runtime.getEnv?.() !== 'EARTH' ||
      !runtime.gameStarted ||
      runtime.worldLoading ||
      runtime.getLiveGpsSnapshot?.().active
    )
      throw Error('Choose the virtual CERN training visit in Earth exploration.');
    runtime.setTravelMode('walk', { source: 'accelerator-study' });
    if (runtime.getCurrentTravelMode?.() !== 'walk')
      throw Error('Enter walking mode for this study.');
    state = normalizeAcceleratorCareer((await store.getProfile()).researchCareers?.accelerator);
    if (!current()) throw Error('The visit changed.');
    state = (
      await store.updateResearchCareer(
        'accelerator',
        {
          type: 'accept',
          revision: state.revision,
          variantId: intent.variantId || 'campaign',
          runId: crypto.randomUUID(),
        },
        { signal: abort.signal, isCurrent: current }
      )
    ).state;
    if (!current()) throw Error('The visit changed.');
    function near(id, asDistance = false) {
      const active = runtime.activeInterior,
        v = active?.cern?.visit,
        w = runtime.Walk?.state?.walker,
        p = v?.station(id);
      if (
        !current() ||
        !p ||
        !w ||
        !active.cern.current() ||
        active.definition.cernContent.siteId !== acceleratorTargetSite(id) ||
        runtime.worldLoading ||
        runtime.getCurrentTravelMode?.() !== 'walk' ||
        active.activeLevel !== p.level
      )
        return asDistance ? NaN : false;
      const meters = Math.hypot(w.x - p.x, w.z - p.z) * v.plan.metersPerUnit;
      return asDistance
        ? meters
        : meters <= 3 &&
            w.onGround === true &&
            Math.abs(w.y - (runtime.Walk.CFG?.eyeHeight || 1.7) - p.y) * v.plan.metersPerUnit < 0.5;
    }
    async function save(command, options = {}) {
      if (busy || !current()) throw Error('This study step is unavailable.');
      const id = acceleratorTarget(state.active);
      if (!near(id)) throw Error('Walk to the marked supported instrument.');
      busy = true;
      try {
        const a = runtime.activeInterior,
          v = a.cern.visit,
          w = runtime.Walk.state.walker,
          p = v.station(id),
          now = Date.now(),
          evidence = {
            environment: 'EARTH',
            travelMode: 'walk',
            liveGps: false,
            supported: w.onGround === true,
            siteId: a.definition.cernContent.siteId,
            sourceBuildingId: a.definition.contentAssociation.sourceId,
            floorId: a.floorId,
            accuracy: a.definition.cernContent.accuracy,
            position: earthCoordinateFrame(runtime.LOC, runtime.SCALE).toGeographic(w.x, w.z),
            verticalDistance:
              (w.y - (runtime.Walk.CFG?.eyeHeight || 1.7) - p.y) * v.plan.metersPerUnit,
            localPosition: { x: w.x, y: w.y, z: w.z },
            at: now,
          };
        const next = await store.updateResearchCareer(
          'accelerator',
          { ...command, revision: state.revision, evidence },
          { ...options, now, signal: abort.signal, isCurrent: current }
        );
        if (!current()) return;
        state = next.state;
        tools.accepted();
        runtime.showToast?.(
          state.active.phase === 'complete' ? 'Collision Lab notebook saved' : 'Experiment saved'
        );
      } catch (error) {
        if (current())
          state = normalizeAcceleratorCareer(
            (await store.getProfile()).researchCareers?.accelerator
          );
        throw error;
      } finally {
        busy = false;
      }
    }
    tools = createAcceleratorTools(runtime, { getState: () => state, near, isCurrent: current });
    const atTargetSite = () => {
      const id = acceleratorTargetSite(acceleratorTarget(state.active));
      return (
        runtime.activeInterior?.definition.cernContent?.siteId === id ||
        fieldDistance(runtime.LOC, CERN_ARRIVALS[id]) < 600
      );
    };
    ui = createAcceleratorUI({
      runtime,
      getState: () => state,
      near,
      save,
      tools,
      onJournal,
      onNext,
      requestWorldFocus,
      atTargetSite,
      isInside: () => !!runtime.activeInterior?.cern,
      onTravel: () => {
        if (!busy) (onTravel || onNext)?.(acceleratorTargetSite(acceleratorTarget(state.active)));
      },
    });
    const unregister = runtime.registerContextInteraction?.({
      id: 'accelerator-field-station',
      priority: 98,
      evaluate: () => {
        const id = acceleratorTarget(state.active);
        return current() && !busy && !runtime.paused && near(id)
          ? {
              available: true,
              action: 'inspect-accelerator-station',
              label:
                state.active.phase === 'complete'
                  ? 'Review Collision Lab notebook'
                  : 'Open ' + acceleratorStationLabel(id),
              detail: 'CERN virtual training',
              distance: near(id, true),
            }
          : null;
      },
      perform: () => ui.open(),
    });
    if (unregister) scope.defer(unregister, 'interaction');
    ui.update();
    return {
      dispose,
      update(dt) {
        if (!current()) return;
        tools.tick(dt);
        elapsed += Math.max(0, dt);
        if (elapsed >= 0.15) {
          elapsed = 0;
          ui.update();
        }
      },
      snapshot() {
        const id = acceleratorTarget(state.active),
          p = runtime.activeInterior?.cern?.visit.station(id);
        return {
          careerId: 'accelerator',
          active: !disposed,
          phase: state.active.phase,
          variantId: state.active.variantId,
          revision: state.revision,
          siteId: acceleratorTargetSite(id),
          target: { id, ...p },
          tools: tools.snapshot(),
        };
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
