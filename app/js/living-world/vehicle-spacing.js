// Swept, oriented chassis footprints for the existing 30 Hz traffic owner.
// This is a movement constraint, not another physics clock or actor store.
function box(agent, pose) {
  const yaw=Number(pose.yaw||0),v=agent.variant||pose.variant||{};
  return {agent,speed:Number(agent.currentSpeed??agent.speed??0),x:pose.x,y:Number(pose.y||0),z:pose.z,
    sx:Math.cos(yaw),sz:-Math.sin(yaw),fx:Math.sin(yaw),fz:Math.cos(yaw),
    width:Math.max(.4,Number(v.width||1.8)*.5)+.15,
    length:Math.max(.8,Number(v.length||4.5)*.5)+.2,height:Number(v.height||1.5)};
}
function contactFraction(a,b,dx,dz) {
  if(Math.abs(a.y-b.y)>Math.max(a.height,b.height)+.6)return 1;
  const rx=b.x-a.x,rz=b.z-a.z;
  if(Math.hypot(rx,rz)>a.length+b.length+a.width+b.width+Math.hypot(dx,dz))return 1;
  let enter=-Infinity,exit=Infinity;
  for(let axis=0;axis<4;axis++){
    const x=axis===0?a.sx:axis===1?a.fx:axis===2?b.sx:b.fx;
    const z=axis===0?a.sz:axis===1?a.fz:axis===2?b.sz:b.fz;
    const d=rx*x+rz*z,travel=dx*x+dz*z;
    const radius=a.width*Math.abs(a.sx*x+a.sz*z)+a.length*Math.abs(a.fx*x+a.fz*z)+
      b.width*Math.abs(b.sx*x+b.sz*z)+b.length*Math.abs(b.fx*x+b.fz*z);
    if(Math.abs(travel)<1e-9){if(Math.abs(d)>=radius)return 1;continue;}
    const t1=(d-radius)/travel,t2=(d+radius)/travel;
    enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
    if(enter>=exit)return 1;
  }
  if(exit<=0||enter>=1)return 1;
  // Existing contact may separate, but cannot be driven deeper into another car.
  if(enter<0&&Math.hypot(rx-dx,rz-dz)>Math.hypot(rx,rz)+1e-6)return 1;
  return Math.max(0,enter-.02/Math.max(.02,Math.hypot(dx,dz)));
}
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
    update(agent,pose){if(pose)entries.set(agent,box(agent,pose));}
  };
}
export function vehicleFollowingGap(follower,leader,speed=0){
  return (Number(follower?.variant?.length||4.5)+Number(leader?.variant?.length||4.5))*.5+1.1+Math.max(0,speed)*.85;
}
