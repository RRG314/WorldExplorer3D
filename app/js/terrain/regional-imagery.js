// Broad geographic colour, shared by near terrain and the distant terrain mesh.
// This is dated aerial/satellite imagery, not live weather, geometry or a bare-earth albedo product.
const R = 6378137;
const entries = new Map();
const localOwners = new WeakMap();
export function imageryMercator(lat, lon) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return { x: R * lon * Math.PI / 180, y: R * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) };
}
export function regionalImagerySpec(lat, lon, spanMeters = 40000) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 84 || Math.abs(lon) > 180 || !Number.isFinite(spanMeters) || spanMeters <= 0 || spanMeters > 80000) return null;
  const center = imageryMercator(lat, lon);
  const half = spanMeters / 2 / Math.cos(lat * Math.PI / 180);
  // Avoid wrapping exports at the date line; semantic materials remain available.
  if (Math.abs(center.x) + half > Math.PI * R) return null;
  const bounds = [center.x - half, center.y - half, center.x + half, center.y + half];
  return { key: `${lat}:${lon}:${spanMeters}`, bounds };
}
// Use the provider's existing tile cache at both scales. Dynamic imagery
// exports can exceed the world-load budget even while cached tiles are healthy.
export function regionalImageryTileLayout(spec) {
  const [west, south, east, north] = spec.bounds, circumference = 2 * Math.PI * R;
  const zoom = Math.max(0, Math.min(18, Math.floor(Math.log2(circumference * 2048 / ((east - west) * 256)))));
  const tileSpan = circumference / 2 ** zoom, origin = circumference / 2;
  const minX = Math.floor((west + origin) / tileSpan), maxX = Math.ceil((east + origin) / tileSpan) - 1;
  const minY = Math.floor((origin - north) / tileSpan), maxY = Math.ceil((origin - south) / tileSpan) - 1;
  const tiles = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    tiles.push({ x, y, zoom, left: (x * tileSpan - origin - west) / (east - west) * 2048,
      top: (north - (origin - y * tileSpan)) / (north - south) * 2048,
      size: tileSpan / (east - west) * 2048 });
  }
  if (tiles.length > 81) throw Error('Imagery tile budget exceeded');
  return tiles;
}
async function loadCachedImage(spec, signal) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const context = canvas.getContext('2d');
  const tiles = regionalImageryTileLayout(spec); let next = 0;
  async function worker() {
    while (next < tiles.length) {
      signal.throwIfAborted();
      const tile = tiles[next++];
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.zoom}/${tile.y}/${tile.x}`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw Error(`Imagery tile HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size > 1024 * 1024 || !blob.type.startsWith('image/')) throw Error('Invalid imagery tile');
      const image = await createImageBitmap(blob);
      try {
        signal.throwIfAborted();
        if (image.width !== 256 || image.height !== 256) throw Error('Unexpected imagery tile dimensions');
        context.drawImage(image, tile.left, tile.top, tile.size, tile.size);
      } finally { image.close(); }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return canvas;
}
export function regionalImageryUv(spec, lat, lon) {
  const p = imageryMercator(lat, lon), [west, south, east, north] = spec.bounds;
  return [(p.x - west) / (east - west), (p.y - south) / (north - south)];
}
function loadEntry(spec) {
  const entry = { spec, users: new Set(), controller: new AbortController(), texture: null, status: 'loading' };
  entries.set(spec.key, entry);
  entry.promise = (async () => {
    for (let attempt = 0; attempt < 2 && !entry.controller.signal.aborted; attempt++) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      entry.controller.signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, attempt ? 12000 : 8000);
      try {
        const image = await loadCachedImage(spec, controller.signal);
        if (controller.signal.aborted) throw Error('Imagery decode timed out');
        const texture = new THREE.Texture(image);
        texture.name = 'Esri World Imagery regional colour';
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        entry.texture = texture; entry.status = 'available';
        for (const update of entry.users) update(entry);
        return;
      } catch (error) {
        controller.abort();
        entry.error = String(error?.message || error).slice(0, 180);
        entry.status = entry.controller.signal.aborted ? 'cancelled' : attempt === 0 ? 'retrying' : 'unavailable';
        for (const update of entry.users) update(entry);
      } finally {
        clearTimeout(timer); entry.controller.signal.removeEventListener('abort', cancel);
      }
    }
  })();
  return entry;
}
function releaseEntry(entry,update){
 entry.users.delete(update);
 if(!entry.users.size){entry.controller.abort();entry.texture?.dispose();if(entries.get(entry.spec.key)===entry)entries.delete(entry.spec.key);}
}
export function imageryUvTransform(regional,local){
 const a=regional.bounds,b=local.bounds,w=b[2]-b[0],h=b[3]-b[1];
 return [(a[2]-a[0])/w,(a[3]-a[1])/h,(a[0]-b[0])/w,(a[1]-b[1])/h];
}
function localOwner(ctx){
 const originKey=`${ctx.LOC?.lat}:${ctx.LOC?.lon}`;
 let owner=localOwners.get(ctx);if(owner?.originKey===originKey)return owner;
 const users=new Set();let current=null,pending=null,retryAt=0,disposed=false,started=false;
 const notify=()=>{for(const update of users)update(current?.entry,pending?.entry);};
 const release=lease=>{if(lease)releaseEntry(lease.entry,lease.update);};
 function request(spec){
  if(disposed||!spec||current?.entry.spec.key===spec.key||pending||Date.now()<retryAt)return;
  const entry=entries.get(spec.key)||loadEntry(spec),lease={entry,update:null};
  lease.update=()=>{
   if(disposed||pending!==lease)return;
   if(entry.texture){const retired=current;current=lease;pending=null;retryAt=0;notify();release(retired);}
   else if(['unavailable','cancelled'].includes(entry.status)){pending=null;retryAt=Date.now()+15000;notify();release(lease);}
   else notify();
  };
  pending=lease;entry.users.add(lease.update);lease.update();
 }
 owner={originKey,subscribe(update){users.add(update);update(current?.entry,pending?.entry);return()=>{
  users.delete(update);if(!users.size){disposed=true;release(pending);release(current);pending=current=null;if(localOwners.get(ctx)===owner)localOwners.delete(ctx);}
 };},focus(point){
  const toGeo=ctx.worldToGeo||ctx.worldToLatLon;
  if(typeof toGeo!=='function')return;
  // The high-resolution window advances well before its 3 km edge. Do not
  // restart a healthy in-flight image every frame at aircraft speed.
  const unit=Number(ctx.WORLD_UNITS_PER_METER)||1,grid=1200*unit;
  const geo=toGeo(Math.round(point.x/grid)*grid,Math.round(point.z/grid)*grid);
  request(regionalImagerySpec(Number(geo?.lat),Number(geo?.lon),6000));
 },start(){if(!started){started=true;request(regionalImagerySpec(Number(ctx.LOC.lat),Number(ctx.LOC.lon),6000));}},
 snapshot:()=>({users:users.size,current:current?.entry.spec.key||null,pending:pending?.entry.spec.key||null,retryAt})};
 localOwners.set(ctx,owner);return owner;
}
export function updateRegionalImageryFocus(ctx,point){localOwners.get(ctx)?.focus(point);}
export function regionalImagerySnapshot(ctx){return {entries:[...entries.values()].map(e=>({key:e.spec.key,users:e.users.size,status:e.status,texture:!!e.texture})),local:localOwners.get(ctx)?.snapshot()||null};}
export function attachRegionalImagery(mesh, ctx, uniforms) {
  if (mesh.userData.regionalImagery || Number(ctx.renderer?.capabilities?.maxTextures || 0) < 16) return false;
  const center=mesh.userData.regionalImageryCenter||ctx.LOC;
  const spec = regionalImagerySpec(Number(center?.lat), Number(center?.lon));
  const positions = mesh.geometry?.attributes?.position;
  const toGeo = ctx.worldToGeo || ctx.worldToLatLon;
  if (!spec || !positions || typeof toGeo !== 'function') return false;
  mesh.updateMatrixWorld(true);
  const uv = new Float32Array(positions.count * 2), point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const geo = toGeo(point.x, point.z);
    uv.set(regionalImageryUv(spec, geo.lat, geo.lon), i * 2);
  }
  mesh.geometry.setAttribute('terrainGeographicUv', new THREE.BufferAttribute(uv, 2));
  const provenance = mesh.userData.regionalImagery = { status: 'loading', source: 'Esri World Imagery', attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community', representation: 'dated imagery colour with procedural surface detail', bounds: spec.bounds };
  const subscriptions = [];
  for (const [layerSpec, map, ready, status] of [
    [spec, 'terrainRegionalMap', 'terrainRegionalReady', 'status']
  ]) {
    if (!layerSpec || !uniforms[map]) continue;
    const entry = entries.get(layerSpec.key) || loadEntry(layerSpec);
    const update = current => {
      provenance[status] = current.status;
      if (current.error && current.status === 'unavailable') provenance[`${status}Error`] = current.error;
      if (current.texture) {
        uniforms[map].value = current.texture; uniforms[ready].value = 1;
        const credit = globalThis.document?.getElementById?.('terrainImageryCredit');
        if (credit) credit.hidden = false;
      }
    };
    entry.users.add(update); update(entry); subscriptions.push({ entry, update });
  }
  const owner=localOwner(ctx);
  const unsubscribe=owner.subscribe((current,pending)=>{
    provenance.localStatus=current?.status||pending?.status||'unavailable';
    provenance.localPending=pending?.status||null;
    if(current?.texture&&uniforms.terrainLocalMap){
      uniforms.terrainLocalMap.value=current.texture;uniforms.terrainLocalReady.value=1;
      uniforms.terrainLocalUvTransform ||= {value:[1,1,0,0]};
      uniforms.terrainLocalUvTransform.value=imageryUvTransform(spec,current.spec);
      provenance.localBounds=current.spec.bounds;
      const credit=globalThis.document?.getElementById?.('terrainImageryCredit');if(credit)credit.hidden=false;
    }
  });
  owner.start();
  const material = mesh.material;
  const release = () => {
    material.removeEventListener('dispose', release);
    unsubscribe();
    for (const { entry, update } of subscriptions) {
      releaseEntry(entry,update);
    }
    const credit = globalThis.document?.getElementById?.('terrainImageryCredit');
    if (credit) credit.hidden = ![...entries.values()].some(entry => entry.texture && entry.users.size);
  };
  material.addEventListener('dispose', release);
  material.defines = { ...material.defines, WE3D_TERRAIN_REGIONAL_IMAGE: 1 };
  material.needsUpdate = true;
  return true;
}
