
import { publishLinearFeaturePresentation } from './linear-feature-presentation.js?v=1';
import { buildFeatureRibbonEdges } from '../structure-semantics.js?v=63';
import { yieldToMainThread } from './cooperative-scheduling.js?v=1';

function triangleY(triangle, x, z) {
  const [a, b, c] = triangle;
  const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(den) < 1e-10) return null;
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / den;
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / den;
  const w = 1 - u - v;
  return u >= -1e-7 && v >= -1e-7 && w >= -1e-7 ? u * a.y + v * b.y + w * c.y : null;
}

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
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function focusActor(appCtx) {
  return appCtx.droneMode ? appCtx.drone : appCtx.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : appCtx.car;
}

export async function publishStreetPavement(appCtx) {
  if (appCtx.onMoon || !appCtx.scene || !appCtx.terrainEnabled) return null;
  const startedAt = performance.now();
  const trace = (phase, detail={}) => { if(new URLSearchParams(location.search).has('streetDiagnostics')) console.info('[StreetPavement]', phase, JSON.stringify(detail)); };
  const sequence = appCtx._worldLoadSequence;
  const previous = appCtx.streetPavement;
  const generation = appCtx._streetPavementGeneration = (appCtx._streetPavementGeneration || 0) + 1;
  const reference = focusActor(appCtx) || { x: 0, z: 0 };
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
    return bounds.minX<=coverageBounds.maxX+24 && bounds.maxX>=coverageBounds.minX-24 && bounds.minZ<=coverageBounds.maxZ+24 && bounds.maxZ>=coverageBounds.minZ-24;
  };
  const current = () => sequence === appCtx._worldLoadSequence && generation === appCtx._streetPavementGeneration && !appCtx.onMoon;
  const metersPerWorldUnit = appCtx.METERS_PER_WORLD_UNIT || 1.11;
  const managedPaths = (appCtx.linearFeatures || []).filter(f => nearby(f) && f.kind === 'footway' && f.subtype === 'sidewalk' && !f.isStructureConnector && !f.structureSemantics?.gradeSeparated && ['at_grade', undefined].includes(f.structureSemantics?.terrainMode));
  const worker = new Worker(new URL('./compiler/street-pavement-worker.js', import.meta.url), { type: 'module' });
  const request = data => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error(`Street ${data.type} exceeded its per-chunk time budget`)); }, 15000);
    worker.onmessage = event => {
      if (event.data.type === 'trace') {
        const field=document.getElementById('streetCompilationInput');
        if(field) field.value=JSON.stringify(event.data.tile);
        return;
      }
      clearTimeout(timeout); event.data.type === 'error' ? reject(new Error(event.data.message)) : resolve(event.data); };
    worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
    worker.postMessage(data);
  });
  const roadRecords = appCtx.roads.flatMap((road, auditIndex) => nearby(road) ? [{ auditIndex, pts: road.pts, width: road.width, type: road.type,
    resolvedCrossSection: road.resolvedCrossSection, structureSemantics: road.structureSemantics,
    transportRecord: road.transportRecord }] : []);
  const polygonRecords = items => (items || []).filter(nearby).map(item => ({ pts: item.surfaceFootprint || item.pts || item.footprint, holes: item.holes, holeRings: item.holeRings, type: item.type, tags: item.tags }));
  const input = { roads: roadRecords, buildings: polygonRecords((appCtx.buildings || []).filter(b=>!b.allowsPassageBelow)), landuses: polygonRecords(appCtx.landuses),
    linearFeatures: managedPaths.map(f => ({ kind: f.kind, subtype: f.subtype, width: f.width, pts: f.pts, structureSemantics: f.structureSemantics })), metersPerWorldUnit, coverageBounds };
  let committed = false;
  const stagedLines = [];
  const batches = new Map();
  const staged = [], lookup = new Map(), texture = appCtx.pavementDiffuse ? null : concreteTexture(THREE);
  const material = new THREE.MeshStandardMaterial({ color: 0xb5b3ae, map: appCtx.pavementDiffuse || texture,
    normalMap: appCtx.pavementNormal || null, roughnessMap: appCtx.pavementRoughness || null, roughness: 0.96, metalness: 0 });
  material.normalScale?.set(0.22, 0.22);
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x99978f, roughness: 0.96, side: THREE.DoubleSide });
  const ground = (x, z) => {
    const y = appCtx.terrainMeshHeightAt?.(x, z);
    return Number.isFinite(y) ? y : appCtx.elevationWorldYAtWorldXZ?.(x, z);
  };
  const stats = { tiles: 0, triangles: 0, curbTriangles: 0, workerMs: 0, inferredFrontages: 0, managedPaths: managedPaths.length, residentRoads:roadRecords.length, residentBuildings:input.buildings.length, roads: appCtx.roads.length, roadMeshes: appCtx.roadMeshes.length, buildings: appCtx.buildings.length, worldLoadSequence: sequence };
  const disposeLines = () => { for (const mesh of stagedLines) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } };
  const disposeStaged = () => { worker.terminate(); for (const mesh of staged) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); } texture?.dispose(); material.dispose(); curbMaterial.dispose(); };
    if (new URLSearchParams(location.search).has('streetDiagnostics')) {
      let panel = document.getElementById('streetSurfaceDiagnostics');
      if (!panel) {
        panel = document.createElement('details'); panel.id = 'streetSurfaceDiagnostics';
        panel.style.cssText = 'position:fixed;right:8px;top:110px;z-index:9999;background:#101921;color:#fff;padding:10px;max-width:340px;font:12px monospace';
        panel.appendChild(document.createElement('summary')).textContent = 'Street surface verification';
        panel.appendChild(document.createElement('pre')); document.body.appendChild(panel);
        const inputDetails=panel.appendChild(document.createElement('details'));
        inputDetails.appendChild(document.createElement('summary')).textContent='Compilation input';
        const inputField=inputDetails.appendChild(document.createElement('textarea'));inputField.id='streetCompilationInput';inputField.readOnly=true;inputField.setAttribute('aria-label','Street compilation input');
        panel.querySelector('pre').style.cssText='white-space:pre-wrap;max-height:310px;overflow:auto';
        const pickX=panel.appendChild(document.createElement('input'));pickX.type='number';pickX.value='25';pickX.min='0';pickX.max='100';pickX.setAttribute('aria-label','Inspection horizontal percent');pickX.style.width='50px';
        const pickY=panel.appendChild(document.createElement('input'));pickY.type='number';pickY.value='57.5';pickY.min='0';pickY.max='100';pickY.setAttribute('aria-label','Inspection vertical percent');pickY.style.width='50px';
        const pick=panel.appendChild(document.createElement('button'));pick.textContent='Inspect surface at screen position';
        pick.onclick=()=>{
          const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(Number(pickX.value)/50-1,1-Number(pickY.value)/50),appCtx.camera);
          const hit=ray.intersectObjects(appCtx.scene.children,true).find(h=>{
            if(!h.object.isMesh)return false;
            for(let p=h.object;p;p=p.parent)if(!p.visible)return false;
            return true;
          });
          const data=hit?.object.userData || {};
          panel.querySelector('pre').textContent=JSON.stringify({point:hit?.point,object:hit?.object.name,parent:hit?.object.parent?.name,
            owner:{registeredRoad:appCtx.roadMeshes?.includes(hit?.object),isRoadBatch:data.isRoadBatch,isRoadSkirt:data.isRoadSkirt,landuseType:data.landuseType,kind:data.kind,keys:Object.keys(data)},
            indexedRoad:hit ? appCtx.roadContactIndex?.sampleAt(hit.point.x,hit.point.z,hit.point.y):null, terrain:hit ? ground(hit.point.x,hit.point.z):null, road:hit ? (()=>{const match=appCtx.findNearestRoad?.(hit.point.x,hit.point.z);const r=match?.road;return {distance:match?.dist,y:match?.y,name:r?.name,width:r?.width,pts:r?.pts,tags:r?.transportRecord?.sourceTags,semantics:r?.structureSemantics};})():null},null,2);
        };
        const overhead=panel.appendChild(document.createElement('button'));overhead.textContent='Look down in drone mode';
        overhead.onclick=()=>{if(appCtx.droneMode)appCtx.drone.cameraPitchOffset=-1.1;};
        const capture=panel.appendChild(document.createElement('button'));capture.textContent='Capture nearby surface geometry';
        capture.onclick=()=>{
          const p=appCtx.Walk?.state?.walker || appCtx.car;
          const triangles=[];
          for(const mesh of appCtx.roadMeshes || []) {
            if(mesh.userData?.isRoadSkirt || mesh.userData?.isRoadMarking)continue;
            const positions=mesh.geometry?.attributes.position.array,indices=mesh.geometry?.index.array;
            if(!positions || !indices)continue;
            for(let i=0;i<indices.length;i+=3) {
              const ps=Array.from(indices.slice(i,i+3),j=>({x:positions[j*3],y:positions[j*3+1],z:positions[j*3+2]}));
              if(ps.some(q=>Math.abs(q.x-p.x)<32 && Math.abs(q.z-p.z)<32))triangles.push(ps.map(q=>({...q,terrain:ground(q.x,q.z)})));
            }
          }
          const samples=[];
          for(let dx=-32;dx<=32;dx+=1)for(let dz=-32;dz<=32;dz+=1) {
            const x=p.x+dx,z=p.z+dz,terrain=ground(x,z),road=appCtx.roadContactIndex?.sampleAt(x,z,terrain);
            samples.push({x,z,terrain,road});
          }
          inputField.value=JSON.stringify({origin:{x:p.x,z:p.z},triangles,samples});inputDetails.open=true;
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
        for (const [label,key,duration] of [['Walk forward 3 seconds','w',3000],['Move right 3 seconds','d',3000],['Step left 1 second','a',1000],['Step right 1 second','d',1000]]) {
          const button = panel.appendChild(document.createElement('button')); button.textContent=label;
          button.onclick=()=>{ document.activeElement?.blur(); window.dispatchEvent(new KeyboardEvent('keydown',{key,code:'Key'+key.toUpperCase(),bubbles:true}));
            setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key,code:'Key'+key.toUpperCase(),bubbles:true})),duration); };
        }
      }
      panel.querySelector('pre').textContent = JSON.stringify(stats, null, 2);
    }
  try {
    const prepared = await request({ type: 'prepare', input, debug: new URLSearchParams(location.search).has('streetFixture') });
    stats.plannedTiles = prepared.tiles;
    trace('prepared',{tiles:prepared.tiles,paths:managedPaths.length});
    for (;;) {
      if (!current()) { disposeStaged(); return null; }
      const packet = await request({ type: 'next' });
      if (packet.type === 'complete') break;
      if(packet.completed%16===0)trace('cell',{completed:packet.completed,total:packet.total});
      const tile = { ...packet, segments: packet.segments.map(s => ({ ...s, road: appCtx.roads[s.roadIndex] })) };
      const inferredFrontages = packet.inferredFrontages;
      const diagnostics = document.querySelector('#streetSurfaceDiagnostics pre');
      if (diagnostics) diagnostics.textContent = JSON.stringify({...stats,completedTiles:packet.completed,plannedTiles:packet.total},null,2);
      if (appCtx.worldLoading) appCtx.showLoad?.(`Building sidewalks: ${packet.completed} / ${packet.total}`);
      stats.workerMs += Number(packet.durationMs) || 0;
      if (!packet.mesh.vertices.length) continue;
      // The compiled profile already contains terrain-following elevation. Sample
      // its clearance at bounded segment endpoints once, rather than querying the
      // complete engineering model separately for every tessellated vertex.
      for (const s of tile.segments) {
        const clearance=(p,t)=> {
          const profile=appCtx.sampleFeatureSurfaceY?.(s.road,p.x,p.z,{segIndex:s.index,t,x:p.x,z:p.z,dist:0});
          const indexed=appCtx.roadContactIndex?.sampleAt(p.x,p.z,profile);
          const height=Number.isFinite(indexed) ? indexed : profile;
          const base=ground(p.x,p.z);
          const roadBias=Number.isFinite(s.road?.surfaceBias) ? s.road.surfaceBias : .18;
          return Math.max(roadBias,Number.isFinite(height) && Number.isFinite(base) ? height-base : roadBias);
        };
        s.clearanceA=clearance(s.a,s.t0);s.clearanceB=clearance(s.b,s.t1);
      }
      const sampleHeight = (x, z) => {
        const terrain = ground(x, z); let nearest = null;
        for (const s of tile.segments) {
          const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, lengthSq = dx * dx + dz * dz;
          const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / lengthSq));
          const px = s.a.x + dx * t, pz = s.a.z + dz * t, distance = Math.hypot(x - px, z - pz);
          if (!nearest || distance < nearest.distance) nearest = { s, t, px, pz, distance };
        }
        if (!nearest) return terrain + 0.018;
        const { s, t, px, pz, distance } = nearest;
        const halfWidth = (s.wa + (s.wb - s.wa) * t) / 2;
        const blend = Math.max(0, 1 - Math.max(0, distance - halfWidth) / 8);
        return terrain + Math.max(0.018, s.clearanceA+(s.clearanceB-s.clearanceA)*t) * blend;
      };
      const mesh = packet.mesh;
      const heights = new Map();
      const sample = (x,z) => { const key = `${x}:${z}`; if (!heights.has(key)) {const y=sampleHeight(x,z);if(!Number.isFinite(y))throw new Error('Pavement has no accepted terrain height');heights.set(key,y);} return heights.get(key); };
      for (const positions of [mesh.vertices, mesh.curbVertices]) for(let i=0;i<positions.length;i+=3) {
        positions[i+1] += sample(positions[i],positions[i+2]);
        if(i>0 && i%6000===0) {await yieldToMainThread();if(!current()){disposeStaged();return null;}}
      }
      for (const triangle of mesh.triangles) for (const p of triangle) p.y += sample(p.x,p.z);
      stats.tiles++; stats.triangles += mesh.triangles.length; stats.curbTriangles += mesh.curbVertices.length / 9; stats.inferredFrontages += inferredFrontages;
      for (const triangle of mesh.triangles) {
        const minX = Math.floor(Math.min(...triangle.map(p => p.x)) / 4), maxX = Math.floor(Math.max(...triangle.map(p => p.x)) / 4);
        const minZ = Math.floor(Math.min(...triangle.map(p => p.z)) / 4), maxZ = Math.floor(Math.max(...triangle.map(p => p.z)) / 4);
        for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
          const key = `${x}:${z}`; if (!lookup.has(key)) lookup.set(key, []); lookup.get(key).push(triangle);
        }
      }
      const [ix,iz]=packet.key.split(':').map(Number);
      for (const [positions, mat, kind] of [[mesh.vertices, material, 'sidewalk'], [mesh.curbVertices, curbMaterial, 'curb']]) {
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
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      const uv=[];
      for(let i=0;i<positions.length;i+=3) uv.push(positions[i]*metersPerWorldUnit/1.6,positions[i+2]*metersPerWorldUnit/1.6);
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const object=new THREE.Mesh(geometry,mat);object.receiveShadow=true;
      object.userData={streetPavement:true,sharedUrbanSurfaceMaterial:true,kind,worldLoadSequence:sequence};
      staged.push(object);
      await yieldToMainThread();
    }
    if(!current()) {disposeStaged();return null;}
    stats.drawCalls=staged.length;
    stats.coverageBounds=coverageBounds;
    worker.terminate();
    // Build replacements off-scene. A failure leaves both old areas and old paths intact.
    trace('mapped-paths-start',{features:appCtx.linearFeatures.length});
    publishLinearFeaturePresentation({
      appCtx: { scene: appCtx.scene, linearFeatureMeshes: stagedLines, addEarthWorldObject() {} },
      buildFeatureRibbonEdges, features: appCtx.linearFeatures, pavementBounds: coverageBounds, worldBaseTerrainY: ground
    });
    trace('mapped-paths-complete',{batches:stagedLines.length});
    // Publish all surfaces and contact data together. Old coverage is retained until this point.
    const publication = { stats, focus, coverageBounds, meshes: staged, sampleAt(x, z) {
      let best = null;
      for (const triangle of lookup.get(`${Math.floor(x / 4)}:${Math.floor(z / 4)}`) || []) {
        const y = triangleY(triangle, x, z); if (Number.isFinite(y) && (best === null || y > best)) best = y;
      }
      return best;
    }, dispose: disposeStaged };
    for (const mesh of staged) { appCtx.addEarthWorldObject(mesh); appCtx.urbanSurfaceMeshes.push(mesh); }
    stats.durationMs = Math.round(performance.now() - startedAt);
    for (const mesh of stagedLines) appCtx.addEarthWorldObject(mesh);
    appCtx.streetPavement = publication;
    committed = true;
    if (previous) {
      appCtx.urbanSurfaceMeshes.splice(0, appCtx.urbanSurfaceMeshes.length, ...appCtx.urbanSurfaceMeshes.filter(m => !previous.meshes.includes(m)));
      previous.dispose();
    }
    // Rebuild mapped-line presentation once, excluding only sidewalks now owned by the area compiler.
    for (const mesh of appCtx.linearFeatureMeshes.filter(m => m.userData?.isLinearFeatureBatch)) {
      mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    }
    appCtx.linearFeatureMeshes.splice(0, appCtx.linearFeatureMeshes.length, ...appCtx.linearFeatureMeshes.filter(m => !m.userData?.isLinearFeatureBatch));
    appCtx.linearFeatureMeshes.push(...stagedLines);
    appCtx.urbanSurfaceStats = { ...appCtx.urbanSurfaceStats, sidewalkBatchCount: staged.length, sidewalkTriangles: stats.triangles, sidewalkVertices: stats.triangles * 3 };
    const diagnostics = document.querySelector('#streetSurfaceDiagnostics pre');
    if (diagnostics) diagnostics.textContent = JSON.stringify(stats,null,2);
    trace('published',stats);
    appCtx.scheduleWorldCoverVegetationRefresh?.();
    return stats;
  } catch (error) {
    if (!committed) { disposeLines(); disposeStaged(); throw error; }
    console.warn('[StreetPavement] Surfaces published; follow-up refresh failed:', error);
    return stats;
  }
}

export function updateStreetPavementFocus(appCtx) {
  if (appCtx.worldLoading || appCtx.onMoon || !appCtx.streetPavement || appCtx._streetPavementUpdating || performance.now() < (appCtx._streetPavementRetryAt || 0)) return;
  const p = focusActor(appCtx);
  if (!p || (!appCtx._streetPavementDirty && Math.hypot(p.x-appCtx.streetPavement.focus.x,p.z-appCtx.streetPavement.focus.z)<128)) return;
  appCtx._streetPavementDirty = false;
  appCtx._streetPavementUpdating = true;
  publishStreetPavement(appCtx).catch(error => { appCtx._streetPavementRetryAt=performance.now()+30000; appCtx._streetPavementDirty=true; console.warn('[StreetPavement] Retaining accepted surfaces:',error); })
    .finally(()=>{appCtx._streetPavementUpdating=false;});
}
