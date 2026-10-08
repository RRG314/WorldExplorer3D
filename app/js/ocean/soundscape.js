// Session-owned authored sound, never presented as a field recording. Creation
// requires the player's sound button, respects pause/visibility, and closes on exit.
export function createOceanSoundscape({host,AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext,hidden=()=>document.hidden}){
 let context=null,source=null,filter=null,gain=null,enabled=false,disposed=false;
 const button=document.createElement('button');button.id='oceanSoundToggle';button.type='button';button.style.cssText='width:100%;min-height:36px;margin-top:8px;background:#103b4d;border:1px solid #5c91a4;border-radius:6px;color:white;font:inherit';
 const label=()=>{button.textContent=`Ocean sound: ${enabled?'on':'off'}`;button.setAttribute('aria-pressed',String(enabled))};label();host?.append(button);
 async function toggle(){
  if(disposed)return false;
  if(!context){
   if(!AudioContextCtor){button.textContent='Ocean sound unavailable';button.disabled=true;return false;}
   context=new AudioContextCtor();gain=context.createGain();gain.gain.value=0;filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=240;
   const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);let value=0;
   for(let i=0;i<data.length;i++){value=(value+.025*(Math.random()*2-1))/1.025;data[i]=value*4;}
   source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter).connect(gain).connect(context.destination);source.start();
  }
  await context.resume();if(disposed)return false;enabled=!enabled;if(!enabled)gain.gain.setTargetAtTime(0,context.currentTime,.05);label();return enabled;
 }
 button.onclick=()=>{void toggle().catch(()=>{enabled=false;label();button.title='Audio could not start. Try again.'})};
 function update({paused=false,diving=false,speed=0,time=0}={}){if(!context||disposed)return;const level=!enabled||paused||hidden()?0:diving?.018*(.35+.65*Math.max(0,Math.sin(time*1.7))):.015+Math.min(.012,Math.abs(speed)*.001);gain.gain.setTargetAtTime(level,context.currentTime,.15);filter.frequency.setTargetAtTime(diving?480:180+Math.min(150,Math.abs(speed)*6),context.currentTime,.2);}
 return {toggle,update,snapshot:()=>({enabled,state:context?.state||'not-started',disposed}),dispose(){if(disposed)return;disposed=true;enabled=false;button.remove();source?.stop();source?.disconnect();filter?.disconnect();gain?.disconnect();void context?.close().catch(()=>{});}};
}
