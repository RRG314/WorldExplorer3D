import { acquireVenueLighting } from './venue-lighting.js';

export function attachCern(ctx, T, active) {
  if (!active.definition.cernContent) return;
  const controller = new AbortController(),
    lighting = acquireVenueLighting(ctx, active.group),
    visit = active.group.userData.cernVisit;
  const state = { controller, lighting, visit, detector: null, error: null };
  active.cern = state;
  state.current = () =>
    !controller.signal.aborted &&
    ctx.activeInterior === active &&
    ctx._worldLoadSequence === active.outsideWorldSequence;
  state.ready = (async () => {
    if (active.definition.cernContent.siteId !== 'cms-point-five') return;
    try {
      const { createCmsDetectorExhibit } = await import('./cms-detector-exhibit.js');
      if (!state.current()) return;
      // Parent already uses metre coordinates and existing world-unit scaling.
      const exhibit = await createCmsDetectorExhibit(T, active.group, {
        signal: controller.signal,
        isCurrent: state.current,
        applyLighting: lighting.apply,
      });
      if (!state.current()) {
        exhibit.dispose();
        return;
      }
      state.detector = exhibit;
      exhibit.root.updateMatrixWorld(true);
      // Original detector coordinates are centred around the beam, not its base.
      const localBounds = new T.Box3();
      exhibit.root.traverse((o) => {
        if (!o.geometry) return;
        o.geometry.computeBoundingBox();
        const box = o.geometry.boundingBox.clone();
        o.updateMatrixWorld(true);
        box.applyMatrix4(
          new T.Matrix4().multiplyMatrices(
            new T.Matrix4().copy(exhibit.root.matrixWorld).invert(),
            o.matrixWorld
          )
        );
        localBounds.union(box);
      });
      exhibit.root.position.y = -100 - localBounds.min.y;
      if (visit.placeholder) visit.placeholder.visible = false;
      lighting.apply(exhibit.root);
    } catch (error) {
      if (state.current()) state.error = String(error.message);
    }
  })();
}
export function disposeCern(ctx, active) {
  const s = active?.cern;
  if (!s) return;
  s.controller.abort();
  s.detector?.dispose();
  s.lighting.release();
  active.cern = null;
}
