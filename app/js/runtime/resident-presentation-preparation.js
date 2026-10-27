// Shader compilation does not upload vertex buffers or textures. Prepare the
// resident view through Three's normal renderer while loading still covers it.
// A one-pixel viewport avoids a full extra scene rasterization. All visibility,
// clipping and shadow-update state is restored before the playable render.
export function prepareResidentPresentation(ctx, T, {root = ctx.scene, target = null, visibleRoots = [], residentRoots = []} = {}) {
  const renderer = ctx.renderer;
  const previousTarget = renderer.getRenderTarget();
  const viewport = renderer.getViewport(new T.Vector4());
  const scissor = renderer.getScissor(new T.Vector4());
  const scissorTest = renderer.getScissorTest();
  const shadows = renderer.shadowMap;
  const shadowState = shadows && {autoUpdate:shadows.autoUpdate, needsUpdate:shadows.needsUpdate};
  const residents = [...new Set(residentRoots.filter(Boolean))];
  // Only this scene's current resident owners may lend detached hosts. Never
  // borrow an object from a different scene/interior or change its local pose.
  for (const object of residents) {
    let parent = object;
    while (parent.parent) parent = parent.parent;
    if (object.parent && parent !== ctx.scene) throw new Error('Resident preparation requires the current scene or a detached host');
  }
  const borrowed = residents.filter(object => !object.parent && object !== ctx.scene);
  const visibility = [...new Set([...visibleRoots, ...residents].filter(Boolean))].map(object => [object, object.visible]);
  const culling = [];
  const startedAt = performance.now();
  try {
    for (const object of borrowed) ctx.scene.add(object);
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
    return {durationMs:performance.now()-startedAt, meshes:culling.length, borrowedRoots:borrowed.length,
      geometries:renderer.info.memory.geometries, textures:renderer.info.memory.textures};
  } finally {
    for (const [object, value] of culling) object.frustumCulled = value;
    for (const [object, value] of visibility) object.visible = value;
    for (const object of borrowed) if (object.parent === ctx.scene) ctx.scene.remove(object);
    if (shadows) Object.assign(shadows, shadowState);
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
  }
}
