import {createPavementTerrainPartitionCooperatively} from './pavement-terrain-partition.js';
import { captureStreetSurfaceGeometry,serializeStreetSurfaceCapture } from './street-surface-capture.js';
import { createRoadMarkingMaterial } from '../road-render.js?v=4';
import { streetSourceInput } from './street-source-input.js';
import { indexPavementPositionsCooperatively } from './pavement-indexed-mesh.js';
import { createPavementBaseSamplerCooperatively } from './pavement-height-sampler.js';
import { assessStreetQuality } from './street-quality-assessment.js';
import { auditStreetCoverage } from './street-coverage.js';
import { createStreetOverview } from './street-overview.js';
import { StreetPacketCache } from './street-packet-cache.js';
import { streetMotion, streetPrefetch } from './street-prefetch.js';
import { getWorkloadPolicySnapshot } from '../runtime/workload-policy.js?v=1';
import { conformPavementMeshCooperatively } from './pavement-terrain-conformance.js';
import { rampCurbScale } from './compiler/street-crossings.js';
import { createRoadContactIndexCooperatively, selectLinearWalkContactMeshes } from '../terrain/road-contact-index.js?v=1';

import { publishLinearFeaturePresentationCooperatively } from './linear-feature-presentation.js?v=1';
import { buildFeatureRibbonEdges } from '../structure-semantics.js?v=63';
import { yieldToMainThread } from './cooperative-scheduling.js?v=1';

