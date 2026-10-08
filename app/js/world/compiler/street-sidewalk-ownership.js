import {isGroundStreet,streetSideEdge} from './street-frontage-policy.js';
import {isPavementFootway} from './pavement-footway-policy.js';
import {streetRoadSegments} from './street-carriageway.js';
import {frontageHit} from './street-frontage-geometry.js';

// A pedestrian routing line is not a second curb. Associate only overlapping,
// nearly parallel ground-level segments. Missing subtype tags in generalized
// tiles are not evidence of a crossing or of a surveyed sidewalk width.
export function createStreetSidewalkOwnership(roads,features,frontages,scale) {
  const cell=64/scale,reach=10/scale,buckets=new Map(),masks=new Map(),paths=[];
  for(const road of roads) {
    if(!isGroundStreet(road))continue;
    for(const segment of streetRoadSegments(road)) {
      const pad=Math.max(segment.wa,segment.wb)/2+Math.abs(segment.offset)+reach;
      const b=segment.bounds;
      for(let x=Math.floor((b.minX-pad)/cell);x<=Math.floor((b.maxX+pad)/cell);x++)
        for(let z=Math.floor((b.minZ-pad)/cell);z<=Math.floor((b.maxZ+pad)/cell);z++) {
          const key=`${x}:${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(segment);
        }
    }
  }
  for(const feature of features) {
    if(!isPavementFootway(feature))continue;
    for(let i=1;i<feature.pts.length;i++) {
      const a=feature.pts[i-1],b=feature.pts[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      if(length<1e-6)continue;
      const candidates=new Set(),cuts=new Set([0,1]),matches=[];
      for(let x=Math.floor(Math.min(a.x,b.x)/cell);x<=Math.floor(Math.max(a.x,b.x)/cell);x++)
        for(let z=Math.floor(Math.min(a.z,b.z)/cell);z<=Math.floor(Math.max(a.z,b.z)/cell);z++)
          for(const s of buckets.get(`${x}:${z}`)||[])candidates.add(s);
      for(const s of candidates) {
        const rx=s.b.x-s.a.x,rz=s.b.z-s.a.z,rl=Math.hypot(rx,rz),ux=rx/rl,uz=rz/rl;
        const dot=(dx*ux+dz*uz)/length;
        if(Math.abs(dot)<Math.cos(Math.PI/12))continue;
        const along=(a.x-s.a.x)*ux+(a.z-s.a.z)*uz,span=dx*ux+dz*uz;
        const p=-along/span,q=(rl-along)/span,start=Math.max(0,Math.min(p,q)),end=Math.min(1,Math.max(p,q));
        if((end-start)*length<1/scale)continue;
        const t=(start+end)/2,x=a.x+dx*t,z=a.z+dz*t;
        const normal={x:uz,z:-ux},signed=(x-s.a.x)*normal.x+(z-s.a.z)*normal.z,sign=Math.sign(signed);
        const roadT=Math.max(0,Math.min(1,(along+span*t)/rl));
        const edge=streetSideEdge(s.road,(s.wa+(s.wb-s.wa)*roadT)/2,sign);
        const gap=Math.abs(signed)-edge-feature.width/2;
        if(!sign||gap<-.5/scale||gap>8/scale)continue;
        const facade=frontageHit({x,z},normal.x*sign,normal.z*sign,frontages.query({x,z},undefined,7/scale),feature.width/2,7/scale);
        const side=frontages.section(s.road,s.index)[sign>0?'left':'right'];
        const inferredSide=side.source==='inferred-urban-road';
        // A distant park path is not a sidewalk merely because it runs along
        // a road. Require a nearby frontage, explicit subtype or close curb.
        if(feature.subtype!=='sidewalk'&&gap>1.25/scale&&!inferredSide&&(!facade||facade.distance>7/scale))continue;
        const connectCurb=inferredSide;
        matches.push({s,start,end,gap,sign,normal,ux,uz,rl,along,span,connectCurb,side});cuts.add(start);cuts.add(end);
      }
      const ts=[...cuts].sort((a,b)=>a-b),at=t=>({x:a.x+dx*t,z:a.z+dz*t});
      for(let j=1;j<ts.length;j++) {
        const start=ts[j-1],end=ts[j],mid=(start+end)/2;
        const match=matches.filter(m=>mid>=m.start&&mid<=m.end).sort((a,b)=>a.gap-b.gap)[0];
        const path={a:at(start),b:at(end),width:feature.width,frontageEligible:feature.subtype==='sidewalk'||!!match,feature};
        paths.push(path);
        if(!match)continue;
        const {s,sign,normal,ux,uz,rl,along,span}=match;
        const lo=Math.max(0,Math.min(rl,along+span*start)),hi=Math.max(0,Math.min(rl,along+span*end));
        const p={x:s.a.x+ux*lo,z:s.a.z+uz*lo},q={x:s.a.x+ux*hi,z:s.a.z+uz*hi};
        if(match.connectCurb)path.curbConnection=[[[p.x,p.z],[q.x,q.z],[path.b.x,path.b.z],[path.a.x,path.a.z],[p.x,p.z]]];
        // This mask applies ONLY to this road's inferred sidewalk. The mapped
        // path, road geometry and other road owners are never removed by it.
        const depth=Math.max(s.wa,s.wb)/2+Math.abs(s.offset)+(Math.max(7,match.side.widthMeters||0)+.01)/scale;
        const ring=[[p.x,p.z],[q.x,q.z],[q.x+normal.x*sign*depth,q.z+normal.z*sign*depth],[p.x+normal.x*sign*depth,p.z+normal.z*sign*depth],[p.x,p.z]];
        if(!masks.has(s.road))masks.set(s.road,[]);masks.get(s.road).push([ring]);
      }
    }
  }
  return {paths,masks};
}
