// Exclusive construction buffers. No boxed-number arrays or second typed copy
// are retained alongside a completed regional building mesh.
export class RegionalGeometryBuffer {
  constructor(Type, capacity=0, normalized=false) {
    this.Type=Type;this.data=new Type(capacity);this.length=0;
    this.normalized=normalized;this.retired=false;
  }
  push(a,b,c,d,e,f) {
    if(this.retired)throw Error('Regional geometry storage is retired');
    const count=arguments.length,required=this.length+count;
    if(required>this.data.length){
      const previous=this.data;
      this.data=new this.Type(Math.max(required,256,previous.length*2));
      this.data.set(previous);
      if(typeof previous.buffer.transfer==='function')previous.buffer.transfer(0);
    }
    for(let i=0;i<count;i++){
      const value=arguments[i];
      this.data[this.length++]=this.normalized?Math.round(Math.max(0,Math.min(1,Number(value)||0))*255):value;
    }
  }
  finish() {
    if(this.retired)throw Error('Regional geometry storage is retired');
    this.retired=true;
    const usedBytes=this.length*this.Type.BYTES_PER_ELEMENT,previous=this.data;
    const result=usedBytes===previous.byteLength?previous:
      typeof previous.buffer.transfer==='function'?new this.Type(previous.buffer.transfer(usedBytes)):previous.slice(0,this.length);
    this.data=null;return result;
  }
  dispose() {
    if(this.retired)return;this.retired=true;
    if(typeof this.data.buffer.transfer==='function')this.data.buffer.transfer(0);
    this.data=null;this.length=0;
  }
}

export function createRegionalGeometryStorage(buildingCount=0) {
  const vertices=Math.min(1000000,Math.max(0,buildingCount)*22);
  const storage={
    positions:new RegionalGeometryBuffer(Float32Array,vertices*3),
    colors:new RegionalGeometryBuffer(Uint8Array,vertices*3,true),
    styles:new RegionalGeometryBuffer(Float32Array,vertices*4),
    layouts:new RegionalGeometryBuffer(Float32Array,vertices*4),
    indices:new RegionalGeometryBuffer(Uint32Array,Math.ceil(vertices*1.5))
  };
  return {...storage,dispose(){for(const buffer of Object.values(storage))buffer.dispose();}};
}
