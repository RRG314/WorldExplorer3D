// Bounded cache of flat compiler output, before terrain sampling. Cached cells
// are accepted only after the worker hashes their complete polygon inputs.
export class StreetPacketCache {
  constructor(maxBytes=16*1024*1024){this.maxBytes=maxBytes;this.bytes=0;this.entries=new Map();}
  manifest(){return Object.fromEntries([...this.entries].map(([key,value])=>[key,value.packet.fingerprint]));}
  put(packet){
    if(!packet.fingerprint)return;
    const mesh={};let bytes=0;
    for(const name of ['vertices','curbVertices','markingVertices']){mesh[name]=new Float64Array(packet.mesh[name]||[]);bytes+=mesh[name].byteLength;}
    // Include the structured geometry context in the retention budget.
    const {mesh:unused,...metadata}=packet;
    bytes+=JSON.stringify(metadata).length*2;
    if(bytes>this.maxBytes)return;
    const old=this.entries.get(packet.key);if(old){this.bytes-=old.bytes;this.entries.delete(packet.key);}
    while(this.bytes+bytes>this.maxBytes){const key=this.entries.keys().next().value;this.bytes-=this.entries.get(key).bytes;this.entries.delete(key);}
    this.entries.set(packet.key,{bytes,packet:{...metadata,mesh}});this.bytes+=bytes;
  }
  get(key,fingerprint){
    const item=this.entries.get(key);if(!item||item.packet.fingerprint!==fingerprint)return null;
    this.entries.delete(key);this.entries.set(key,item);
    return {...item.packet,durationMs:0,mesh:Object.fromEntries(Object.entries(item.packet.mesh).map(([name,values])=>[name,Array.from(values)]))};
  }
  clear(){this.entries.clear();this.bytes=0;}
}
