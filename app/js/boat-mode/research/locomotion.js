// Ship-local movement. A single motor owns grounded steps and airborne motion;
// the visual camera must never change the collision pose to smooth stairs.
export function createResearchLocomotion(navigation, initial) {
 let pose={...initial,pitch:Number(initial.pitch)||0},velocityY=0,grounded=true,jumpHeld=false;
 function look(yaw,pitch){
  if(Number.isFinite(yaw))pose.yaw=Math.atan2(Math.sin(pose.yaw+yaw),Math.cos(pose.yaw+yaw));
  if(Number.isFinite(pitch))pose.pitch=Math.max(-1.2,Math.min(1.2,pose.pitch+pitch));
 }
 function update(dt,actions={}) {
  const duration=Math.min(.05,Math.max(0,Number(dt)||0));
  if(!duration)return snapshot();
  const jump=Number(actions.jump)>0;
  if(jump&&!jumpHeld&&grounded){velocityY=4.4;grounded=false;}
  jumpHeld=jump;
  const steps=Math.max(1,Math.ceil(duration/(1/120))),step=duration/steps;
  let moved=0;
  for(let i=0;i<steps;i++){
   look(((Number(actions.turn)||0)+(Number(actions.lookYaw)||0))*2*step,(Number(actions.lookPitch)||0)*2*step);
   const forward=Number(actions.move)||0,side=Number(actions.strafe)||0;
   const speed=(Number(actions.sprint)>0?3.8:2.2)*step/Math.max(1,Math.hypot(forward,side));
   const dx=(Math.sin(pose.yaw)*forward-Math.cos(pose.yaw)*side)*speed;
   const dz=(Math.cos(pose.yaw)*forward+Math.sin(pose.yaw)*side)*speed;
   const previous=pose;
   pose=grounded?navigation.move(pose,dx,dz):navigation.moveAir(pose,dx,dz);
   moved+=Math.hypot(pose.x-previous.x,pose.z-previous.z);
   if(!grounded){
    velocityY-=9.81*step;
    const vertical=navigation.vertical(pose,pose.y+velocityY*step);
    pose.y=vertical.y;
    if(vertical.ceiling)velocityY=Math.min(0,velocityY);
    if(vertical.grounded){grounded=true;velocityY=0;}
   }
  }
  return {...snapshot(),moving:moved/duration>.05,running:Number(actions.sprint)>0&&moved/duration>2.3};
 }
 const snapshot=()=>({pose:{...pose},grounded,velocityY});
 return {update,snapshot,look};
}

// Exponential step filtering is frame-rate independent. Keep collision and
// station distances at the actual foot height; only the view follows smoothly.
export function researchCameraHeight(previous,target,dt) {
 if(!Number.isFinite(previous)||Math.abs(target-previous)>2)return target;
 return previous+(target-previous)*(1-Math.exp(-14*Math.min(.05,Math.max(0,dt))));
}