function concreteTexture(THREE) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(128, 128);
  let seed = 7231;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 183 + (seed % 13);
    pixels.data.set([value, value - 3, value - 8, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.strokeStyle = '#8c8982'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 127, 127);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function focusActor(appCtx) {
  return appCtx.planeMode?.active ? appCtx.planeMode : appCtx.droneMode ? appCtx.drone : appCtx.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : appCtx.car;
}

async function refreshMappedPaths(appCtx,pavementBounds){
  const meshes=[],sequence=appCtx._worldLoadSequence,features=appCtx.linearFeatures;
  const current=()=>sequence===appCtx._worldLoadSequence&&features===appCtx.linearFeatures&&!appCtx.onMoon;
  let index=null,committed=false;
  try {
    await publishLinearFeaturePresentationCooperatively({appCtx:{scene:appCtx.scene,linearFeatureMeshes:meshes,addEarthWorldObject(){}},buildFeatureRibbonEdges,features,pavementBounds,
      worldBaseTerrainY:(x,z)=>{const y=appCtx.terrainMeshHeightAt?.(x,z);return Number.isFinite(y)?y:appCtx.elevationWorldYAtWorldXZ?.(x,z);}}, {current});
    const retained=appCtx.linearFeatureMeshes.filter(m=>!m.userData?.isLinearFeatureBatch);
    index=await createRoadContactIndexCooperatively(selectLinearWalkContactMeshes([...retained,...meshes]),16,{current});
    if(!current())throw new Error('Mapped path publication superseded');
    for(const mesh of appCtx.linearFeatureMeshes.filter(m=>m.userData?.isLinearFeatureBatch)){mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
    appCtx.linearFeatureMeshes.splice(0,appCtx.linearFeatureMeshes.length,...retained,...meshes);
    for(const mesh of meshes)appCtx.addEarthWorldObject(mesh);
    appCtx.linearWalkContactIndex?.dispose();appCtx.linearWalkContactIndex=index;
    committed=true;
  } finally {
    if(!committed){index?.dispose();for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}}
  }
}

export async function publishStreetPavement(appCtx, options = {}) {
  let partitionSurface = null;
  const profileCache=new Map();
  if (appCtx.onMoon || !appCtx.scene || !appCtx.terrainEnabled) return null;
  if(appCtx.streetOverview){const sequence=appCtx._worldLoadSequence;await appCtx.streetOverview.pause();if(sequence!==appCtx._worldLoadSequence)return null;}
  appCtx._cancelStreetPavementBuild?.();
  const startedAt = performance.now();
  const trace = (phase, detail={}) => { if(new URLSearchParams(location.search).has('streetDiagnostics')) console.info('[StreetPavement]', phase, JSON.stringify(detail)); };
  const sequence = appCtx._worldLoadSequence;
  if(appCtx._streetPavementCacheSequence!==sequence){appCtx._streetPavementCache?.clear();appCtx._streetPavementCache=new StreetPacketCache();appCtx._streetPavementCacheSequence=sequence;}
  const packetCache=appCtx._streetPavementCache;
  const previous = appCtx.streetPavement;
  const replaceMappedLines=!appCtx.streetOverview?.completedBounds;
  const groundRevision = appCtx._groundSurfaceRevision || 0;
  const generation = appCtx._streetPavementGeneration = (appCtx._streetPavementGeneration || 0) + 1;
  const reference = options.focus || focusActor(appCtx) || { x: 0, z: 0 };
  const focus = { x: Math.round((reference.x || 0)/64)*64, z: Math.round((reference.z || 0)/64)*64 };
  const radius = 384;
  const coverageBounds = { minX:focus.x-radius, maxX:focus.x+radius, minZ:focus.z-radius, maxZ:focus.z+radius };
  const nearby = item => {
    const points=item.surfaceFootprint || item.pts || item.footprint || [];
    let bounds=item.bounds;
    if(!bounds || ![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)) {
      bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
      for(const p of points){bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minZ=Math.min(bounds.minZ,p.z);bounds.maxZ=Math.max(bounds.maxZ,p.z);}
    }
    return bounds.minX<=coverageBounds.maxX+48 && bounds.maxX>=coverageBounds.minX-48 && bounds.minZ<=coverageBounds.maxZ+48 && bounds.maxZ>=coverageBounds.minZ-48;
  };
  const current = () => sequence === appCtx._worldLoadSequence && generation === appCtx._streetPavementGeneration && groundRevision === (appCtx._groundSurfaceRevision || 0) && !appCtx.onMoon && !cancelled;
  const metersPerWorldUnit = appCtx.METERS_PER_WORLD_UNIT || 1.11;
  const managedPaths = (appCtx.linearFeatures || []).filter(f => nearby(f) && f.kind === 'footway' && ['sidewalk','crossing'].includes(f.subtype) && !f.isStructureConnector && !f.structureSemantics?.gradeSeparated && ['at_grade', undefined].includes(f.structureSemantics?.terrainMode));
  const workerUrl = globalThis.__WORLD_EXPLORER_PRODUCTION__?.streetPavementWorkerUrl ||
    new URL('./compiler/street-pavement-worker.js', import.meta.url);
  const worker = new Worker(workerUrl, { type: 'module' });
  let pendingRequest = null;
  let cancelled = false;
  const cancelBuild = () => {
    cancelled = true;
    worker.terminate();
    pendingRequest?.();
    worker.onmessage=null;worker.onerror=null;
  };
  appCtx._cancelStreetPavementBuild = cancelBuild;
  const request = data => new Promise((resolve, reject) => {
    if (cancelled) { reject(new Error('Street compilation superseded')); return; }
    const cleanup = () => { clearTimeout(timeout); pendingRequest = null; worker.onmessage = null; worker.onerror = null; };
    pendingRequest = () => { cleanup(); reject(new Error('Street compilation superseded')); };
    const timeout = setTimeout(() => { worker.terminate(); cleanup(); reject(new Error(`Street ${data.type} exceeded its per-chunk time budget`)); }, 15000);
    worker.onmessage = event => {
      if (event.data.type === 'trace') {
        const field=document.getElementById('streetCompilationInput');
        if(field) field.value=JSON.stringify(event.data.tile);
        return;
      }
      cleanup(); event.data.type === 'error' ? reject(new Error(event.data.message)) : resolve(event.data); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message)); };
    try { worker.postMessage(data); } catch (error) { cleanup(); reject(error); }
  });
  const source=streetSourceInput(appCtx,nearby),roadRecords=source.roads;
  const input={...source,coverageBounds};
  let committed = false;
  const stagedLines = [];
  const batches = new Map();
  const staged = [], texture = concreteTexture(THREE);
  let contactIndex = null, stagedWalkContactIndex = null;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture,
    normalMap: appCtx.pavementNormal || null, roughnessMap: appCtx.pavementRoughness || null, roughness: 0.96, metalness: 0 });
  material.normalScale?.set(0.12, 0.12);
  const markingMaterial = createRoadMarkingMaterial({color:0xeee9df,roughness:.9,emissive:0,emissiveIntensity:0});
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x99978f, roughness: 0.96, side: THREE.DoubleSide });
  const ground = (x, z) => {
    const y = appCtx.terrainMeshHeightAt?.(x, z);
    return Number.isFinite(y) ? y : appCtx.elevationWorldYAtWorldXZ?.(x, z);
  };
  const stats = { tiles: 0, triangles: 0, curbTriangles: 0, markingTriangles:0, ramps:0, workerMs: 0, inferredFrontages: 0, managedPaths: managedPaths.length, residentRoads:roadRecords.length, residentBuildings:input.buildings.length, roads: appCtx.roads.length, roadMeshes: appCtx.roadMeshes.length, buildings: appCtx.buildings.length, worldLoadSequence: sequence };
  const schedule={current:()=>current()&&!cancelled,onSlice:ms=>{stats.maxPublicationSliceMs=Math.max(stats.maxPublicationSliceMs||0,ms);}};
  const disposeLines = () => { for (const mesh of stagedLines) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } };
  const disposeStaged = () => { worker.terminate(); contactIndex?.dispose(); stagedWalkContactIndex?.dispose(); batches.clear(); for (const mesh of staged) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); } texture?.dispose(); material.dispose(); curbMaterial.dispose(); markingMaterial.dispose(); staged.length = 0; };
    if (new URLSearchParams(location.search).has('streetDiagnostics')) {
      let panel = document.getElementById('streetSurfaceDiagnostics');
      if (!panel) {
        panel = document.createElement('details'); panel.id = 'streetSurfaceDiagnostics';
        panel.style.cssText = 'position:fixed;right:8px;top:110px;z-index:9999;background:#101921;color:#fff;padding:10px;max-width:340px;max-height:calc(100vh - 130px);overflow:auto;font:12px monospace';
        panel.appendChild(document.createElement('summary')).textContent = 'Street surface verification';
        const overviewProgress=panel.appendChild(document.createElement('div'));overviewProgress.id='streetOverviewProgress';
        panel.appendChild(document.createElement('pre')); document.body.appendChild(panel);
        const memoryButton=panel.appendChild(document.createElement('button'));
        memoryButton.textContent='Inspect memory and running work';
        let previousRuntime = null;
        memoryButton.onclick=()=>{
          const buffers=new Set();let geometryBytes=0;
          appCtx.scene?.traverse(object=>{
            for(const attribute of [...Object.values(object.geometry?.attributes || {}),object.geometry?.index]){
              const buffer=(attribute?.array || attribute?.data?.array)?.buffer;
              if(buffer && !buffers.has(buffer)){buffers.add(buffer);geometryBytes+=buffer.byteLength;}
            }
          });
          const runtime=appCtx.getRuntimeKernelSnapshot?.();
          const systems=Object.values(runtime?.phases || {}).flat();
          const updates=Object.fromEntries(systems.map(system=>[system.id,system.updates]));
          const workSinceLastInspection=previousRuntime ? systems.filter(system=>system.updates>(previousRuntime[system.id] || 0)).map(system=>({id:system.id,updates:system.updates-(previousRuntime[system.id] || 0),lastDurationMs:system.lastDurationMs})) : null;
          previousRuntime=updates;
          if(appCtx.streetPavement) appCtx.streetPavement.stats.sourceCoverage=auditStreetCoverage({...appCtx,coverageBounds:appCtx.streetPavement.coverageBounds,metersPerWorldUnit});
          const snapshot={
            note:'Legacy browser heap estimate may include shared contexts or omit workers; it is not isolated tab memory. Geometry bytes exclude textures and GPU overhead. Inspect twice to see runtime activity.',
            javascriptHeapBytes:performance.memory?.usedJSHeapSize ?? null,
            sceneGeometryBytes:geometryBytes,rendererResources:appCtx.renderer?.info?.memory,
            gameStarted:appCtx.gameStarted,worldLoading:appCtx.worldLoading,
            pavementBuildActive:typeof appCtx._cancelStreetPavementBuild==='function',
            deferredWork:getWorkloadPolicySnapshot(),
            street:appCtx.streetPavement?.stats,workSinceLastInspection
          };
          snapshot.streetOverview=appCtx.streetOverview?.stats;
          snapshot.captureNearbySelection=appCtx.captureNearbySelection;
          snapshot.slowRuntimeSystems=systems.filter(system=>system.slowUpdates>0).map(({id,maxDurationMs,slowUpdates,lastSlowFrame})=>({id,maxDurationMs,slowUpdates,lastSlowFrame}));
          snapshot.vegetationRefresh=appCtx.vegetationRefreshTiming;
          snapshot.frameTiming=appCtx.getPerfSpikeMetrics?.(true);
          snapshot.aircraft=appCtx.planeMode?.active ? {x:appCtx.planeMode.x,y:appCtx.planeMode.y,z:appCtx.planeMode.z,speed:appCtx.planeMode.speed,airborne:appCtx.planeMode.airborne} : null;
          snapshot.groundMode=appCtx.worldLoadRuntimeState?.groundMode;
          snapshot.groundProvenance=appCtx.worldLoadRuntimeState?.acceptedGround;
          snapshot.terrainOwnership=appCtx.locationTerrainPublication;
          snapshot.terrainCompilation=appCtx.transportTerrainCorridorStats;
          snapshot.contactIndexes={roads:appCtx.roadContactIndex?.stats?.(),walkways:appCtx.linearWalkContactIndex?.stats?.()};
          snapshot.heightSamplingCaches=appCtx.heightSamplingCacheStats?.();
          snapshot.roadTerrainConformance=appCtx.transportSurfacePublication?.roadTerrainConformance;
          snapshot.transportPhases=appCtx.transportSurfacePublication?.phaseDurationsMs;
          snapshot.firstRender=appCtx.worldLoadRuntimeState?.firstRender;
          snapshot.graphicsCalls=appCtx.graphicsCallEvidence?.snapshot();
          snapshot.loadPhases=appCtx.worldLoadRuntimeState?.phaseTotals;
          snapshot.gameplayStartup=appCtx.worldLoadRuntimeState?.gameplayStartupDurationsMs;
          snapshot.gameplayStartupTotalMs=appCtx.worldLoadRuntimeState?.gameplayRuntimeDurationMs;
          snapshot.geometryByLayer=Object.fromEntries(['roadMeshes','buildingMeshes','landuseMeshes','urbanSurfaceMeshes','linearFeatureMeshes','vegetationMeshes'].map(key=>{
            const seen=new Set();let bytes=0;
            for(const mesh of appCtx[key]||[])mesh.traverse?.(object=>{for(const attribute of [...Object.values(object.geometry?.attributes||{}),object.geometry?.index]){const buffer=(attribute?.array||attribute?.data?.array)?.buffer;if(buffer&&!seen.has(buffer)){seen.add(buffer);bytes+=buffer.byteLength;}}});
            return [key,bytes];
          }));
          panel.querySelector('pre').textContent=JSON.stringify({...snapshot,quality:assessStreetQuality(snapshot)},null,2);
        };
        const inputDetails=panel.appendChild(document.createElement('details'));
        inputDetails.appendChild(document.createElement('summary')).textContent='Compilation input';
        const inputField=inputDetails.appendChild(document.createElement('textarea'));inputField.id='streetCompilationInput';inputField.readOnly=true;inputField.setAttribute('aria-label','Street compilation input');
        panel.querySelector('pre').style.cssText='white-space:pre-wrap;max-height:310px;overflow:auto';
        const layoutCapture=panel.appendChild(document.createElement('button'));layoutCapture.textContent='Capture resident layout';
        layoutCapture.onclick=()=>{inputField.value=appCtx.streetPavement?.exportLayout?.() || '';inputDetails.open=true;};
        const pickX=panel.appendChild(document.createElement('input'));pickX.type='number';pickX.value='25';pickX.min='0';pickX.max='100';pickX.setAttribute('aria-label','Inspection horizontal percent');pickX.style.width='50px';
        const pickY=panel.appendChild(document.createElement('input'));pickY.type='number';pickY.value='57.5';pickY.min='0';pickY.max='100';pickY.setAttribute('aria-label','Inspection vertical percent');pickY.style.width='50px';
        const pick=panel.appendChild(document.createElement('button'));pick.textContent='Inspect surface at screen position';
        pick.onclick=()=>{
          const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(Number(pickX.value)/50-1,1-Number(pickY.value)/50),appCtx.camera);
          const hits=ray.intersectObjects(appCtx.scene.children,true).filter(h=>{
            if(!h.object.isMesh)return false;
            for(let p=h.object;p;p=p.parent)if(!p.visible)return false;
            return true;
          });
          const hit=hits[0];
          const data=hit?.object.userData || {};
          panel.querySelector('pre').textContent=JSON.stringify({layers:hits.slice(0,8).map(h=>({point:h.point,parent:h.object.parent?.name,kind:h.object.userData?.kind,landuse:h.object.userData?.landuseType,material:{type:h.object.material?.type,depthTest:h.object.material?.depthTest,offset:h.object.material?.polygonOffset,factor:h.object.material?.polygonOffsetFactor,units:h.object.material?.polygonOffsetUnits},renderOrder:h.object.renderOrder})),point:hit?.point,object:hit?.object.name,parent:hit?.object.parent?.name,
            pavement:hit ? appCtx.streetPavement?.sampleAt(hit.point.x,hit.point.z):null,
            owner:{registeredRoad:appCtx.roadMeshes?.includes(hit?.object),isRoadBatch:data.isRoadBatch,isRoadSkirt:data.isRoadSkirt,landuseType:data.landuseType,kind:data.kind,keys:Object.keys(data)},
            indexedRoad:hit ? appCtx.roadContactIndex?.sampleAt(hit.point.x,hit.point.z,hit.point.y):null, terrain:hit ? ground(hit.point.x,hit.point.z):null, road:hit ? (()=>{const match=appCtx.findNearestRoad?.(hit.point.x,hit.point.z);const r=match?.road;return {distance:match?.dist,y:match?.y,name:r?.name,width:r?.width,pts:r?.pts,tags:r?.transportRecord?.sourceTags,semantics:r?.structureSemantics};})():null},null,2);
        };
        const overhead=panel.appendChild(document.createElement('button'));overhead.textContent='Look down in drone mode';
        overhead.onclick=()=>{if(appCtx.droneMode)appCtx.drone.cameraPitchOffset=-1.1;};
        const capture=panel.appendChild(document.createElement('button'));capture.textContent='Capture nearby surface geometry';
        capture.onclick=()=>{
          const p=focusActor(appCtx);
          inputField.value=serializeStreetSurfaceCapture(captureStreetSurfaceGeometry(appCtx,p,ground));inputDetails.open=true;
        };
        const rebuild = panel.appendChild(document.createElement('button')); rebuild.textContent='Rebuild sidewalks';
        rebuild.onclick=async()=>{rebuild.disabled=true;appCtx._streetPavementUpdating=true;
          try {await publishStreetPavement(appCtx);} catch(error){panel.querySelector('pre').textContent=String(error);}
          finally {rebuild.disabled=false;appCtx._streetPavementUpdating=false;}};
        const inspect = panel.appendChild(document.createElement('button')); inspect.textContent = 'Inspect nearby street';
        inspect.onclick = () => {
          const p = appCtx.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : appCtx.droneMode ? appCtx.drone : appCtx.car;
          const match = appCtx.findNearestRoad?.(p.x,p.z);
          const road = match?.road;
          panel.querySelector('pre').textContent = JSON.stringify({ ...appCtx.streetPavement?.stats, position: {x:p.x,y:p.y,z:p.z},
            roadRendered:appCtx.GroundHeight?._raycastMeshY(appCtx.roadMeshes,p.x,p.z,1500), mappedAreaRendered:appCtx.GroundHeight?._raycastMeshY(appCtx.landuseMeshes,p.x,p.z,1500), contact:(()=>{const c=appCtx.GroundHeight?.walkSurfaceInfo(p.x,p.z,p.y-1.7,{sampleRenderedMesh:false});return {source:c?.source,y:c?.y};})(), indexedRoad:appCtx.roadContactIndex?.sampleAt(p.x,p.z,match?.y), terrain:ground(p.x,p.z), pavement:appCtx.streetPavement?.sampleAt(p.x,p.z),
            nearbyBuildings: (appCtx.buildings || []).map(b => ({ name:b.name,type:b.type,pts:b.surfaceFootprint || b.pts || b.footprint || [] })).map(b=>({...b,distance:Math.min(...b.pts.map(q=>Math.hypot(p.x-q.x,p.z-q.z)))})).filter(b=>b.distance<40).sort((a,b)=>a.distance-b.distance).slice(0,3),
            road: road ? { name:road.name,type:road.type,width:road.width,tags:road.transportRecord?.sourceTags,section:road.transportRecord?.crossSection,
              constrained:road.resolvedCrossSection?.constrainedSegmentCount,sourceWidth:road.resolvedCrossSection?.sourceWidthMeters,localWidths:road.resolvedCrossSection?.segmentWidthsMeters?.slice(0,6) } : null },null,2);
        };
        for (const [label,key,duration] of [['Walk forward 3 seconds','w',3000],['Move backward 3 seconds','s',3000],['Ascend 3 seconds',' ',3000],['Descend 3 seconds','Shift',3000],['Move right 3 seconds','d',3000],['Step left 1 second','a',1000],['Step right 1 second','d',1000]]) {
          const button = panel.appendChild(document.createElement('button')); button.textContent=label;
          button.onclick=()=>{ document.activeElement?.blur();const code=key===' '?'Space':key==='Shift'?'ShiftLeft':'Key'+key.toUpperCase();window.dispatchEvent(new KeyboardEvent('keydown',{key,code,bubbles:true}));
            setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key,code,bubbles:true})),duration); };
        }
      }
      panel.querySelector('pre').textContent = JSON.stringify(stats, null, 2);
    }
  try {
    partitionSurface = await createPavementTerrainPartitionCooperatively(appCtx.terrainGroup?.children, {includeFarTerrain:true,bounds:coverageBounds,...schedule});
    const prepared = await request({ type: 'prepare', input, cached:packetCache.manifest(), debug: new URLSearchParams(location.search).has('streetDiagnostics') });
    stats.plannedTiles = prepared.tiles;
    trace('prepared',{tiles:prepared.tiles,paths:managedPaths.length});
    for (;;) {
      if (!current()) { disposeStaged(); return null; }
      let packet = await request({ type: 'next' });
      if (packet.type === 'complete') break;
      if(packet.type==='cached'){
        const reused=packetCache.get(packet.key,packet.fingerprint);
        if(reused){packet={...reused,completed:packet.completed,total:packet.total};stats.reusedCells=(stats.reusedCells||0)+1;}
        else {packet=await request({type:'retry'});packetCache.put(packet);}
      }else packetCache.put(packet);
      if(packet.completed%16===0)trace('cell',{completed:packet.completed,total:packet.total});
      const tile = { ...packet, segments: packet.segments.map(s => ({ ...s, road: appCtx.roads[s.roadIndex] })) };
      const inferredFrontages = packet.inferredFrontages;
      const diagnostics = document.querySelector('#streetSurfaceDiagnostics pre');
      if (diagnostics) diagnostics.textContent = JSON.stringify({...stats,completedTiles:packet.completed,plannedTiles:packet.total},null,2);
      if (appCtx.worldLoading) appCtx.showLoad?.(`Compiling nearby pavement grid: ${packet.completed} / ${packet.total} cells (not whole-location coverage)`);
      stats.workerMs += Number(packet.durationMs) || 0;
      if (!packet.mesh.vertices.length && !packet.mesh.markingVertices?.length) continue;
      const mesh = packet.mesh;
      const sample = await createPavementBaseSamplerCooperatively({segments:tile.segments,ground,roadContactIndex:appCtx.roadContactIndex,profileCache,groundRevision},schedule);
      let sampleYieldAt=performance.now();
      for (const positions of [mesh.vertices, mesh.curbVertices]) for(let i=0;i<positions.length;i+=3) {
        positions[i+1] += sample(positions[i],positions[i+2]);
        if(i%72===0 && performance.now()-sampleYieldAt>=8) {
          await yieldToMainThread();sampleYieldAt=performance.now();
          if(!current()){disposeStaged();return null;}
        }
      }

      const addedTriangles = await conformPavementMeshCooperatively(mesh, sample,
        (x, z) => sample(x, z) + (.12 / metersPerWorldUnit) * rampCurbScale(x, z, packet.ramps || []),
        {partitionSurface,yieldWork:yieldToMainThread,current:schedule.current,onSlice:ms=>{stats.maxConformanceSliceMs=Math.max(stats.maxConformanceSliceMs||0,ms);}});
      if(addedTriangles>(stats.highestRefinement?.addedTriangles||0))stats.highestRefinement={cell:packet.key,bounds:packet.bounds,addedTriangles,baseTriangles:mesh.vertices.length/9-addedTriangles};
      stats.terrainRefinementTriangles = (stats.terrainRefinementTriangles || 0) + addedTriangles;
      await yieldToMainThread();
      if (!current()) { disposeStaged(); return null; }
      const markingVertices=[];
      let markingYieldAt=performance.now();
      for(let i=0;i<(mesh.markingVertices?.length || 0);i+=9) {
        const points=[];
        for(let j=i;j<i+9;j+=3)points.push({x:mesh.markingVertices[j],z:mesh.markingVertices[j+2]});
        const projected=appCtx.roadContactIndex?.projectTriangle(points,.012,'at_grade')||[];
        for(const v of projected)markingVertices.push(v);
        if(performance.now()-markingYieldAt>=8){
          await yieldToMainThread();markingYieldAt=performance.now();
          if(!current()){disposeStaged();return null;}
        }
      }
      stats.markingTriangles+=markingVertices.length/9; stats.ramps+=packet.rampCount || 0;
      stats.tiles++; stats.triangles += mesh.vertices.length / 9; stats.curbTriangles += mesh.curbVertices.length / 9; stats.inferredFrontages += inferredFrontages;
      const [ix,iz]=packet.key.split(':').map(Number);
      for (const [positions, mat, kind] of [[mesh.vertices, material, 'sidewalk'], [mesh.curbVertices, curbMaterial, 'curb'], [markingVertices, markingMaterial, 'crossing-marking']]) {
        const key=`${Math.floor(ix/2)}:${Math.floor(iz/2)}:${kind}`;
        if(!batches.has(key)) batches.set(key,{positions:[],mat,kind});
        const target=batches.get(key).positions;
        for (const value of positions) target.push(value);
      }
      await yieldToMainThread();
    }
    if (!current()) { disposeStaged(); return null; }
    for (const {positions,mat,kind} of batches.values()) {
      if(!current()) {disposeStaged();return null;}
      if(!positions.length) continue;
      const indexed=await indexPavementPositionsCooperatively(positions,schedule);
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(indexed.positions,3));
      geometry.setIndex(new THREE.BufferAttribute(indexed.indices,1));
      const uv=[];
      for(let i=0;i<indexed.positions.length;i+=3) uv.push(indexed.positions[i]*metersPerWorldUnit/1.6,indexed.positions[i+2]*metersPerWorldUnit/1.6);
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const object=new THREE.Mesh(geometry,mat);object.receiveShadow=true;
      object.userData={streetPavement:true,sharedUrbanSurfaceMaterial:true,kind,worldLoadSequence:sequence};
      staged.push(object);
      await yieldToMainThread();
    }
    if(!current()) {disposeStaged();return null;}
    stats.drawCalls=staged.length;
    stats.compilerCacheBytes=packetCache.bytes;
    stats.coverageBounds=coverageBounds;
    worker.terminate();
    // Build replacements off-scene. A failure leaves both old areas and old paths intact.
    trace('mapped-paths-start',{features:appCtx.linearFeatures.length});
    if(replaceMappedLines)await publishLinearFeaturePresentationCooperatively({
      appCtx: { scene: appCtx.scene, linearFeatureMeshes: stagedLines, addEarthWorldObject() {} },
      buildFeatureRibbonEdges, features: appCtx.linearFeatures, pavementBounds: coverageBounds, worldBaseTerrainY: ground
    },schedule);
    trace('mapped-paths-complete',{batches:stagedLines.length});
    // Publish all surfaces and contact data together. Old coverage is retained until this point.
    contactIndex = await createRoadContactIndexCooperatively(staged.filter(mesh => mesh.userData.kind === 'sidewalk'), 4,schedule);
    if(replaceMappedLines){
      const nextLines=[...appCtx.linearFeatureMeshes.filter(m=>!m.userData?.isLinearFeatureBatch),...stagedLines];
      stagedWalkContactIndex=await createRoadContactIndexCooperatively(selectLinearWalkContactMeshes(nextLines),16,schedule);
    }
    if(!current()||cancelled){disposeLines();disposeStaged();return null;}
    batches.clear();
    stats.indexBytes=staged.reduce((sum,mesh)=>sum+(mesh.geometry.index?.array.byteLength||0),0);
    stats.positionBytes = staged.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.array.byteLength, 0);
    const publication = { stats, focus, groundRevision, coverageBounds, meshes: staged,
      sampleAt: (x, z) => contactIndex.sampleAt(x, z), dispose: disposeStaged };
    if(new URLSearchParams(location.search).has('streetDiagnostics')) publication.exportLayout=()=>JSON.stringify(input);
    for (const mesh of staged) { appCtx.addEarthWorldObject(mesh); appCtx.urbanSurfaceMeshes.push(mesh); }
    stats.durationMs = Math.round(performance.now() - startedAt);
    for (const mesh of stagedLines) appCtx.addEarthWorldObject(mesh);
    appCtx.streetPavement = publication;
    appCtx.streetOverview?.setDetailBounds(coverageBounds);
    appCtx._streetPavementDirty = false;
    committed = true;
    if (previous) {
      appCtx.urbanSurfaceMeshes.splice(0, appCtx.urbanSurfaceMeshes.length, ...appCtx.urbanSurfaceMeshes.filter(m => !previous.meshes.includes(m)));
      previous.dispose();
    }
    // Rebuild mapped-line presentation once, excluding only sidewalks now owned by the area compiler.
    if(replaceMappedLines)for (const mesh of appCtx.linearFeatureMeshes.filter(m => m.userData?.isLinearFeatureBatch)) {
      mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    }
    if(replaceMappedLines)appCtx.linearFeatureMeshes.splice(0, appCtx.linearFeatureMeshes.length, ...appCtx.linearFeatureMeshes.filter(m => !m.userData?.isLinearFeatureBatch));
    appCtx.linearFeatureMeshes.push(...stagedLines);
    if(stagedWalkContactIndex){
      appCtx.linearWalkContactIndex?.dispose();
      appCtx.linearWalkContactIndex=stagedWalkContactIndex;stagedWalkContactIndex=null;
    }
    appCtx.urbanSurfaceStats = { ...appCtx.urbanSurfaceStats, sidewalkBatchCount: staged.length, sidewalkTriangles: stats.triangles, sidewalkVertices: stats.triangles * 3 };
    const diagnostics = document.querySelector('#streetSurfaceDiagnostics pre');
    if (diagnostics) diagnostics.textContent = JSON.stringify(stats,null,2);
    trace('published',stats);
    appCtx.scheduleWorldCoverVegetationRefresh?.();
    return stats;
  } catch (error) {
    if (!committed) { disposeLines(); disposeStaged(); if (cancelled || !current()) return null; throw error; }
    console.warn('[StreetPavement] Surfaces published; follow-up refresh failed:', error);
    return stats;
  } finally {
    partitionSurface?.dispose();profileCache.clear();profileCache.ground=null;profileCache.contact=null;
    if (appCtx._cancelStreetPavementBuild === cancelBuild) appCtx._cancelStreetPavementBuild = null;
  }
}

