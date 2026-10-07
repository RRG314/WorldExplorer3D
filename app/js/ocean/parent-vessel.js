import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
import {createVesselVisual} from '../transport/vessel-visual-recipe.js?v=8';
// A stern deployment must face away from the carrier. Keep the parent's
// heading independent of the submarine so turning the sub cannot rotate it.
export function parentVesselSubmarinePose(ship, y=-8.5) {
 const yaw=Number.isFinite(ship?.yaw)?ship.yaw:0;
 const distance=getMaritimeCatalogEntry(ship?.transportCatalogId).dimensions.length/2+12;
 return {x:-Math.sin(yaw)*distance,y,z:-Math.cos(yaw)*distance,yaw:yaw+Math.PI};
}
export function parentHullCollision(ship,point,radius=1,surfaceY=.08){
 if(!ship||!point)return false;
 const catalog=getMaritimeCatalogEntry(ship.transportCatalogId),c=Math.cos(ship.yaw),s=Math.sin(ship.yaw);
 const x=c*point.x-s*point.z,z=s*point.x+c*point.z;
 return Math.abs(x)<catalog.dimensions.width/2+radius&&Math.abs(z)<catalog.dimensions.length/2+radius&&point.y+radius>surfaceY-catalog.dimensions.draft&&point.y-radius<surfaceY+1;
}
export function createOceanParentVessel(THREE,mode,voyage){
 const ship=voyage.current?.ship;if(!ship)return null;
 const visual=createVesselVisual(THREE,getMaritimeCatalogEntry(ship.transportCatalogId),{state:'ambient'});
 visual.root.name='Expedition parent vessel';visual.root.userData.transportEntityId=ship.transportEntityId;
 visual.root.rotation.y=ship.yaw;mode.scene.add(visual.root);
 return {root:visual.root,update(time){visual.root.position.y=mode.waterSurface.sample(0,0,{time}).surfaceY;},dispose(){visual.root.parent?.remove(visual.root);visual.dispose();}};
}
