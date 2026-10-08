// A short interpolation buffer presents authoritative crew motion continuously
// instead of repeatedly easing toward each sparse network update. It never
// extrapolates through reef collision or substitutes client control authority.
export function sampleMarinePresentation(samples,serverNow,delayMs=2700){
 if(!samples?.length)return null;
 const time=serverNow-delayMs;
 const first=samples[0],last=samples[samples.length-1];
 if(time<=first.at)return {...first.pose};if(time>=last.at)return {...last.pose};
 const right=samples.findIndex(s=>s.at>=time),a=samples[right-1],b=samples[right],t=Math.max(0,Math.min(1,(time-a.at)/Math.max(1,b.at-a.at)));
 return {x:a.pose.x+(b.pose.x-a.pose.x)*t,y:a.pose.y+(b.pose.y-a.pose.y)*t,z:a.pose.z+(b.pose.z-a.pose.z)*t,yaw:a.pose.yaw+Math.atan2(Math.sin(b.pose.yaw-a.pose.yaw),Math.cos(b.pose.yaw-a.pose.yaw))*t};
}