export function updateStreetPavementFocus(appCtx) {
  if (appCtx.worldLoading || appCtx.onMoon || (!appCtx.streetPavement && !appCtx._streetPavementDirty) || appCtx._streetPavementUpdating || performance.now() < (appCtx._streetPavementRetryAt || 0)) return;
  const p = focusActor(appCtx);
  if (!p) return;
  appCtx._streetMotion=streetMotion(appCtx._streetMotion,p,performance.now(),appCtx._worldLoadSequence);
  const progress=document.getElementById?.('streetOverviewProgress'),overview=appCtx.streetOverview?.stats;
  if(progress)progress.textContent=overview?`Location pavement: ${overview.status} — ${overview.completedCells} / ${overview.totalCells??'?'} cells${overview.error?': '+overview.error:''}`:'Location pavement is queued after nearby detail.';
  const ground=appCtx.terrainMeshHeightAt?.(p.x,p.z);
  if(appCtx.gameStarted&&(appCtx.planeMode?.active||appCtx.droneMode)&&Number.isFinite(ground)&&p.y-ground>80){
    appCtx.streetOverview ||= createStreetOverview(appCtx,{onComplete:bounds=>refreshMappedPaths(appCtx,bounds)});
    appCtx.streetOverview.step(p);return;
  }
  // Keep accepted detail until approaching its boundary. The old radial
  // 128-unit trigger replaced a 768-unit square even while the actor remained
  // deep inside it. Predict a bounded forward window from movement and the
  // previous build duration; stationary arrivals retain the 128-unit margin.
  const bounds=appCtx.streetPavement?.coverageBounds;
  const prefetch=streetPrefetch(p,appCtx._streetMotion,bounds,appCtx.streetPavement?.stats?.durationMs);
  if(!appCtx._streetPavementDirty && !prefetch.needsBuild){
    if(appCtx.gameStarted){appCtx.streetOverview ||= createStreetOverview(appCtx,{onComplete:bounds=>refreshMappedPaths(appCtx,bounds)});appCtx.streetOverview.step(p);}
    return;
  }
  appCtx._streetPavementDirty = false;
  appCtx._streetPavementUpdating = true;
  publishStreetPavement(appCtx,{focus:prefetch.focus}).catch(error => { appCtx._streetPavementRetryAt=performance.now()+30000; appCtx._streetPavementDirty=true; console.warn('[StreetPavement] Retaining accepted surfaces:',error); })
    .finally(()=>{appCtx._streetPavementUpdating=false;});
}

// One existing worker, one acknowledged cell in flight. Let it advance with
// rendered frames instead of waiting for the 5 Hz visibility-maintenance tick.
export function updateStreetOverviewFrame(appCtx) {
  if(!appCtx.gameStarted||appCtx.worldLoading||appCtx.onMoon||appCtx._streetPavementUpdating||appCtx._cancelStreetPavementBuild)return;
  const point=focusActor(appCtx);
  if(point)appCtx.streetOverview?.step(point);
}
