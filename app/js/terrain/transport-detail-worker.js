import {createTransportDetailCompiler} from './transport-detail-compiler.js';
let compiler=null;
function buffers(packet){
  const transfers=[];
  if(packet.masks)transfers.push(packet.masks.buffer);
  for(const region of packet.regions||[packet])for(const batch of region.batches||[])transfers.push(batch.positions.buffer,batch.indices.buffer);
  return transfers;
}
self.onmessage=({data})=>{
  try {
    if(data.type==='prepare'){
      compiler?.dispose();compiler=createTransportDetailCompiler(data.input);
      const initial=compiler.initial;compiler.initial=null;
      self.postMessage({type:'prepared',...initial},buffers(initial));
    } else if(data.type==='next'&&compiler){
      const region=compiler.next(data.focus);
      if(region)self.postMessage({type:'region',...region},buffers(region));
      else {compiler.dispose();compiler=null;self.postMessage({type:'complete'});}
    }
  } catch(error){compiler?.dispose();compiler=null;self.postMessage({type:'error',message:String(error?.message||error)});}
};
