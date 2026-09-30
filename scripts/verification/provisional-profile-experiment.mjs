// Initial loading profiles are provisional: the graph compiler replaces every
// road's profile before publication. Materialize only those read by a crossing
// or building constraint before that replacement. The accepted ground sampler
// must remain stable over this loading phase.
export function createProvisionalProfileCompiler(compile) {
  const pending = new WeakMap();
  const fields = ['transportSurfaceModel', 'surfaceDistances', 'surfaceHeights',
    'surfaceOffsets', 'structureSurfaceMinY', 'structureSurfaceMaxY', 'retainingSkirtDepth'];
  const cancel = feature => {
    pending.delete(feature);
    for (const field of fields) delete feature[field];
  };
  const materialize = feature => {
    const job = pending.get(feature);
    if (!job) return;
    // Compile the original feature inputs, not later graph/stack annotations.
    // Keep the pending job if compilation throws so a failure is never hidden.
    const result = compile(job.input, job.sampleTerrainY, job.options);
    cancel(feature);
    for (const field of fields) feature[field] = result[field];
    feature.surfaceTerrainSampler = result.surfaceTerrainSampler;
  };
  const descriptors = Object.fromEntries(fields.map(field => [field, {
    configurable: true, enumerable: true,
    get() { materialize(this); return this[field]; },
    set(value) {
      // Authoritative publication writes its model first, replacing the whole
      // provisional result. An independent legacy field edit needs its siblings.
      if (field === 'transportSurfaceModel') cancel(this);
      else materialize(this);
      this[field] = value;
    }
  }]));
  return function prepare(feature, sampleTerrainY, options = {}) {
    if (!feature || !Array.isArray(feature.pts) || feature.pts.length < 2 ||
        typeof sampleTerrainY !== 'function' || !feature.structureSemantics ||
        !Number.isFinite(feature.surfaceBias) ||
        (Number.isFinite(options.surfaceBias) && options.surfaceBias !== feature.surfaceBias) ||
        Object.hasOwn(feature, 'transportSurfaceModel')) return compile(feature, sampleTerrainY, options);
    pending.set(feature, {
      input: {...feature, structureSemantics: feature.structureSemantics ? {...feature.structureSemantics} : feature.structureSemantics},
      sampleTerrainY,
      options: {...options}
    });
    feature.surfaceTerrainSampler = null;
    Object.defineProperties(feature, descriptors);
    return feature;
  };
}
