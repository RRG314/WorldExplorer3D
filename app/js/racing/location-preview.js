import {capturePresentation} from '../runtime/renderer-owners.js';

// One bounded read after the existing renderer presents the current world.
// No extra render, camera move, timer, provider fetch or persisted photograph.
export function createRaceLocationPreview(context,{isCurrent=()=>true,onImage=()=>{},onUnavailable=()=>{}}={}) {
 const publication=context.worldPublication,presentation=capturePresentation(context);
 let disposed=false,reading=false,url=null,unregister=null;
 const current=()=>!disposed&&isCurrent()&&context.worldPublication===publication&&presentation.owner==='main'&&!!presentation.renderer?.domElement&&presentation.isCurrent()&&!context.worldLoading;
 const releaseSystem=()=>{const release=unregister;unregister=null;release?.();};
 const unavailable=()=>{releaseSystem();if(current())onUnavailable();};
 function read() {
  if(reading)return;
  if(!current()){releaseSystem();return;}
  reading=true;releaseSystem();
  const source=presentation.renderer.domElement,canvas=document.createElement('canvas');
  try {
   if(source.width<64||source.height<64)throw Error('preview_too_small');
   const scale=Math.min(1,960/source.width,540/source.height);
   canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
   const target=canvas.getContext('2d',{willReadFrequently:true});
   target.drawImage(source,0,0,canvas.width,canvas.height);
   const pixels=target.getImageData(0,0,canvas.width,canvas.height).data;
   let min=Infinity,max=0;
   for(let i=0;i<pixels.length;i+=64){const value=pixels[i]+pixels[i+1]+pixels[i+2];min=Math.min(min,value);max=Math.max(max,value);}
   if(max-min<8)throw Error('preview_blank');
   canvas.toBlob(blob=>{
    canvas.width=canvas.height=1;
    if(!current())return;
    if(!blob||blob.size>512*1024){unavailable();return;}
    url=URL.createObjectURL(blob);onImage(url);
   },'image/webp',.8);
  } catch {canvas.width=canvas.height=1;unavailable();}
 }
 if(current()&&!context.hasPauseReason?.('manual_pause')&&context.registerRuntimeSystem)unregister=context.registerRuntimeSystem({
  id:'racing.location-preview',owner:'racing-ui',phase:'render',priority:1100,critical:false,
  enabled:frame=>!reading&&frame?.manualRender!==false&&!globalThis.document?.hidden,
  update(frame){
   if(!current()){releaseSystem();return;}
   if(frame.flags?.mainWorldPresented===publication)read();
  }
 });
 else onUnavailable();
 return {dispose(){if(disposed)return;disposed=true;releaseSystem();if(url){URL.revokeObjectURL(url);url=null;}}};
}
