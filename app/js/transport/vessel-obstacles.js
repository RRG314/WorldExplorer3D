import {pointInPolygonXZ} from '../structure-semantics/geometry.js?v=2';

function crosses(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return abC*abD<=0 && cdA*cdB<=0 &&
    Math.max(a.x,b.x)>=Math.min(c.x,d.x) && Math.max(c.x,d.x)>=Math.min(a.x,b.x) &&
    Math.max(a.z,b.z)>=Math.min(c.z,d.z) && Math.max(c.z,d.z)>=Math.min(a.z,b.z);
}

export function vesselOverlapsObstacle(corners, building) {
  const points=building?.pts?.length>=3?building.pts:[
    {x:building.minX,z:building.minZ},{x:building.maxX,z:building.minZ},
    {x:building.maxX,z:building.maxZ},{x:building.minX,z:building.maxZ}
  ];
  if(points.some(p=>pointInPolygonXZ(p.x,p.z,corners)) || corners.some(p=>pointInPolygonXZ(p.x,p.z,points)))return true;
  for(let i=0;i<4;i++)for(let j=0;j<points.length;j++)
    if(crosses(corners[i],corners[(i+1)%4],points[j],points[(j+1)%points.length]))return true;
  return false;
}

// Water polygons can extend beneath buildings, piers and bridges. Query the
// existing collision authority as well, using its vertical clearance and a
// rectangle narrow phase, rather than nine unconnected point samples.
export function vesselObstacleAdmission(ctx, catalog, x, z, yaw, surfaceY) {
  if(ctx.getEnv?.()==='OCEAN' || ctx.oceanMode?.active || typeof ctx.checkBuildingCollision!=='function')return {allowed:true};
  if(![x,z,yaw,surfaceY].every(Number.isFinite))return {allowed:false,reason:'The vessel’s clearance is still loading.'};
  const scale=Math.max(1,1/(Number(ctx.METERS_PER_WORLD_UNIT)||1));
  const halfWidth=catalog.dimensions.width*.5*scale,halfLength=catalog.dimensions.length*.5*scale;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const corners=[[-halfWidth,-halfLength],[halfWidth,-halfLength],[halfWidth,halfLength],[-halfWidth,halfLength]]
    .map(([side,forward])=>({x:x+c*side+s*forward,z:z-s*side+c*forward}));
  const result=ctx.checkBuildingCollision(x,z,Math.hypot(halfWidth,halfLength),{
    actorBaseY:surfaceY-catalog.dimensions.draft*scale,
    actorHeight:(catalog.dimensions.height+catalog.dimensions.draft)*scale,
    acceptCollision:hit=>vesselOverlapsObstacle(corners,hit.building)
  });
  return result?.collision ? {allowed:false,reason:'There is not enough clearance for this vessel beside the structure.',obstacleId:result.building?.sourceBuildingId||null} : {allowed:true};
}
