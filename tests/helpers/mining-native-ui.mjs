// Actual native instrument/UI/profile boundary. Actor presence, views and any
// simulated walking below are controlled; never use this as source fieldwork.
import { createIndexedDbDiscoveryProfileStore } from '/app/js/discovery/profile-store.js?v=5';
import { createMiningUI } from '/app/js/campaign/mining-ui.js';
import { createMiningTools } from '/app/js/campaign/mining-tools.js';
import { miningHarness } from '/tests/helpers/mining-study.mjs';
import { miningTarget } from '/app/js/campaign/mining-career.js';
export async function mountMiningNativeUi({
  ctx,
  presentation,
  qualified,
  ground,
  draw,
  camera,
  u,
}) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/app/styles/experiences.css';
  document.head.append(link);
  const style = document.createElement('style');
  style.textContent =
    '*,*::before,*::after{box-sizing:border-box}#miningViewScope{display:none}#nativeWorldFocus{position:fixed;inset:0;outline:none}';
  document.head.append(style);
  const focus = document.createElement('div');
  focus.id = 'nativeWorldFocus';
  focus.tabIndex = 0;
  document.body.append(focus);
  Object.assign(ctx, {
    LOC: { lat: 39.27, lon: -76.59 },
    SCALE: 100000,
    METERS_PER_WORLD_UNIT: u,
    paused: false,
    getEnv: () => 'EARTH',
    getCurrentTravelMode: () => 'walk',
    screenLayout: { setPanelLayer() {} },
    setPauseReason: (_, v) => (ctx.paused = v),
    stopGameplayPlugin() {},
  });
  ctx.Walk.state.walker.onGround = true;
  const store = createIndexedDbDiscoveryProfileStore();
  let state = (await store.getProfile()).researchCareers.mining,
    last = performance.now(),
    disposed = false;
  if (!state.active) {
    const h = miningHarness();
    state = (
      await store.updateResearchCareer(
        'mining',
        { ...h.events[0].metadata.action, revision: state.revision },
        { now: Date.now() }
      )
    ).state;
  }
  qualified.site = state.active.site;
  presentation.update(state.active);
  const tools = createMiningTools(ctx, qualified, presentation, { getState: () => state });
  const near = (id, distance = false) => {
    const w = ctx.Walk.state.walker,
      p = qualified.points[id],
      d = Math.hypot(w.x - p.x, w.z - p.z) * u;
    return distance ? d : d <= 3;
  };
  async function save(command) {
    const target = miningTarget(state.active),
      w = ctx.Walk.state.walker,
      now = Date.now();
    state = (
      await store.updateResearchCareer(
        'mining',
        {
          ...command,
          revision: state.revision,
          evidence: {
            environment: 'EARTH',
            travelMode: 'walk',
            liveGps: false,
            supported: true,
            verticalDistance: 0,
            position: state.active.site.points[target],
            siteId: state.active.site.id,
            at: now,
            localPosition: { x: w.x, y: w.y, z: w.z },
          },
        },
        { now }
      )
    ).state;
    presentation.update(state.active);
  }
  const ui = createMiningUI({
    runtime: ctx,
    store,
    tools,
    getState: () => state,
    near,
    save,
    onJournal() {},
    onNext() {},
    requestWorldFocus: () => focus.focus({ preventScroll: true }),
  });
  function arrive({ open = true } = {}) {
    const a = state.active,
      id = miningTarget(a),
      p = qualified.points[id],
      w = ctx.Walk.state.walker;
    Object.assign(w, { x: p.x, z: p.z + 2.75 / u, y: ground(p.x, p.z + 2.75 / u) + 1.7 / u });
    camera.position.set(p.x + 2.1 / u, p.y + 1.9 / u, p.z + 3.5 / u);
    camera.lookAt(p.x, p.y + 1 / u, p.z);
    ctx.renderer.render(ctx.scene, camera);
    ui.update();
    if (open) ui.open();
  }
  async function driveCarrier() {
    const nodes = [
        qualified.points.dispatch,
        { x: qualified.points.bench.x + 1.5 / u, z: qualified.points.bench.z },
      ],
      w = ctx.Walk.state.walker,
      start = performance.now();
    for (const node of nodes) {
      let previous = performance.now();
      while (Math.hypot(w.x - node.x, w.z - node.z) * u > 0.03) {
        if (performance.now() - start > 35000)
          throw Error('Controlled native carrier route timed out.');
        const r = tools.snapshot().window;
        if (r?.ready) return r;
        if (r?.interrupted) throw Error(r.reason);
        await new Promise(requestAnimationFrame);
        const now = performance.now(),
          dt = Math.min(0.1, (now - previous) / 1000);
        previous = now;
        const d = Math.hypot(node.x - w.x, node.z - w.z),
          step = Math.min(d, (dt * 1.8) / u);
        w.x += ((node.x - w.x) * step) / d;
        w.z += ((node.z - w.z) * step) / d;
        w.y = ground(w.x, w.z) + 1.7 / u;
      }
    }
    return tools.snapshot().window;
  }
  function tick(now) {
    if (disposed) return;
    const dt = (now - last) / 1000;
    last = now;
    presentation.tick(dt);
    tools.tick(dt);
    ui.update();
    ctx.renderer.render(ctx.scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  let failNext = false;
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
    if (failNext && mode === 'readwrite' && Array.from(names).includes('events')) {
      failNext = false;
      throw new DOMException(
        'Controlled IndexedDB write failure; measured quarry record retained.',
        'QuotaExceededError'
      );
    }
    return transaction.call(this, names, mode, ...rest);
  };
  window.miningUi = {
    store,
    tools,
    presentation,
    get state() {
      return state;
    },
    arrive,
    driveCarrier,
    open: () => ui.open(),
    set failNext(v) {
      failNext = v;
    },
    async review(data) {
      await store.importData(data);
      state = (await store.getProfile()).researchCareers.mining;
      presentation.update(state.active);
      arrive();
    },
    dispose() {
      disposed = true;
      tools.dispose();
      ui.dispose();
      presentation.dispose();
    },
  };
  arrive();
  window.render_game_to_text = () =>
    JSON.stringify({
      scope: 'Actual native geometry/tools/UI/clock/IndexedDB; controlled presence/camera/route',
      phase: state.active.phase,
      revision: state.revision,
      paused: ctx.paused,
      window: tools.snapshot().window,
    });
  window.advanceTime = async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    ui.update();
  };
}
