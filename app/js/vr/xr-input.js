const clamp=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
const button=(pad,index)=>Math.max(0,clamp(pad.buttons?.[index]?.value??(pad.buttons?.[index]?.pressed?1:0)));
function axis(value){const v=clamp(value),n=Math.abs(v);return n<=.18?0:clamp(Math.sign(v)*(n-.18)/.82);}
function stick(pad){
  // xr-standard reserves 0/1 for a touchpad, 2/3 for a thumbstick,
  // including placeholder axes when only the thumbstick is present.
  if(pad.axes?.length>=4)return [axis(pad.axes[2]),axis(pad.axes[3])];
  return pad.buttons?.[2]?.touched||pad.buttons?.[2]?.pressed?[axis(pad.axes?.[0]),axis(pad.axes?.[1])]:[0,0];
}

// A frame-sampled producer, consumed by the existing action reader. It cannot
// move an actor, schedule frames or interpret an unknown controller mapping.
export function createXrActionInput(){
  let armed=false,sample=null;
  function reset(){armed=false;sample=null;}
  return Object.freeze({reset,
    update(sources,enabled){
      sample=null;if(!enabled){armed=false;return;}
      let left=null,right=null;
      for(const source of sources||[]){
        const pad=source?.gamepad;
        if(pad?.mapping!=='xr-standard'||pad.connected===false)continue;
        if(source.handedness==='left'&&!left)left=pad;
        if(source.handedness==='right'&&!right)right=pad;
      }
      const [x,y]=left?stick(left):[0,0],pitch=right?stick(right)[1]:0;
      const throttle=right?button(right,0):0,brake=left?button(left,0):0;
      const neutral=x===0&&y===0&&pitch===0&&throttle<.08&&brake<.08;
      if(!armed){armed=neutral;return;}
      sample={turn:-x,move:-y,pitch,throttle,brake};
    },
    read(mode){
      if(!armed||!sample)return null;
      const {turn,move,pitch,throttle,brake}=sample;
      if(mode==='drive')return {turn,steer:turn,move,throttle:Math.max(throttle,move),reverse:Math.max(0,-move),serviceBrake:brake};
      if(mode==='plane')return {turn,steer:turn,roll:turn,pitch,throttleAdjust:throttle-brake};
      if(mode==='walk')return {move,strafe:-turn,sprint:0};
      if(mode==='ocean')return {turn,move,vertical:-pitch};
      if(mode==='rocket')return {turn,move:-pitch,jump:throttle,sprint:brake};
      return null;
    },
    snapshot:()=>({armed,sampled:!!sample})
  });
}

export function mergeXrActions(actions,immersive){
  if(!immersive)return actions;
  for(const key of ['move','turn','steer','strafe','roll','pitch','throttleAdjust','vertical']){
    const value=clamp(immersive[key]);if(Math.abs(value)>Math.abs(actions[key]||0))actions[key]=value;
  }
  for(const key of ['throttle','reverse','serviceBrake','jump','sprint'])actions[key]=Math.max(actions[key]||0,Math.max(0,clamp(immersive[key])));
  return actions;
}
