// Exact nearest-segment queries for a single immutable compilation snapshot.
// The cache is owned and disposed by terrain-corridor publication, never by a
// process-global map. Equal-distance ties retain original source order.
function lowerBound(node,x,z){
  return Math.hypot(Math.max(0,node.minX-x,x-node.maxX),Math.max(0,node.minZ-z,z-node.maxZ));
}
function visitProjection(node,x,z,best,stats){
  if(!node || (best.segIndex>=0 && lowerBound(node,x,z)>best.dist+1e-12))return;
  if(node.items){
    for(const s of node.items){
      if(stats)stats.segments=(stats.segments||0)+1;
      const t=Math.max(0,Math.min(1,((x-s.ax)*s.dx+(z-s.az)*s.dz)/s.len2));
      const px=s.ax+s.dx*t,pz=s.az+s.dz*t,dist=Math.hypot(x-px,z-pz);
      if(best.segIndex<0 || dist<best.dist || (dist===best.dist&&s.i<best.segIndex)){
        best.x=px;best.z=pz;best.dist=dist;best.segIndex=s.i;best.t=t;
      }
    }
    return;
  }
  const first=lowerBound(node.left,x,z)<=lowerBound(node.right,x,z)?node.left:node.right;
  visitProjection(first,x,z,best,stats);visitProjection(first===node.left?node.right:node.left,x,z,best,stats);
}
export function createFeatureProjectionIndex() {
  const features=new Map();
  function compile(points) {
    const segments=[];
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
      if(len2<=1e-9)continue;
      segments.push({i,ax:a.x,az:a.z,dx,dz,len2,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)});
    }
    function build(items) {
      if(!items.length)return null;
      const node={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
      for(const s of items){node.minX=Math.min(node.minX,s.minX);node.maxX=Math.max(node.maxX,s.maxX);node.minZ=Math.min(node.minZ,s.minZ);node.maxZ=Math.max(node.maxZ,s.maxZ);}
      if(items.length<=8){node.items=items;return node;}
      const axis=node.maxX-node.minX>=node.maxZ-node.minZ ? 'X' : 'Z';
      items.sort((a,b)=>(a['min'+axis]+a['max'+axis])-(b['min'+axis]+b['max'+axis]) || a.i-b.i);
      const middle=Math.floor(items.length/2);node.left=build(items.slice(0,middle));node.right=build(items.slice(middle));return node;
    }
    return build(segments);
  }
  return {
    project(feature,x,z,stats) {
      if(!feature?.pts?.length || !Number.isFinite(x)||!Number.isFinite(z))return null;
      let entry=features.get(feature);
      if(!entry || entry.points!==feature.pts) {entry={points:feature.pts,root:compile(feature.pts)};features.set(feature,entry);}
      const best={x:0,z:0,dist:Infinity,segIndex:-1,t:0};
      visitProjection(entry.root,x,z,best,stats);
      return best.segIndex>=0?best:null;
    },
    dispose(){features.clear();}
  };
}
