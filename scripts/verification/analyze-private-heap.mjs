// Raw snapshots stay private. This emits sizes and reviewed code property
// names only; string values, account data, URLs and source bodies are omitted.
import {readFile,writeFile} from 'node:fs/promises';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Provide the private heap path and aggregate output path');
// Run compact-private-heap.py first. Typed buffers avoid parsing a multi-GB
// JSON string or allocating hundreds of millions of boxed JS array entries.
const compact=JSON.parse(await readFile(`${input}.meta.json`,'utf8'));
const nodeBytes=await readFile(`${input}.nodes.bin`),edgeBytes=await readFile(`${input}.edges.bin`);
const heap={snapshot:compact.snapshot,strings:compact.names,
  nodes:new Uint32Array(nodeBytes.buffer,nodeBytes.byteOffset,nodeBytes.length/4),
  edges:new Uint32Array(edgeBytes.buffer,edgeBytes.byteOffset,edgeBytes.length/4)};
const meta=heap.snapshot.meta,nf=meta.node_fields,ef=meta.edge_fields;
const width=nf.length,ew=ef.length,n=heap.nodes.length/width;
const nt=nf.indexOf('type'),nn=nf.indexOf('name'),ns=nf.indexOf('self_size'),ne=nf.indexOf('edge_count');
const et=ef.indexOf('type'),en=ef.indexOf('name_or_index'),to=ef.indexOf('to_node');
const types=meta.node_types[nt],edgeTypes=meta.edge_types[et],strings=heap.strings;
const offsets=new Uint32Array(n+1);let cursor=0;
const totals=new Map();
for(let i=0;i<n;i++){
  offsets[i]=cursor;cursor+=heap.nodes[i*width+ne]*ew;
  const type=types[heap.nodes[i*width+nt]],r=totals.get(type)||{type,count:0,bytes:0};
  r.count++;r.bytes+=heap.nodes[i*width+ns];totals.set(type,r);
}
offsets[n]=cursor;
let context=-1;
for(let p=0;p<heap.edges.length;p+=ew){
  if(edgeTypes[heap.edges[p+et]]==='property'&&strings[heap.edges[p+en]]==='__WE3D_HEAP_CONTEXT__')context=heap.edges[p+to]/width;
}
if(context<0)throw Error('Expected explicitly tagged application context');
const excluded=new Set(['__proto__','prototype','constructor','parent','ownerDocument','native_context','context']);
const marks=new Uint32Array(n);let generation=0;
function dataReachable(root){
  generation++;const stack=[root];let bytes=0,count=0;
  while(stack.length){
    const id=stack.pop();if(marks[id]===generation)continue;marks[id]=generation;
    const type=types[heap.nodes[id*width+nt]];
    if(['closure','code','synthetic'].includes(type))continue;
    bytes+=heap.nodes[id*width+ns];count++;
    for(let p=offsets[id];p<offsets[id+1];p+=ew){
      const kind=edgeTypes[heap.edges[p+et]];
      if(kind==='weak'||kind==='shortcut')continue;
      if(kind==='property'||kind==='internal'){
        const name=strings[heap.edges[p+en]];
        if(excluded.has(name))continue;
        if(kind==='internal'&&type!=='array'&&!['elements','table','properties','buffer','backing_store'].includes(name))continue;
      }
      stack.push(heap.edges[p+to]/width);
    }
  }
  return {count,bytes};
}
const roots=[];
const reviewedOwners=new Set(['scene','roads','buildings','landuses','linearFeatures','pois','roadMeshes','buildingMeshes',
  'worldLoadRuntimeState','terrainTileCache','transportNetworkModel','transportStructureModel','transportStructureAssembly',
  'transportJunctionProfile','sharedTransportSurfacePresentation','tunnelSolidCompilation','structureProfileCompilation',
  'waterAreas','waterways','waterSurfaceRegistrySnapshot','buildingProvenanceRecords','buildingProvenanceModel',
  'livingWorldRuntime','worldPublication','streetPavement','streetFrontageGrading','roadContactIndex','linearWalkContactIndex',
  'vegetationFeatures','streetFurnitureMeshes','functionalPoiRecords','transportFacilityGraph','_worldLoadNodes']);
for(let p=offsets[context];p<offsets[context+1];p+=ew){
  if(edgeTypes[heap.edges[p+et]]!=='property')continue;
  const name=strings[heap.edges[p+en]],id=heap.edges[p+to]/width,type=types[heap.nodes[id*width+nt]];
  if(!reviewedOwners.has(name))continue;
  const size=dataReachable(id);roots.push({property:name,type,...size});
}
const captures=[];
const reviewedCaptures=new Set(['descriptors','descriptorByFeatureId','segmentCells','connectionsByKey','featureModelById','stationsByFeatureId','rawConnections','featureModels','features','records','byId','byFeatureId','options','sources']);
for(let p=offsets[context];p<offsets[context+1];p+=ew){
  const owner=strings[heap.edges[p+en]],root=heap.edges[p+to]/width;
  if(!reviewedOwners.has(owner))continue;
  for(let q=offsets[root];q<offsets[root+1];q+=ew){
    const fn=heap.edges[q+to]/width;
    if(types[heap.nodes[fn*width+nt]]!=='closure')continue;
    for(let r=offsets[fn];r<offsets[fn+1];r+=ew){
      if(edgeTypes[heap.edges[r+et]]!=='internal'||strings[heap.edges[r+en]]!=='context')continue;
      const scope=heap.edges[r+to]/width;
      for(let k=offsets[scope];k<offsets[scope+1];k+=ew){
        const name=strings[heap.edges[k+en]];
        if(edgeTypes[heap.edges[k+et]]==='context'&&reviewedCaptures.has(name))captures.push({owner,variable:name,...dataReachable(heap.edges[k+to]/width)});
      }
    }
  }
}
const result={scope:'Aggregate shallow bytes and overlapping structural data reachability; not dominator sizes. Excludes function contexts, prototype and scene-parent backedges. No heap values emitted.',
  captures,nodes:n,edges:heap.edges.length/ew,byType:[...totals.values()].sort((a,b)=>b.bytes-a.bytes),contextData:roots.sort((a,b)=>b.bytes-a.bytes)};
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({nodes:n,top:result.contextData.slice(0,20)},null,2));
