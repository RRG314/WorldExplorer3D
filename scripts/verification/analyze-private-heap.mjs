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
  generation++;const stack=[root];let bytes=0,count=0;const byType={};
  while(stack.length){
    const id=stack.pop();if(marks[id]===generation)continue;marks[id]=generation;
    const type=types[heap.nodes[id*width+nt]];
    if(['closure','code','synthetic'].includes(type))continue;
    bytes+=heap.nodes[id*width+ns];count++;const group=byType[type]||={count:0,bytes:0};group.count++;group.bytes+=heap.nodes[id*width+ns];
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
  return {count,bytes,byType};
}
const roots=[];
const reviewedOwners=new Set(['scene','roads','buildings','landuses','linearFeatures','pois','roadMeshes','buildingMeshes',
  'worldLoadRuntimeState','terrainTileCache','transportNetworkModel','transportStructureModel','transportStructureAssembly',
  'transportJunctionProfile','sharedTransportSurfacePresentation','tunnelSolidCompilation','structureProfileCompilation',
  'waterAreas','waterways','waterSurfaceRegistrySnapshot','buildingProvenanceRecords','buildingProvenanceModel',
  'livingWorldRuntime','worldPublication','streetPavement','streetFrontageGrading','roadContactIndex','linearWalkContactIndex',
  'vegetationFeatures','streetFurnitureMeshes','functionalPoiRecords','transportFacilityGraph','_worldLoadNodes']);
