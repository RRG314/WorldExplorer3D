// Predict in world coordinates; location names, elevation and compass labels
// do not affect the policy. Keep the next window overlapping the current actor.
export function streetMotion(previous, point, now, sequence) {
  let vx=0,vz=0;
  const seconds=(now-(previous?.time ?? now))/1000;
  if(previous?.sequence===sequence && seconds>=.05 && seconds<=2){
    vx=(point.x-previous.x)/seconds;vz=(point.z-previous.z)/seconds;
    // A teleport is a new arrival, not a velocity to extrapolate.
    if(Math.hypot(vx,vz)>200){vx=0;vz=0;}
  }
  return {x:point.x,z:point.z,time:now,sequence,vx,vz};
}

export function streetPrefetch(point, motion, bounds, buildMs=0) {
  const seconds=Math.min(20,Math.max(1,Number(buildMs)/1000 || 1))+2;
  const vx=motion?.vx || 0,vz=motion?.vz || 0;
  const speed=Math.hypot(vx,vz),travel=speed*seconds;
  const scale=travel>0?Math.min(192,travel)/travel:0;
  const focus={x:point.x+vx*seconds*scale,z:point.z+vz*seconds*scale};
  const lead=Math.min(320,Math.max(128,travel));
  const minX=bounds?.minX+128,maxX=bounds?.maxX-128,minZ=bounds?.minZ+128,maxZ=bounds?.maxZ-128;
  const inside=!!bounds && point.x>minX&&point.x<maxX&&point.z>minZ&&point.z<maxZ;
  const leadX=Math.min(320,Math.max(128,Math.abs(vx)*seconds));
  const leadZ=Math.min(320,Math.max(128,Math.abs(vz)*seconds));
  const approaching=!!bounds && ((vx>0&&point.x+leadX>=bounds.maxX)||(vx<0&&point.x-leadX<=bounds.minX)||
    (vz>0&&point.z+leadZ>=bounds.maxZ)||(vz<0&&point.z-leadZ<=bounds.minZ));
  return {focus,needsBuild:!inside||approaching,leadWorldUnits:lead};
}
