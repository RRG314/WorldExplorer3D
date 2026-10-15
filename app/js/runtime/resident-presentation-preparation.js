// Shader compilation does not upload vertex buffers or textures. Prepare the
// resident view through Three's normal renderer while loading still covers it.
// A one-pixel viewport avoids a full extra scene rasterization. All visibility,
// clipping and shadow-update state is restored before the playable render.
export function prepareResidentPresentation(ctx, T, {root = ctx.scene, target = null, visibleRoots = []} = {}) {
  const renderer = ctx.renderer;
  const previousTarget = renderer.getRenderTarget();
  const viewport = renderer.getViewport(new T.Vector4());
  const scissor = renderer.getScissor(new T.Vector4());
  const scissorTest = renderer.getScissorTest();
  const shadows = renderer.shadowMap;
  const shadowState = shadows && {autoUpdate:shadows.autoUpdate, needsUpdate:shadows.needsUpdate};
  const visibility = visibleRoots.filter(Boolean).map(object => [object, object.visible]);
  const culling = [];
  const startedAt = performance.now();
  try {
    for (const [object] of visibility) object.visible = true;
    root.traverseVisible(object => {
      if (object.geometry && object.layers.test(ctx.camera.layers)) {
        culling.push([object, object.frustumCulled]);
        object.frustumCulled = false;
      }
    });
    // The normal following frame owns shadows. A hidden preparation must not
    // bake a normally hidden vehicle into the walking scene's shadow map.
    if (shadows) { shadows.autoUpdate = false; shadows.needsUpdate = false; }
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, 1, 1);
    renderer.setScissor(0, 0, 1, 1);
    renderer.setScissorTest(true);
    renderer.render(ctx.scene, ctx.camera);
    return {durationMs:performance.now()-startedAt, meshes:culling.length,
      geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures};
  } finally {
    for (const [object, value] of culling) object.frustumCulled = value;
    for (const [object, value] of visibility) object.visible = value;
    if (shadows) Object.assign(shadows, shadowState);
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
  }
}
