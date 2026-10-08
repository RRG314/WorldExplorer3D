// Authored game viewpoints on the public west promenade. Coordinates describe
// the route, not museum entrances or permission to board a historic vessel.
export const HARBOR_WALK = Object.freeze({
  id: 'baltimore-inner-harbor-walk-v1',
  title: 'Inner Harbor: skyline to sailing ship',
  stops: Object.freeze([
    {id:'skyline',label:'Harbor skyline',lat:39.2857,lon:-76.6124},
    {id:'museum-view',label:'USS Constellation from the promenade',lat:39.2850,lon:-76.6124},
    {id:'waterfront',label:'South waterfront outlook',lat:39.2843,lon:-76.6126}
  ].map(Object.freeze))
});

export function buildHarborWalk(ctx) {
  if(!ctx.ENV?.EARTH || ctx.getEnv?.() !== ctx.ENV?.EARTH || !ctx.initialEarthWorldReady) return null;
  const loc=ctx.LOC,scale=Number(ctx.SCALE);
  if(!Number.isFinite(loc?.lat)||!Number.isFinite(loc?.lon)||!Number.isFinite(scale)||scale<=0)return null;
  if(Math.hypot((loc.lat-39.285)*111320,(loc.lon+76.6124)*86000)>1800)return null;
  const anchors=HARBOR_WALK.stops.map((p,index)=>{
    const x=(p.lon-loc.lon)*scale*Math.cos(loc.lat*Math.PI/180),z=(loc.lat-p.lat)*scale;
    const ground=ctx.SurfaceQuery?.walkAt(x,z,{currentY:0,sampleRenderedMesh:true});
    const y=Number(ground?.position?.y);
    if(!Number.isFinite(y)||ctx.isPointInsideWaterFootprint?.(x,z)===true)return null;
    if(ctx.checkBuildingCollision?.(x,z,.8,{actorBaseY:y,actorHeight:1.8})?.collision===true)return null;
    return {id:`harbor:${p.id}`,typeId:index===0?'start':index===2?'finish':'checkpoint',label:p.label,x,y,z,yaw:0,valid:true,environment:'walk'};
  });
  if(anchors.some(p=>!p))return null;
  // Check the whole short promenade route, not just valid endpoint islands.
  for(let i=1;i<anchors.length;i++){
    const a=anchors[i-1],b=anchors[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5);
    a.yaw=Math.atan2(b.x-a.x,b.z-a.z);
    for(let j=1;j<steps;j++){
      const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
      if(ctx.isPointInsideWaterFootprint?.(x,z)===true||ctx.checkBuildingCollision?.(x,z,.8,{actorBaseY:y,actorHeight:1.8})?.collision===true)return null;
    }
  }
  return {
    id:HARBOR_WALK.id,sourceType:'generated',subtype:'exploration',templateId:'walking_route',
    title:HARBOR_WALK.title,
    description:'Walk south along the west promenade. View the skyline, find the three-masted USS Constellation from shore, then reach the waterfront outlook. About 150 m; stay on foot. Museum boarding is separate.',
    locationLabel:'Baltimore · Inner Harbor',traversalMode:'walk',anchors,
    featured:true,featuredReason:'One short waterfront walk with three recognizable stops.',
    estimatedMinutes:3,difficulty:'easy',recommendedScore:110,requiresNearbyStart:true
  };
}