if(process.env.WE3D_HEAP_ALL_CONTEXT==='1'){
  const inventory=JSON.parse(await readFile(new URL('../../docs/system-review/2026-10-04/inventory.json',import.meta.url),'utf8'));
  for(const row of inventory.contextRoots)reviewedOwners.add(row.root);
}
for(let p=offsets[context];p<offsets[context+1];p+=ew){
  if(edgeTypes[heap.edges[p+et]]!=='property')continue;
  const name=strings[heap.edges[p+en]],id=heap.edges[p+to]/width,type=types[heap.nodes[id*width+nt]];
  if(!reviewedOwners.has(name))continue;
  const size=dataReachable(id);roots.push({property:name,type,...size});
}
const captures=[];
const reviewedCaptures=new Set(['descriptors','descriptorByFeatureId','segmentCells','connectionsByKey','featureModelById','stationsByFeatureId','rawConnections','featureModels','features','records','byId','byFeatureId','options','sources','_cachedWaterMeshes','compiledModels','compiledRegions','profiles','cache','templateCache','entries','rawTileCache','decodedTileCache','data','tiles','snapshot','featureBounds','boundsByRoad','mapCache','bodyCache','trafficCompilation','trafficGraph','sampleVehicleSurface','population','state']);
for(let p=offsets[context];p<offsets[context+1];p+=ew){
  const owner=strings[heap.edges[p+en]],root=heap.edges[p+to]/width;
  if(!reviewedOwners.has(owner))continue;
  const ownerFunctions=types[heap.nodes[root*width+nt]]==='closure'?[root]:[];
  for(let q=offsets[root];q<offsets[root+1];q+=ew)if(types[heap.nodes[(heap.edges[q+to]/width)*width+nt]]==='closure')ownerFunctions.push(heap.edges[q+to]/width);
  for(const fn of ownerFunctions){
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
const constructors={};
const reviewedConstructors=new Set(['ArrayBuffer','SharedArrayBuffer','Float32Array','Float64Array','Uint32Array','Uint16Array','Uint8Array','Uint8ClampedArray','Int32Array','DataView']);
for(let i=0;i<n;i++){const name=strings[heap.nodes[i*width+nn]];if(reviewedConstructors.has(name)&&types[heap.nodes[i*width+nt]]==='object')constructors[name]=(constructors[name]||0)+1;}
// Optional strong-root paths identify who owns unusually large shallow nodes.
// Emit reviewed source identifiers only, never arbitrary snapshot strings.
const largest=[];let strongReachability=null;
if(process.env.WE3D_HEAP_ROOT_PATHS==='1'){
  const parent=new Int32Array(n).fill(-1), parentEdge=new Uint32Array(n), queue=new Uint32Array(n),scopeOwner=new Uint32Array(n);
  const scopeSizes=new Map();
  let first=0,last=1;queue[0]=0;parent[0]=0;
  while(first<last){
    const id=queue[first++];
    for(let p=offsets[id];p<offsets[id+1];p+=ew){
      if(edgeTypes[heap.edges[p+et]]==='weak')continue;
      const next=heap.edges[p+to]/width;
      if(parent[next]!==-1)continue;
      parent[next]=id;parentEdge[next]=p;scopeOwner[next]=edgeTypes[heap.edges[p+et]]==='context'?heap.edges[p+en]:scopeOwner[id];queue[last++]=next;
    }
  }
  let unreachedBytes=0,reachableBytes=0;
  for(let id=0;id<n;id++){
    const bytes=heap.nodes[id*width+ns];
    if(parent[id]<0){unreachedBytes+=bytes;continue;}
    reachableBytes+=bytes;const key=scopeOwner[id],row=scopeSizes.get(key)||{slot:key,count:0,bytes:0};row.count++;row.bytes+=bytes;scopeSizes.set(key,row);
  }
  strongReachability={reachableCount:last,reachableBytes,unreachedCount:n-last,unreachedBytes,nearestContext:[...scopeSizes.values()].sort((a,b)=>b.bytes-a.bytes).slice(0,30).map(row=>({...row,variable:reviewedCaptures.has(strings[row.slot])?strings[row.slot]:undefined}))};
  const safeNames=new Set([...reviewedOwners,...reviewedCaptures,...reviewedConstructors,
    'window','globalThis','__WE3D_HEAP_CONTEXT__','__WE3D_PERF_CONTEXT__','appCtx','ctx','scene','state',
    'entries','cache','templateCache','value','resources','animations','root','geometry','attributes',
    'array','buffer','table','elements','properties','context','nodes','tiles','rawTileCache','data','result',
    '(GC roots)','(Strong roots)','(Global handles)','(Internalized strings)','(External strings)','(StringTable)','(object elements)','(object properties)','system / NativeContext','system / Context',
    'dispose','options','records','trafficCompilation','trafficGraph','sampleVehicleSurface','population','fixedUpdate','startLivingWorldRuntime','createTrafficVehicleSurfaceSampler','createLivingWorldPopulation','onBeforeRender','onBeforeCompile','handleWorldSelection','value','scope_info','shared','feedback_cell','map','prototype','_listeners','children','userData','get','set','snapshot','group','vehicleSnapshots','pedestrianSnapshots','pickableRoots','sampleVehicleSurface','onBeforeRender','onAfterRender','render','fixedUpdate','Map','Set','WeakMap','Array','Object','Float32Array']);
  function retainedPath(id){
    const path=[];let next=id;
    for(let length=0;next&&parent[next]>=0&&length<100;length++){
      const p=parentEdge[next],kind=edgeTypes[heap.edges[p+et]],name=strings[heap.edges[p+en]],ownerName=strings[heap.nodes[parent[next]*width+nn]];
      path.push({kind,name:kind!=='element'&&kind!=='hidden'&&safeNames.has(name)?name:undefined,parentType:types[heap.nodes[parent[next]*width+nt]],parentName:safeNames.has(ownerName)?ownerName:undefined});next=parent[next];
    }
    return path.reverse();
  }
  strongReachability.selectedScopes=[];
  const selected=new Set();
  for(let p=0;p<heap.edges.length;p+=ew)if(edgeTypes[heap.edges[p+et]]==='context'&&strings[heap.edges[p+en]]==='trafficCompilation'){
    const id=heap.edges[p+to]/width;if(selected.has(id))continue;selected.add(id);
    strongReachability.selectedScopes.push({variable:'trafficCompilation',...dataReachable(id),path:retainedPath(id)});
  }
  const candidates=[];for(let i=0;i<n;i++)if(heap.nodes[i*width+ns]>=1048576)candidates.push(i);
  candidates.sort((a,b)=>heap.nodes[b*width+ns]-heap.nodes[a*width+ns]);
  for(const id of candidates.slice(0,30)){
    const path=[];let next=id;
    for(let length=0;next&&parent[next]>=0&&length<100;length++){
      const p=parentEdge[next],kind=edgeTypes[heap.edges[p+et]],name=strings[heap.edges[p+en]];
      path.push({kind,name:kind!=='element'&&kind!=='hidden'&&safeNames.has(name)?name:undefined,parentType:types[heap.nodes[parent[next]*width+nt]]});next=parent[next];
    }
    largest.push({name:safeNames.has(strings[heap.nodes[id*width+nn]])?strings[heap.nodes[id*width+nn]]:undefined,type:types[heap.nodes[id*width+nt]],bytes:heap.nodes[id*width+ns],rootReached:next===0,path:path.reverse()});
  }
}
const result={constructors,largest,strongReachability,scope:'Aggregate shallow bytes and overlapping structural data reachability; not dominator sizes. Excludes function contexts, prototype and scene-parent backedges. No heap values emitted.',
  captures,nodes:n,edges:heap.edges.length/ew,byType:[...totals.values()].sort((a,b)=>b.bytes-a.bytes),contextData:roots.sort((a,b)=>b.bytes-a.bytes)};
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({nodes:n,top:result.contextData.slice(0,20)},null,2));
