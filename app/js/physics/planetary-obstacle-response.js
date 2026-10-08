import { queryPlanetaryObstacle } from '../planetary/runtime/obstacle-authority.js?v=1';
import { sampleSweptContact } from './swept-contact.js?v=1';

export function resolvePlanetaryVehicleObstacle(car, next, bodyId, radius = 2.1) {
  const contact=sampleSweptContact(car,next,.35,position=>queryPlanetaryObstacle(position.x,position.z,radius,bodyId,Number.isFinite(car.y)?{minY:car.y-.8,maxY:car.y+2}:null));
  if(!contact)return {...next,collision:false};
  const obstacle=contact.contact.obstacle;
  // A restored position inside an envelope must be able to move out.
  if(Math.hypot(car.x-obstacle.x,car.z-obstacle.z)<obstacle.radius+radius &&
    Math.hypot(next.x-obstacle.x,next.z-obstacle.z)>Math.hypot(car.x-obstacle.x,car.z-obstacle.z))return {...next,collision:false};
  return {x:contact.lastSafe.x,z:contact.lastSafe.z,collision:true};
}
