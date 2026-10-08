// Test driver only: uses ordinary keyboard input and observes the live actor.
// Never imported by gameplay. Route planning happens before timed windows.
export function planRoadRoute(roads) {
  const nodes=new Map();
  const node=p=>{const key=`${Math.round(p.x)}:${Math.round(p.z)}`;if(!nodes.has(key))nodes.set(key,{x:p.x,z:p.z,edges:[]});return nodes.get(key);};
  for(const road of roads){
    if(road.driveable===false||road.width<6||!road.pts)continue;
    for(let i=1;i<road.pts.length;i++){
      const a=road.pts[i-1],b=road.pts[i];
      if(Math.max(Math.abs(a.x),Math.abs(a.z),Math.abs(b.x),Math.abs(b.z))>1800)continue;
      const distance=Math.hypot(b.x-a.x,b.z-a.z);if(distance<1)continue;
      const na=node(a),nb=node(b);na.edges.push({node:nb,distance});nb.edges.push({node:na,distance});
    }
  }
  const starts=[...nodes.values()].sort((a,b)=>Math.hypot(a.x+128,a.z-82)-Math.hypot(b.x+128,b.z-82)).slice(0,12);
  let best=null;
  for(const start of starts)for(const first of start.edges){
    const points=[start,first.node],visited=new Set([start,first.node]);let length=first.distance;
    while(length<2200){
      const current=points.at(-1),previous=points.at(-2),dx=current.x-previous.x,dz=current.z-previous.z;
      const next=current.edges.filter(e=>!visited.has(e.node)).sort((a,b)=>{
        const score=e=>(dx*(e.node.x-current.x)+dz*(e.node.z-current.z))/(Math.hypot(dx,dz)*e.distance)+Math.min(e.distance,100)/1000;
        return score(b)-score(a);
      })[0];
      if(!next)break;visited.add(next.node);points.push(next.node);length+=next.distance;
    }
    if(!best||length>best.length)best={length,points:points.map(({x,z})=>({x,z}))};
  }
  if(!best||best.length<500)throw Error('No connected 500-unit driving route found');
  return best;
}

export async function followRoadRoute(page,route,signal,{mode='drive'}={}) {
  const points=route.points,held=new Set(),samples=[];let segment=0,progress=0,completedLength=0;
  const setKey=async(key,down)=>{if(down===held.has(key))return;if(down){await page.keyboard.down(key);held.add(key);}else{await page.keyboard.up(key);held.delete(key);}};
  try{
    while(!signal.stopped){
      const pose=await page.evaluate(walking=>{const a=globalThis.__WE3D_TRAVEL_ACTOR__;return {x:a.x,z:a.z,angle:walking?a.yaw:a.angle,speed:walking?Math.hypot(a.vx||0,a.vz||0):a.speed,yawRate:a.yawRate,at:performance.now()};},mode==='walk');
      if(![pose.x,pose.z,pose.angle,pose.speed].every(Number.isFinite))throw Error('Travel driver received an invalid actor pose');
      let a=points[segment],b=points[segment+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
      let t=((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(length*length);
      while((t>=1||Math.hypot(pose.x-b.x,pose.z-b.z)<3)&&segment<points.length-2){
        completedLength+=length;segment++;a=points[segment];b=points[segment+1];dx=b.x-a.x;dz=b.z-a.z;length=Math.hypot(dx,dz);t=((pose.x-a.x)*dx+(pose.z-a.z)*dz)/(length*length);
      }
      progress=Math.max(progress,completedLength+Math.max(0,Math.min(1,t))*length);
      let look=Math.max(6,Math.abs(pose.speed)*.35),targetT=Math.min(1,Math.max(0,t)+look/length);
      let target={x:a.x+dx*targetT,z:a.z+dz*targetT};
      const targetAngle=Math.atan2(target.x-pose.x,target.z-pose.z);
      const error=Math.atan2(Math.sin(targetAngle-pose.angle),Math.cos(targetAngle-pose.angle));
      const correction=error-(pose.yawRate||0)*.18;
      const complete=segment===points.length-2&&Math.hypot(pose.x-b.x,pose.z-b.z)<5;
      const walking=mode==='walk',targetSpeed=Math.abs(error)>.4?12:24;
      await setKey('w',!complete&&(walking?Math.abs(error)<1:pose.speed<targetSpeed));
      await setKey('s',!walking&&!complete&&pose.speed>targetSpeed+8);
      await setKey(walking?'ArrowLeft':'a',!complete&&correction>.055);
      await setKey(walking?'ArrowRight':'d',!complete&&correction<-.055);
      samples.push({...pose,segment,progress,error,complete});
      if(complete){signal.completed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }finally{for(const key of held)await page.keyboard.up(key).catch(()=>{});}
  return {samples,progress,routeLength:route.length,completed:!!signal.completed};
}
