import { captureEnvironmentSession } from '../session-coordinator.js?v=2';
import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';
import { qualifyResearchSite, researchStationEvidence } from './research-site.js';
import { projectDiscoveryItemsToBackpack } from '../discovery/backpack-projection.js?v=1';

// Adapter for bounded Earth field courses. Existing environment, ground,
// locomotion and profile owners remain authoritative.
export async function createFieldResearchRuntime({
  runtime,
  store,
  intent,
  onJournal,
  onNext,
  requestWorldFocus,
  isActive = () => true,
  domain
}) {
  const session = captureEnvironmentSession(),
    scope = createLifecycleScope('research-career:' + domain.id),
    abort = new AbortController();
  let state = domain.normalize(),
    qualified = null,
    presentation = null,
    ui = null,
    disposed = false,
    busy = false,
    elapsed = 0;
  const current = () => !disposed && scope.isActive() && session.isCurrent() && isActive();
  function dispose() {
    if (disposed) return;
    disposed = true;
    scope.dispose('fieldwork-stopped');
    ui?.dispose();
    presentation?.dispose();
    ui = presentation = null;
  }
  scope.defer(() => abort.abort('fieldwork-stopped'), 'request');
  scope.listen(session.signal, 'abort', dispose);
  try {
    runtime.setTravelMode?.('walk', { source: domain.id + '-course' });
    if (
      runtime.getCurrentTravelMode?.() !== 'walk' ||
      runtime.activeInterior ||
      runtime.getLiveGpsSnapshot?.().active
    )
      throw Error('Use in-game walking outdoors to start this fictional training course.');
    const profile = await store.getProfile();
    if (!current()) throw Error('The location changed.');
    state = domain.normalize(profile.researchCareers?.[domain.id]);
    const continuing = state.active && state.active.phase !== 'complete',
      relocating =
        intent.recoveryAction === 'relocate-course' && domain.relocatable === true && continuing,
      variantId = relocating ? state.active.variantId : intent.variantId || 'campaign';
    if (intent.recoveryAction && !relocating)
      throw Error('This field course cannot move at the current step.');
    if (continuing && state.active.variantId !== variantId)
      throw Error('Continue your current training case first.');
    qualified = qualifyResearchSite(runtime, {
      ...domain.siteDescriptor(intent.place),
      offsets: domain.offsets,
      eligibility: domain.eligibility,
      existingSite: continuing && !relocating ? state.active.site : domain.completedSite?.(state, variantId) || null
    });
    const accepted = await store.updateResearchCareer(
      domain.id,
      {
        type: relocating ? 'relocate' : 'accept',
        revision: state.revision,
        runId: crypto.randomUUID(),
        variantId,
        site: qualified.site
      },
      { signal: abort.signal, isCurrent: current }
    );
    if (!current()) throw Error('The location changed.');
    state = accepted.state;
    const items = await store.getItemsById(domain.itemIds(state.active));
    if (!current()) throw Error('The location changed.');
    projectDiscoveryItemsToBackpack(runtime, items);
    presentation = await domain.createPresentation(
      runtime,
      qualified,
      domain.studies[state.active.variantId],
      { signal: abort.signal, isCurrent: current, getState: () => state }
    );
    if (!presentation || !current()) throw Error('The field presentation could not open.');
    function near(id, asDistance = false) {
      const actor = runtime.Walk?.state?.walker,
        point = qualified.points[id];
      if (
        !current() ||
        !actor ||
        !point ||
        runtime.getCurrentTravelMode?.() !== 'walk' ||
        runtime.activeInterior ||
        runtime.worldLoading
      )
        return asDistance ? NaN : false;
      const meters = Math.hypot(actor.x - point.x, actor.z - point.z) * qualified.metersPerUnit;
      return asDistance
        ? meters
        : meters <= 3 && Math.abs(actor.y - point.y) * qualified.metersPerUnit <= 2.5;
    }
    async function save(command, saveOptions = {}) {
      if (busy || !current()) throw Error('This field step is unavailable.');
      busy = true;
      try {
        const id = domain.target(state.active);
        if (!near(id)) throw Error('Return to the marked station before recording this step.');
        const now = Date.now(),
          evidence = researchStationEvidence(runtime, qualified, id, now);
        const custody = domain
          .itemIds(state.active)
          .filter(
            (instanceId) => runtime.playerBackpackInventory?.item?.(instanceId)?.quantity > 0
          );
        const result = await store.updateResearchCareer(
          domain.id,
          { ...command, revision: state.revision, evidence, custody },
          { ...saveOptions, now, signal: abort.signal, isCurrent: current }
        );
        if (!current()) return;
        state = result.state;
        if (result.samples.length) projectDiscoveryItemsToBackpack(runtime, result.samples);
        presentation.update(state.active);
        runtime.showToast?.(
          state.active.phase === 'complete' ? 'Site report saved' : 'Field record saved'
        );
      } catch (error) {
        if (current())
          state = domain.normalize((await store.getProfile()).researchCareers?.[domain.id]);
        throw error;
      } finally {
        busy = false;
      }
    }
    const tools = domain.createTools?.(runtime, qualified, presentation, {
      careerId: domain.id,
      getState: () => state,
      save,
      isCurrent: current
    });
    if (tools) scope.defer(() => tools.dispose(), 'field-tools');
    ui = domain.createUI({
      runtime,
      tools,
      store,
      getState: () => state,
      near,
      save,
      onJournal,
      onNext,
      requestWorldFocus
    });
    const unregister = runtime.registerContextInteraction?.({
      id: domain.id + '-field-station',
      priority: 98,
      evaluate: () => {
        const id = domain.target(state.active);
        if (!current() || busy || runtime.paused || !near(id)) return null;
        return {
          available: true,
          action: 'inspect-' + domain.id + '-station',
          label:
            state.active.phase === 'complete'
              ? 'Review site report'
              : 'Open ' + (domain.label || domain.id) + ' station',
          detail: domain.stationLabel(id),
          distance: near(id, true)
        };
      },
      perform: () => ui.open()
    });
    if (unregister) scope.defer(unregister, 'interaction');
    presentation.update(state.active);
    ui.update();
    return {
      dispose,
      update(dt) {
        if (!current()) return;
        presentation.tick?.(dt);
        tools?.tick?.(dt);
        elapsed += Math.max(0, dt);
        if (elapsed < 0.15) return;
        elapsed = 0;
        presentation.update(state.active);
        ui.update();
      },
      snapshot: () => ({
        careerId: domain.id,
        active: !disposed,
        phase: state.active?.phase,
        variantId: state.active?.variantId,
        revision: state.revision,
        siteId: state.active?.site?.id,
        target: {
          id: domain.target(state.active),
          ...qualified.points[domain.target(state.active)]
        },
        items: domain.itemIds(state.active),
        tools: tools?.snapshot?.() || null,
        layerIndex: state.active?.layerIndex,
        excavation: state.active?.excavation,
        presentation: presentation?.budget || null
      })
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
