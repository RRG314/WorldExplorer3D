// Chassis geometry only. Existing actor owners decide motion and impacts.
export function vehicleFootprint(pose, variant = {}, padding = 0) {
  const yaw = Number(pose.yaw || 0);
  return { x: pose.x, y: Number(pose.y || 0), z: pose.z,
    sx: Math.cos(yaw), sz: -Math.sin(yaw), fx: Math.sin(yaw), fz: Math.cos(yaw),
    width: Math.max(.1, Number(variant.width || 1.8) * .5) + padding,
    length: Math.max(.1, Number(variant.length || 4.5) * .5) + padding,
    height: Number(variant.height || 1.5) };
}
function radius(a,b,x,z) {
  return a.width*Math.abs(a.sx*x+a.sz*z)+a.length*Math.abs(a.fx*x+a.fz*z)+
    b.width*Math.abs(b.sx*x+b.sz*z)+b.length*Math.abs(b.fx*x+b.fz*z);
}
function separation(a,b) {
  let gap=-Infinity;
  for(let i=0;i<4;i++) {
    const x=i===0?a.sx:i===1?a.fx:i===2?b.sx:b.fx,z=i===0?a.sz:i===1?a.fz:i===2?b.sz:b.fz;
    gap=Math.max(gap,Math.abs((b.x-a.x)*x+(b.z-a.z)*z)-radius(a,b,x,z));
  }
  return gap;
}
export function translatedChassisContact(a,b,dx,dz) {
  if(a.y+a.height+.2<=b.y || b.y+b.height+.2<=a.y)return 1;
  if(Math.hypot(b.x-a.x,b.z-a.z)>a.length+b.length+a.width+b.width+Math.hypot(dx,dz))return 1;
  const overlap=separation(a,b);
  if(overlap<0 && separation({...a,x:a.x+dx,z:a.z+dz},b)>=overlap-1e-7)return 1;
  let enter=-Infinity,exit=Infinity;
  for(let i=0;i<4;i++){
    const x=i===0?a.sx:i===1?a.fx:i===2?b.sx:b.fx,z=i===0?a.sz:i===1?a.fz:i===2?b.sz:b.fz;
    const d=(b.x-a.x)*x+(b.z-a.z)*z,travel=dx*x+dz*z,r=radius(a,b,x,z);
    if(Math.abs(travel)<1e-9){if(Math.abs(d)>=r)return 1;continue;}
    const t1=(d-r)/travel,t2=(d+r)/travel;
    enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));
    if(enter>=exit)return 1;
  }
  if(exit<=0||enter>=1)return 1;
  return Math.max(0,enter-.02/Math.max(.02,Math.hypot(dx,dz)));
}
export function sweptChassisContact(from,to,variant,target,targetVariant,padding=0) {
  const yaw=Number(from.yaw||0),turn=Math.atan2(Math.sin(Number(to.yaw||0)-yaw),Math.cos(Number(to.yaw||0)-yaw));
  const obstacle=vehicleFootprint(target,targetVariant,padding);
  if(Math.abs(turn)<1e-8)return translatedChassisContact(vehicleFootprint(from,variant,padding),obstacle,to.x-from.x,to.z-from.z);
  const start=vehicleFootprint(from,variant,padding),end=vehicleFootprint(to,variant,padding);
  if(separation(start,obstacle)<0 && separation(end,obstacle)>separation(start,obstacle)+1e-6)return 1;
  const steps=Math.ceil(Math.abs(turn)/(Math.PI/90));
  const arcPadding=Math.hypot(start.width,start.length)*Math.sin(Math.abs(turn)/steps*.5);
  for(let i=0;i<steps;i++){
    const t=i/steps;
    const pose={x:from.x+(to.x-from.x)*t,y:from.y,z:from.z+(to.z-from.z)*t,yaw:yaw+turn*(t+.5/steps)};
    const box=vehicleFootprint(pose,variant,padding+arcPadding);
    const hit=translatedChassisContact(box,obstacle,(to.x-from.x)/steps,(to.z-from.z)/steps);
    // The padded midpoint box also covers rotation with zero translation.
    if(separation(box,obstacle)<0)return i/steps;
    if(hit<1)return (i+hit)/steps;
  }
  return 1;
}
