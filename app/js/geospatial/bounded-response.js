// Bound decoded response bodies too: Content-Length can be absent or describe
// compressed bytes. Stop the stream before allocating an unbounded string.
export async function readBoundedText(response,maxBytes=3000000){
 if(Number(response.headers?.get('content-length'))>maxBytes){await response.body?.cancel?.().catch(()=>{});throw Error('Data source response exceeds the size limit.');}
 if(!response.body?.getReader){const text=await response.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw Error('Data source response exceeds the size limit.');return text;}
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel().catch(()=>{});throw Error('Data source response exceeds the size limit.');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}
}
export async function readBoundedJson(response,maxBytes){return JSON.parse(await readBoundedText(response,maxBytes));}
