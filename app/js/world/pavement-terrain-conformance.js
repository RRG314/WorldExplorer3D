// Pavement must have complete published support. A failed partition must not
// switch to a depth-limited approximation or expose a partially rebuilt mesh.
export function conformPavementMesh(mesh, sampleBase, sampleTop, { tolerance = .03, maxDepth = 3, partitionSurface } = {}) {
  if (typeof partitionSurface !== 'function') throw new Error('Pavement requires a published surface partition');
  const originalTriangles = mesh.vertices.length / 9;
  const partitioned = partitionSurface(mesh.vertices, sampleTop);
  if (!partitioned) throw new Error(`Pavement has incomplete or overlapping terrain support: ${JSON.stringify(partitionSurface.lastCoverage || {})}`);

  const curbs = [];
  const emit = (p, q, lowP, lowQ, depth) => {
    const x = (p[0] + q[0]) / 2, z = (p[2] + q[2]) / 2;
    const mid = [x, sampleTop(x, z), z], low = [x, sampleBase(x, z), z];
    if (depth < maxDepth && Math.max(Math.abs(mid[1] - (p[1] + q[1]) / 2),
      Math.abs(low[1] - (lowP[1] + lowQ[1]) / 2)) > tolerance) {
      emit(p, mid, lowP, low, depth + 1);
      emit(mid, q, low, lowQ, depth + 1);
    } else curbs.push(...p, ...lowP, ...lowQ, ...p, ...lowQ, ...q);
  };
  for (let i = 0; i < mesh.curbVertices.length; i += 18) {
    const v = mesh.curbVertices;
    emit(v.slice(i, i + 3), v.slice(i + 15, i + 18), v.slice(i + 3, i + 6), v.slice(i + 6, i + 9), 0);
  }
  mesh.vertices = partitioned;
  mesh.curbVertices = curbs;
  return mesh.vertices.length / 9 - originalTriangles;
}

// Runtime construction must yield inside a cell: a dense cell can contain
// thousands of triangles. Keep all output private until every piece succeeds.
export async function conformPavementMeshCooperatively(mesh, sampleBase, sampleTop, options = {}) {
  const {yieldWork, current = () => true, now = () => performance.now(), budgetMs = 8, onSlice = () => {}} = options;
  if (typeof yieldWork !== 'function') throw new TypeError('Cooperative pavement requires a scheduler');
  if (typeof options.partitionSurface !== 'function') throw new Error('Pavement requires a published surface partition');
  if (typeof options.partitionSurface.steps !== 'function') throw new TypeError('Cooperative pavement requires resumable terrain partitioning');
  const curbVertices=[];
  let started=now();
  const checkpoint=async()=>{
    if (!current()) throw new Error('Pavement construction superseded');
    const elapsed=now()-started;
    if(elapsed>=budgetMs){onSlice(elapsed);await yieldWork();started=now();}
    if (!current()) throw new Error('Pavement construction superseded');
  };
  const steps=options.partitionSurface.steps(mesh.vertices,sampleTop);
  let result;
  try {
    do {result=steps.next();if(!result.done)await checkpoint();}while(!result.done);
  } finally {steps.return();}
  const vertices=result.value;
  if (!vertices) throw new Error(`Pavement has incomplete or overlapping terrain support: ${JSON.stringify(options.partitionSurface.lastCoverage || {})}`);
  for(let offset=0;offset<mesh.curbVertices.length;offset+=144){
    const piece={vertices:[],curbVertices:mesh.curbVertices.slice(offset,offset+144)};
    conformPavementMesh(piece,sampleBase,sampleTop,{...options,partitionSurface:()=>[]});
    for(const value of piece.curbVertices)curbVertices.push(value);
    await checkpoint();
  }
  onSlice(now()-started);
  const added=vertices.length/9-mesh.vertices.length/9;
  if (!current()) throw new Error('Pavement construction superseded');
  mesh.vertices=vertices;mesh.curbVertices=curbVertices;
  return added;
}
