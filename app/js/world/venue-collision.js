// Door admission retains the mapped building identity/footprint. A reviewed
// exterior transfers physical collision to its actual component volumes; it
// must not leave the original estimated solid box inside the new architecture.
export function venueComponentCollider(id,pts,bottom,top){
 return {pts,minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minZ:Math.min(...pts.map(p=>p.z)),maxZ:Math.max(...pts.map(p=>p.z)),baseY:bottom,minY:bottom,maxY:top,height:top-bottom,sourceBuildingId:id,geometrySource:'compiled_transport_structures',collisionKind:'solid'};
}
export function replaceVenueCollision(ctx,buildings,components){
 if(!ctx.dynamicBuildingColliders||!components.length)return;
 for(const building of buildings)building.collisionReplacedByVenue=true;
 ctx.dynamicBuildingColliders.push(...components);
}
