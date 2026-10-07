import {getMaritimeCatalogEntry} from '../transport/maritime-catalog.js?v=1';
import {createVesselVisual} from '../transport/vessel-visual-recipe.js?v=8';
import {vesselWaterSamples,fitVesselWaterPlane} from '../boat-mode/water-contact.js';
import {stepBoatSpring} from '../boat-mode/dynamics.js?v=1';
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
 const catalog=getMaritimeCatalogEntry(ship.transportCatalogId);
 const visual=createVesselVisual(THREE,catalog,{state:'ambient'});
 visual.root.name='Expedition parent vessel';visual.root.userData.transportEntityId=ship.transportEntityId;
 visual.root.rotation.order='YXZ';visual.root.rotation.y=ship.yaw;mode.scene.add(visual.root);
 // The same vessel must displace the same footprint above and below water.
 // A single crest sample made the retained carrier bounce like a point buoy
 // after diving, although its surface-mode owner fits a vessel-sized plane.
 const samples=vesselWaterSamples(catalog.dimensions).map(point=>({...point,height:0}));
 const sin=Math.sin(ship.yaw),cos=Math.cos(ship.yaw);
 let previousTime=null,disposed=false;
 let heave={value:0,velocity:0},pitch={value:0,velocity:0},roll={value:0,velocity:0};
 return {root:visual.root,update(time){
  if(disposed||!Number.isFinite(time))return;
  for(const point of samples){
   point.height=mode.waterSurface.sample(sin*point.forward+cos*point.side,cos*point.forward-sin*point.side,{time}).surfaceY;
  }
  const plane=fitVesselWaterPlane(samples);if(!plane)return;
  const dt=previousTime===null?0:Math.min(.05,Math.max(0,time-previousTime));previousTime=time;
  const bounded=value=>Math.max(-.5,Math.min(.5,value));
  heave=stepBoatSpring(heave.value,heave.velocity,plane.height,dt,13.4,4.6,8.2);
  pitch=stepBoatSpring(pitch.value,pitch.velocity,bounded(plane.pitch),dt,13.4,4.1,2.1);
  roll=stepBoatSpring(roll.value,roll.velocity,bounded(plane.roll),dt,10.6,3.4,1.8);
  visual.root.position.y=heave.value;
  visual.root.rotation.set(pitch.value,ship.yaw,roll.value,'YXZ');
 },dispose(){if(disposed)return;disposed=true;visual.root.parent?.remove(visual.root);visual.dispose();}};
}
