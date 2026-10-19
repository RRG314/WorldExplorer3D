// Keep a bounded material lease so Three's existing program cache can reuse the
// exact venue lighting variants at admission. No renderer or shader fork.
export function createVenueProgramPreparation(ctx, T, dependencies) {
  let prepared = null;

  function dispose() {
    if (!prepared) return;
    const old = prepared;
    prepared = null;
    if (old.group) {
      old.group.parent?.remove(old.group);
      dependencies.dispose(old.group);
    }
  }

  function prepare() {
    const sequence = ctx._worldLoadSequence;
    if (prepared && prepared.sequence === sequence) return prepared.stats;
    dispose();
    const startedAt = performance.now();
    const stats = { status: 'not-needed', venues: 0, durationMs: 0 };
    prepared = { sequence, group: null, stats };
    let group;
    try {
      // Only one resident venue is prepared. The current catalog has one museum;
      // additional layout types must be measured before widening that bound.
      const building = (ctx.buildings || []).find(dependencies.matches);
      if (!building) return stats;
      const definition = dependencies.resolve(building);
      if (!definition?.curatedContent) return stats;
      group = dependencies.build(definition).group;
      const scene = new T.Scene();
      scene.fog = ctx.scene.fog;
      scene.environment = null;
      const camera = ctx.camera.clone();
      camera.layers.set(1);
      group.traverse(object => object.layers.set(1));
      scene.add(group);
      // The caller owns the output render target and invokes this while the
      // normal loading cover is still present. Outdoor camera/lights stay put.
      ctx.renderer.compile(scene, camera);
      prepared.group = group;
      stats.status = 'prepared';
      stats.venues = 1;
      stats.durationMs = performance.now() - startedAt;
      return stats;
    } catch (error) {
      if (group) {
        group.parent?.remove(group);
        dependencies.dispose(group);
      }
      prepared = null;
      throw error;
    }
  }

  return { prepare, dispose };
}
