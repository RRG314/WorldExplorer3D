// Vector tiles include a drawing buffer outside their geographic cell. Those
// copies are useful for 2D strokes, but must not become independent 3D roads.
// Clip in the provider's Mercator frame, before graph/height compilation.
export function clipVectorLineToTile(coordinates, tileX, tileY, zoom) {
  const scale = 2 ** zoom, epsilon = 1e-9;
  const project = ([lon, lat]) => ({
    x: (lon + 180) / 360 * scale - tileX,
    y: (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale - tileY
  });
  const unproject = p => [
    (tileX + p.x) / scale * 360 - 180,
    Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + p.y) / scale))) * 180 / Math.PI
  ];
  const canonical = p => ({x:Math.abs(p.x)<epsilon?0:Math.abs(p.x-1)<epsilon?1:p.x,
    y:Math.abs(p.y)<epsilon?0:Math.abs(p.y-1)<epsilon?1:p.y});
  const equal = (a,b) => Math.abs(a.x-b.x)<epsilon && Math.abs(a.y-b.y)<epsilon;
  const paths=[];let path=null,last=null;
  for(let i=1;i<coordinates.length;i++) {
    const a=canonical(project(coordinates[i-1])),b=canonical(project(coordinates[i]));
    if(![a.x,a.y,b.x,b.y].every(Number.isFinite)){path=null;last=null;continue;}
    // Half-open ownership for a line exactly on a tile edge: the east/south
    // cell owns it. Crossing endpoints remain closed on both incident cells.
    if((a.x===1&&b.x===1)||(a.y===1&&b.y===1)){path=null;last=null;continue;}
    const dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1,accepted=true;
    for(const [p,q] of [[-dx,a.x],[dx,1-a.x],[-dy,a.y],[dy,1-a.y]]) {
      if(Math.abs(p)<1e-15){if(q<0){accepted=false;break;}continue;}
      const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
      if(lo>hi){accepted=false;break;}
    }
    if(!accepted){path=null;last=null;continue;}
    const start=canonical({x:a.x+lo*dx,y:a.y+lo*dy}),end=canonical({x:a.x+hi*dx,y:a.y+hi*dy});
    if(equal(start,end))continue;
    const startCoordinate=lo===0?coordinates[i-1]:unproject(start);
    const endCoordinate=hi===1?coordinates[i]:unproject(end);
    if(!path||!last||!equal(last,start)){path=[startCoordinate];paths.push(path);}
    path.push(endCoordinate);last=end;
  }
  return paths;
}

// Clipping creates tile seams, not physical junctions or tunnel portals. Join
// unambiguous continuations before vertical fitting so a short tile fragment
// cannot invent a separate depth/chord for part of one continuous structure.
export function stitchVectorRoadElements(elements) {
  const ways=elements.filter(e=>e.type==='way'&&e.vectorRoadTile),byNode=new Map(),consumed=new Set(),replacement=new Map();
  const nodes=new Map(elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
  const keyFor=way=>Object.entries(way.tags).filter(([key])=>!key.startsWith('_')).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('|');
  const semantics=new Map(ways.map(w=>[w,keyFor(w)]));
  const boundary=(way,id)=>{
    const n=nodes.get(id),t=way.vectorRoadTile;if(!n)return false;
    const scale=2**t.z,x=(n.lon+180)/360*scale,y=(1-Math.asinh(Math.tan(n.lat*Math.PI/180))/Math.PI)/2*scale;
    return Math.min(Math.abs(x-t.x),Math.abs(x-t.x-1),Math.abs(y-t.y),Math.abs(y-t.y-1))<1e-7;
  };
  const bucketKey=(w,id)=>`${id}|${semantics.get(w)}`;
  for(const way of ways)for(const id of [way.nodes[0],way.nodes.at(-1)])if(boundary(way,id)){
    const key=bucketKey(way,id);if(!byNode.has(key))byNode.set(key,[]);byNode.get(key).push(way);
  }
  for(const first of [...ways].sort((a,b)=>String(a.tags._sourceFeatureId).localeCompare(String(b.tags._sourceFeatureId)))) {
    if(consumed.has(first))continue;consumed.add(first);
    const line=[...first.nodes],sources=[first.tags._sourceFeatureId];
    for(const atStart of [false,true]) {
      let current=first;
      for(;;){
        const id=atStart?line[0]:line.at(-1),candidates=byNode.get(bucketKey(current,id));
        if(candidates?.length!==2)break;
        const next=candidates.find(w=>w!==current);if(!next||consumed.has(next))break;
        const a=current.vectorRoadTile,b=next.vectorRoadTile;
        if(a.z!==b.z||(a.x===b.x&&a.y===b.y))break;
        const joinsAtStart=next.nodes[0]===id;
        const reversed=atStart?joinsAtStart:!joinsAtStart;
        if(reversed&&['yes','1','-1'].includes(String(next.tags.oneway)))break;
        const addition=reversed?[...next.nodes].reverse():next.nodes;
        if(atStart)line.unshift(...addition.slice(0,-1));else line.push(...addition.slice(1));
        sources.push(next.tags._sourceFeatureId);consumed.add(next);replacement.set(next,null);current=next;
      }
    }
    if(sources.length>1)replacement.set(first,{...first,nodes:line,sourceFragments:sources.sort()});
  }
  return elements.flatMap(e=>replacement.has(e)?replacement.get(e)?[replacement.get(e)]:[]:[e]);
}
