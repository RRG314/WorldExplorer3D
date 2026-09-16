function finite(value, fallback = 0) { const number=Number(value); return Number.isFinite(number)?number:fallback; }

export function buildingCenter(building) {
  if (Number.isFinite(building?.centerX) && Number.isFinite(building?.centerZ)) {
    return { x: building.centerX, z: building.centerZ };
  }
  const points = Array.isArray(building?.pts) ? building.pts : [];
  if (points.length) {
    return {
      x: points.reduce((sum, point) => sum + finite(point.x), 0) / points.length,
      z: points.reduce((sum, point) => sum + finite(point.z), 0) / points.length
    };
  }
  return {
    x: (finite(building?.minX) + finite(building?.maxX)) * 0.5,
    z: (finite(building?.minZ) + finite(building?.maxZ)) * 0.5
  };
}

// A max heap retains only the nearest unique IDs. Distance ties keep source
// order, matching the former stable full sort followed by deduplication.
export function nearestCaptureBuildingIds(buildings, actor, limit=60) {
  limit=Math.max(0,Math.floor(limit));
  if(!limit)return [];
  const heap=[],positions=new Map();
  const compare=(a,b)=>a.distance-b.distance || a.order-b.order;
  const swap=(a,b)=>{[heap[a],heap[b]]=[heap[b],heap[a]];positions.set(heap[a].id,a);positions.set(heap[b].id,b);};
  const down=start=>{
    let i=start;
    for(;;){let worst=i,left=i*2+1,right=left+1;
      if(left<heap.length&&compare(heap[left],heap[worst])>0)worst=left;
      if(right<heap.length&&compare(heap[right],heap[worst])>0)worst=right;
      if(worst===i)return;swap(i,worst);i=worst;
    }
  };
  for(let order=0;order<buildings.length;order++){
    const building=buildings[order];if(!building?.sourceBuildingId)continue;
    const id=String(building.sourceBuildingId),center=buildingCenter(building);
    const distance=Math.hypot(center.x-actor.x,center.z-actor.z);
    const existing=positions.get(id);
    if(existing!==undefined){
      if(distance<heap[existing].distance){heap[existing]={id,distance,order};down(existing);}
      continue;
    }
    if(heap.length===limit){
      if(distance>=heap[0].distance)continue;
      positions.delete(heap[0].id);heap[0]={id,distance,order};positions.set(id,0);down(0);
    }else{
      heap.push({id,distance,order});let i=heap.length-1;positions.set(id,i);
      while(i>0){const parent=(i-1)>>1;if(compare(heap[i],heap[parent])<=0)break;swap(i,parent);i=parent;}
    }
  }
  return heap.sort(compare).map(entry=>entry.id);
}
