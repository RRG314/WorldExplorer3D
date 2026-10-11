import {oceanTileAt,oceanTileWindow,oceanTileCoordinate,oceanNodeKey,interpolateOceanTile} from './stream-grid.js';
import {fetchGebcoDepthEvidence,createGebcoDepthEvidence,normalizeDepthEvidence} from '../geospatial/bathymetry-evidence.js?v=1';

// Only this owner schedules geographic ocean depth. Four shared corner samples
// per tile; at most two provider calls, nine resident tiles and 64 cached nodes.
// Missing/failed samples never become navigable or a zero-height seabed.
export function createOceanDepthStream({fetchDepth=fetchGebcoDepthEvidence,now=()=>Date.now(),onTile=()=>{},onRetire=()=>{}}={}) {
  const tiles=new Map(),nodes=new Map(),jobs=new Map();let wanted=new Set(),disposed=false,revision=0,centerKey='',retryAt=0;
  const stats={requested:0,failed:0,published:0,retired:0,peakTiles:0,peakRequests:0};
  function prune(){
    const used=new Set([...tiles.values()].flatMap(t=>t.nodes));
    for(const key of nodes.keys())if(nodes.size>64&&!used.has(key)&&!jobs.has(key))nodes.delete(key);
  }
  function publish(){
    if(disposed)return;
    for(const tile of tiles.values())if(!tile.ready&&tile.nodes.every(key=>Number.isFinite(nodes.get(key)?.elevationMeters))){
      tile.values=tile.nodes.map(key=>nodes.get(key).elevationMeters);tile.ready=true;revision++;stats.published++;onTile(tile);
    }
  }
  function pump(){
    if(disposed)return;
    publish();
    for(const tile of tiles.values())for(let n=0;n<4;n++){
      if(jobs.size>=2)return;
      const key=tile.nodes[n],old=nodes.get(key);
      if(jobs.has(key)||Number.isFinite(old?.elevationMeters)||(old?.retryAt||0)>now())continue;
      const point=tile.corners[n],controller=new AbortController();jobs.set(key,controller);
      stats.requested++;stats.peakRequests=Math.max(stats.peakRequests,jobs.size);
      Promise.resolve().then(()=>fetchDepth(point.lat,point.lon,{signal:controller.signal,timeoutMs:6500})).then(e=>{
        if(disposed||controller.signal.aborted)return;
        if(!Number.isFinite(e?.elevationMeters))throw Error('Missing depth');
        nodes.delete(key);nodes.set(key,{elevationMeters:e.elevationMeters});
      }).catch(()=>{if(!disposed&&!controller.signal.aborted){nodes.set(key,{retryAt:now()+30000});stats.failed++;}}).finally(()=>{
        jobs.delete(key);prune();pump();
      });
    }
  }
  function update(lat,lon){
    if(disposed)return;
    const center=oceanTileAt(lat,lon);if(!center)return;
    if(center.key!==centerKey){
      centerKey=center.key;const window=oceanTileWindow(lat,lon);wanted=new Set(window.map(t=>t.key));
      for(const [key,tile] of tiles)if(!wanted.has(key)){tiles.delete(key);if(tile.ready){onRetire(tile);stats.retired++;revision++;}}
      for(const t of window)if(!tiles.has(t.key)){
        const corners=[[0,0],[1,0],[0,1],[1,1]].map(([s,t0])=>oceanTileCoordinate(t,s,t0));
        tiles.set(t.key,{...t,corners,nodes:corners.map(oceanNodeKey),ready:false});
      }
      // Keep already-running shared corners; obsolete requests are cancelled.
      const needed=new Set([...tiles.values()].flatMap(t=>t.nodes));
      for(const [key,controller] of jobs)if(!needed.has(key))controller.abort();
      stats.peakTiles=Math.max(stats.peakTiles,tiles.size);prune();pump();
    }else if(now()>=retryAt){retryAt=now()+1000;pump();}
  }
  function sample(lat,lon){
    const p=oceanTileAt(lat,lon),tile=p&&tiles.get(p.key);
    const elevation=tile?.ready?interpolateOceanTile(tile.values,p.s,p.t):null;
    return Number.isFinite(elevation)?createGebcoDepthEvidence(elevation,{sampleWindowDegrees:.02}):normalizeDepthEvidence({reason:'ocean-tile-not-ready'});
  }
  return {update,sample,get revision(){return revision},get tiles(){return [...tiles.values()].filter(t=>t.ready)},
    snapshot:()=>({active:!disposed,centerKey,resident:tiles.size,ready:[...tiles.values()].filter(t=>t.ready).length,nodes:nodes.size,inFlight:jobs.size,revision,...stats}),
    dispose(){if(disposed)return;disposed=true;for(const controller of jobs.values())controller.abort();for(const tile of tiles.values())if(tile.ready)onRetire(tile);tiles.clear();nodes.clear();wanted.clear();revision++;}
  };
}
