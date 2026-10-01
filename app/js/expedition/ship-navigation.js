import {createBuildingCollisionQuery} from '../physics/building-collision.js?v=5';

// Static, furnished deck geometry. Doors are routeable because they can be
// opened, but walls, equipment and the pressure hull remain obstacles.
const cache = new WeakMap();
export function createShipNavigation(colliders, radius = 32) {
  if (cache.has(colliders)) return cache.get(colliders);
  const step = .4, n = Math.ceil(radius * 2 / step) + 1;
  const blocked = new Uint8Array(n * n);
  const point = i => ({x: (i % n) * step - radius, z: Math.floor(i / n) * step - radius});
  const index = p => Math.round((p.z + radius) / step) * n + Math.round((p.x + radius) / step);
  for (let i = 0; i < blocked.length; i++) {
    const p = point(i); if (Math.hypot(p.x, p.z) > radius - .5) blocked[i] = 1;
  }
  for (const collider of colliders) {
    const hit = createBuildingCollisionQuery({dynamicBuildingColliders: [collider]});
    const loX = Math.max(0, Math.floor((collider.minX + radius - .5) / step));
    const hiX = Math.min(n - 1, Math.ceil((collider.maxX + radius + .5) / step));
    const loZ = Math.max(0, Math.floor((collider.minZ + radius - .5) / step));
    const hiZ = Math.min(n - 1, Math.ceil((collider.maxZ + radius + .5) / step));
    for (let z = loZ; z <= hiZ; z++) for (let x = loX; x <= hiX; x++) {
      const i = z * n + x, p = point(i);
      if (!blocked[i] && hit(p.x, p.z, .45, {actorBaseY: 0, actorHeight: 1.8}).collision) blocked[i] = 1;
    }
  }
  const components=new Int32Array(n*n);let componentId=0;
  for(let seed=0;seed<blocked.length;seed++)if(!blocked[seed]&&!components[seed]){
    const queue=[seed];components[seed]=++componentId;
    for(let k=0;k<queue.length;k++)for(const j of [queue[k]-1,queue[k]+1,queue[k]-n,queue[k]+n]){
      if(j<0||j>=blocked.length||blocked[j]||components[j]||Math.abs(j%n-queue[k]%n)>1)continue;
      components[j]=componentId;queue.push(j);
    }
  }
  const collision = createBuildingCollisionQuery({dynamicBuildingColliders: colliders});
  const clear = (a, b) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1));
    for (let k = 0; k <= count; k++) if (collision(a.x + (b.x-a.x)*k/count, a.z + (b.z-a.z)*k/count, .28 + .12 * Math.min(1,k / 3), {actorBaseY:0,actorHeight:1.8}).collision) return false;
    return true;
  };
  const fields=new Map();
  function route(from, to, targetRadius = 2.1) {
    let start = index(from);
    if (blocked[start] || !clear(from, point(start))) {
      const candidates = [];
      for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
        const i=start+dz*n+dx;if(i>=0&&i<blocked.length&&!blocked[i])candidates.push(i);
      }
      start=candidates.sort((a,b)=>Math.hypot(point(a).x-from.x,point(a).z-from.z)-Math.hypot(point(b).x-from.x,point(b).z-from.z)).find(i=>clear(from,point(i)));
      if(start===undefined)return [];
    }
    const key=[to.x,to.z,targetRadius,components[start]].join(':');
    let field=fields.get(key);
    if(!field){
      let goal=-1,best=targetRadius;
      for(let i=0;i<blocked.length;i++)if(!blocked[i]&&components[i]===components[start]){const p=point(i),d=Math.hypot(p.x-to.x,p.z-to.z);if(d<best){best=d;goal=i;}}
      if(goal<0)return [];
      const next=new Int32Array(n*n).fill(-1),queue=[goal];next[goal]=goal;
      for(let k=0;k<queue.length;k++){
        const i=queue[k];
        for(const j of [i-1,i+1,i-n,i+n]){
          if(j<0||j>=blocked.length||blocked[j]||next[j]!==-1||Math.abs(j%n-i%n)>1)continue;
          next[j]=i;queue.push(j);
        }
      }
      field={goal,next};if(fields.size>=32)fields.delete(fields.keys().next().value);fields.set(key,field);
    }
    if(field.next[start]===-1)return [];
    const steps=[];for(let i=start;i!==field.goal;){i=field.next[i];steps.push(point(i));}
    const raw=[from,point(start),...steps];
    // Collapse only collinear grid steps, then test shortcuts against the
    // same polygon collision authority as walking (no corner cutting).
    const corners=raw.filter((p,i)=>i===0||i===raw.length-1||Math.abs((p.x-raw[i-1].x)*(raw[i+1].z-p.z)-(p.z-raw[i-1].z)*(raw[i+1].x-p.x))>.001);
    const result=[corners[0]];
    for(let i=0;i<corners.length-1;){let j=i+1;while(j+1<corners.length&&clear(corners[i],corners[j+1]))j++;result.push(corners[j]);i=j;}
    return result;
  }
  const navigation={route,clear};cache.set(colliders,navigation);return navigation;
}

export function shipDoorwayOccupied(collider, actors) {
  const collision=createBuildingCollisionQuery({dynamicBuildingColliders:[collider]});
  return actors.some(actor=>actor&&collision(actor.x,actor.z,.4,{actorBaseY:0,actorHeight:1.9}).collision);
}
