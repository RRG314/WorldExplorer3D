// Compiler and terrain-fitted cells share one bounded cache. Map input is
// checked by the worker fingerprint; fitted output additionally requires the
// exact current ground/contact/portal owners.
export class StreetPacketCache {
  constructor(maxBytes=16*1024*1024){this.maxBytes=maxBytes;this.bytes=0;this.entries=new Map();}
  manifest(){return Object.fromEntries([...this.entries].map(([key,value])=>[key,value.packet.fingerprint]));}
  surfaceManifest(owner){
    if(!owner||owner!==this.surfaceOwner)return {};
    return Object.fromEntries([...this.entries].filter(([,item])=>item.surface&&item.packet.surfaceFingerprint)
      .map(([key,{packet}])=>[key,{fingerprint:packet.fingerprint,surfaceFingerprint:packet.surfaceFingerprint}]));
  }
  revalidateSurface(packet,owner){
    const item=this.entries.get(packet.key);
    if(!owner||owner!==this.surfaceOwner||!item?.surface||!packet.surfaceFingerprint||
      item.packet.fingerprint!==packet.reuseFingerprint||item.packet.surfaceFingerprint!==packet.surfaceFingerprint)return false;
    const {reuseFingerprint,type,...metadata}=packet;
    const next={...item.packet,...metadata,type:'tile'};
    const metadataBytes=JSON.stringify(next).length*2;
    if(this.bytes+metadataBytes-item.metadataBytes>this.maxBytes)return false;
    this.bytes+=metadataBytes-item.metadataBytes;item.bytes+=metadataBytes-item.metadataBytes;
    item.metadataBytes=metadataBytes;item.packet=next;
    return true;
  }
  put(packet){
    if(!packet.fingerprint)return;
    const mesh={};let bytes=0;
    for(const name of ['vertices','curbVertices','markingVertices']){mesh[name]=new Float64Array(packet.mesh[name]||[]);bytes+=mesh[name].byteLength;}
    // Include the structured geometry context in the retention budget.
    const {mesh:unused,...metadata}=packet;
    const metadataBytes=JSON.stringify(metadata).length*2;
    bytes+=metadataBytes;
    if(bytes>this.maxBytes)return;
    const old=this.entries.get(packet.key);if(old){this.bytes-=old.bytes;this.entries.delete(packet.key);}
    while(this.bytes+bytes>this.maxBytes){const key=this.entries.keys().next().value;this.bytes-=this.entries.get(key).bytes;this.entries.delete(key);}
    this.entries.set(packet.key,{bytes,metadataBytes,packet:{...metadata,mesh}});this.bytes+=bytes;
  }
  get(key,fingerprint){
    const item=this.entries.get(key);if(!item?.packet.mesh||item.packet.fingerprint!==fingerprint)return null;
    this.entries.delete(key);this.entries.set(key,item);
    return {...item.packet,durationMs:0,mesh:Object.fromEntries(Object.entries(item.packet.mesh).map(([name,values])=>[name,values.slice()]))};
  }
  setSurfaceOwner({revision,contact,portals,terrain}){
    const previous=this.surfaceOwner;
    if(previous&&previous.revision===revision&&previous.contact===contact&&previous.portals===portals&&previous.terrain===terrain)return previous;
    for(const [key,item] of this.entries){
      // Finished cells replace their construction buffers. Changed physical
      // owners require recompilation, never reuse of a stale fitted surface.
      if(item.surface){this.bytes-=item.bytes;this.entries.delete(key);}
    }
    return this.surfaceOwner={revision,contact,portals,terrain};
  }
  putSurface(key,fingerprint,owner,surface){
    const item=this.entries.get(key);
    if(!owner||owner!==this.surfaceOwner||!item||item.packet.fingerprint!==fingerprint)return false;
    const bytes=surface.vertices.byteLength+surface.curbVertices.byteLength+surface.markingVertices.byteLength+32;
    const baseBytes=item.metadataBytes;
    if(baseBytes+bytes>this.maxBytes)return false;
    this.entries.delete(key);this.bytes-=item.bytes;
    while(this.bytes+baseBytes+bytes>this.maxBytes){const oldest=this.entries.keys().next().value;this.bytes-=this.entries.get(oldest).bytes;this.entries.delete(oldest);}
    item.surface={vertices:surface.vertices.slice(),curbVertices:surface.curbVertices.slice(),markingVertices:surface.markingVertices.slice(),addedTriangles:surface.addedTriangles,baseTriangles:surface.baseTriangles};
    delete item.packet.mesh;
    item.bytes=baseBytes+bytes;
    this.entries.set(key,item);this.bytes+=item.bytes;return true;
  }
  getSurface(key,fingerprint,owner){
    const item=this.entries.get(key);
    if(!owner||owner!==this.surfaceOwner||!item?.surface||item.packet.fingerprint!==fingerprint)return null;
    this.entries.delete(key);this.entries.set(key,item);
    const s=item.surface;
    return {...s,vertices:s.vertices.slice(),curbVertices:s.curbVertices.slice(),markingVertices:s.markingVertices.slice()};
  }
  getPublication(key,fingerprint,owner){
    const surface=this.getSurface(key,fingerprint,owner);
    if(surface)return {packet:{...this.entries.get(key).packet,durationMs:0},surface};
    const packet=this.get(key,fingerprint);
    return packet?{packet,surface:null}:null;
  }
  clear(){this.entries.clear();this.bytes=0;this.surfaceOwner=null;}
}
