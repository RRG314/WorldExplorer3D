// Opt-in for reviewed assets with a bounded download policy. This is transport
// within the model owner, not another model cache or content loader.
export async function downloadBoundedModel(url,{maxBytes,timeoutMs=20000,fetchImpl=fetch}={}){
  if(!(maxBytes>0&&maxBytes<=20000000))throw Error('Invalid model download budget.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,credentials:'same-origin',redirect:'error'});
    if(!response.ok)throw Error(`Model download failed (${response.status}).`);
    if(Number(response.headers.get('content-length'))>maxBytes)throw Error('Model download exceeds its byte budget.');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Model download exceeds its byte budget.');chunks.push(value);}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(bytes.length<20||new DataView(bytes.buffer).getUint32(0,true)!==0x46546c67)throw Error('Model response is not GLB.');
    return bytes.buffer;
  }finally{clearTimeout(timer);}
}
