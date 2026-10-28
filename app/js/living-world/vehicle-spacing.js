import {vehicleFootprint,translatedChassisContact,sweptChassisContact} from '../engine/vehicle-footprint.js';
// Swept chassis constraints for the existing 30 Hz population owner.
function box(agent,pose) {
  return {...vehicleFootprint(pose,agent.variant||pose.variant,.2),agent,pose,
    speed:Number(agent.currentSpeed??agent.speed??0)};
}
const contactFraction=translatedChassisContact;
export function createVehicleSpacing(agents, poseOf, obstacles=[]) {
  const entries=new Map();
  for(const agent of agents){if(agent.promoted&&!agent.detailPromoted)continue;const pose=poseOf(agent);if(pose)entries.set(agent,box(agent,pose));}
  for(const obstacle of obstacles){if(obstacle&&Number.isFinite(obstacle.x)&&Number.isFinite(obstacle.z))entries.set(obstacle,box(obstacle,obstacle));}
  return {
    limit(agent,dx,dz){
      const current=entries.get(agent);if(!current)return 1;
      let fraction=1;
      for(const other of entries.values())if(other.agent!==agent){
        fraction=Math.min(fraction,contactFraction(current,other,dx,dz));
        // Yield upstream at crossing approaches, before both chassis reach a
        // mutual blocking position. Stable priority is independent of frame rate.
        if(other.speed>.2&&String(agent.id)>String(other.agent.id)&&Math.abs(current.fx*other.fx+current.fz*other.fz)<.65){
          const horizon=1.4,scale=horizon/(1/30);
          if(contactFraction(current,other,dx*scale-other.fx*other.speed*horizon,dz*scale-other.fz*other.speed*horizon)<1)fraction=0;
        }
      }
      return fraction;
    },
    allowsPose(agent,pose){
      const current=entries.get(agent);if(!current||!pose)return true;
      for(const other of entries.values())if(other.agent!==agent &&
        sweptChassisContact(current.pose,pose,agent.variant,other.pose,other.agent.variant,.2)<1)return false;
      return true;
    },
    update(agent,pose){if(pose)entries.set(agent,box(agent,pose));}
  };
}
export function vehicleFollowingGap(follower,leader,speed=0){
  return (Number(follower?.variant?.length||4.5)+Number(leader?.variant?.length||4.5))*.5+1.1+Math.max(0,speed)*.85;
}
