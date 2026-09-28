// Collapse only byte-identical vertices belonging to the same source mesh.
// Keep triangle order and index ranges: editing one building must never move
// a neighbor, even when their walls touch at exactly the same coordinates.
export function compactBuildingVertices(geometry, ranges) {
  const attributes=Object.entries(geometry.attributes),indices=geometry.index?.array;
  if(!indices?.length || !ranges?.length || attributes.some(([,a])=>!(a.array instanceof Float32Array)||a.isInterleavedBufferAttribute))return null;
  let end=0;
  for(const range of ranges){if(range.start!==end||range.count<0||range.count%3)return null;end+=range.count;}
  if(end!==indices.length)return null;
  const views=attributes.map(([,a])=>({size:a.itemSize,bits:new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length)}));
  const vertexCount=geometry.attributes.position.count;
  let size=1;while(size<indices.length*2)size*=2;
  const slots=new Uint32Array(size),domains=new Uint32Array(indices.length),sources=new Uint32Array(indices.length),nextIndices=new Uint32Array(indices.length);
  let count=0,domain=0;
  for(const range of ranges){
    domain++;
    for(let i=range.start;i<range.start+range.count;i++){
      const source=indices[i];let hash=domain;
      for(const view of views)for(let k=0;k<view.size;k++)hash=Math.imul(hash^view.bits[source*view.size+k],16777619);
      let slot=hash&(size-1);
      for(;;){
        const stored=slots[slot];
        if(!stored){slots[slot]=count+1;domains[count]=domain;sources[count]=source;nextIndices[i]=count++;break;}
        const candidate=stored-1,other=sources[candidate];let equal=domains[candidate]===domain;
        if(equal)for(const view of views){for(let k=0;k<view.size;k++)if(view.bits[source*view.size+k]!==view.bits[other*view.size+k]){equal=false;break;}if(!equal)break;}
        if(equal){nextIndices[i]=candidate;break;}
        slot=(slot+1)&(size-1);
      }
    }
  }
  if(count>=vertexCount)return {beforeVertices:vertexCount,afterVertices:vertexCount,savedBytes:0};
  let savedBytes=0;
  for(const [name,attribute] of attributes){
    const array=new Float32Array(count*attribute.itemSize),target=new Uint32Array(array.buffer),source=new Uint32Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.length);
    for(let i=0;i<count;i++)for(let k=0;k<attribute.itemSize;k++)target[i*attribute.itemSize+k]=source[sources[i]*attribute.itemSize+k];
    savedBytes+=attribute.array.byteLength-array.byteLength;
    // This runs before the geometry is published or uploaded.
    attribute.array=array;attribute.count=count;
  }
  const packed=count>65535?nextIndices:Uint16Array.from(nextIndices);
  savedBytes+=indices.byteLength-packed.byteLength;
  geometry.index.array=packed;geometry.index.count=packed.length;
  return {beforeVertices:vertexCount,afterVertices:count,savedBytes};
}
