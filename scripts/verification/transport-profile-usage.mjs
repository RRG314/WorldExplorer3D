// Diagnostic only: sample initial/profile revisions and observe whether any
// published surface field is read before the next revision replaces it.
export function createTransportProfileUsageProbe(sampleEvery = 32) {
  const selected = new WeakMap(), records = [];
  let features = 0, compilations = 0;
  const fields = ['transportSurfaceModel','surfaceDistances','surfaceHeights','surfaceOffsets','structureSurfaceMinY','structureSurfaceMaxY','retainingSkirtDepth'];
  const probe = feature => {
    compilations++;
    if (!selected.has(feature)) selected.set(feature, features++ % sampleEvery === 0 ? {generation:0} : null);
    const sample = selected.get(feature);
    if (!sample) return feature;
    const record = {sourceFeatureId:feature.sourceFeatureId,mode:feature.structureSemantics?.terrainMode,generation:sample.generation++,reads:0,firstRead:null,replaced:false};
    records.push(record);
    const values = fields.map(field=>feature[field]);
    let detached = false;
    const detach = () => {
      if(detached)return;
      detached=true;record.replaced=true;
      fields.forEach((field,i)=>Object.defineProperty(feature,field,{configurable:true,enumerable:true,writable:true,value:values[i]}));
    };
    fields.forEach((field,i)=>Object.defineProperty(feature,field,{configurable:true,enumerable:true,
      get(){record.reads++;record.firstRead ||= field;return values[i];},
      set(value){detach();feature[field]=value;}
    }));
    return feature;
  };
  probe.snapshot = () => ({features,compilations,sampleEvery,records,scope:'Instrumented sampled profile lifetime evidence; not performance acceptance'});
  return probe;
}
