// Immutable provider rings are queried at every terrain vertex. Store numeric
// edges once and prune by latitude; retain the exact ray-crossing expression.
// Optional inspection reuses the exact indexed endpoints. Ordinary terrain
// containment keeps no second array-of-points graph alive.
function attachCoordinateView(query, edges) {
  let coordinates = null;
  Object.defineProperty(query, 'coordinates', { value() {
    if (!coordinates) {
      coordinates = Object.freeze(Array.from({ length: edges.length / 4 }, (_, i) =>
        Object.freeze([edges[i * 4], edges[i * 4 + 1]])));
    }
    return coordinates;
  }});
  return query;
}

export function createGeographicRingIndex(ring, publicationStorage = null, coordinateView = false) {
  const allocate = (Type, length) => {
    if (!publicationStorage) return new Type(length);
    const {buffer, byteOffset} = publicationStorage.allocate(length * Type.BYTES_PER_ELEMENT);
    return new Type(buffer, byteOffset, length);
  };
  const edgeCount = ring.length;
  const edges=allocate(Float64Array,edgeCount*4);
  let min=Infinity,max=-Infinity;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const at=i*4,xi=Number(ring[i]?.[0]),yi=Number(ring[i]?.[1]),xj=Number(ring[j]?.[0]),yj=Number(ring[j]?.[1]);
    edges[at]=xi;edges[at+1]=yi;edges[at+2]=xj;edges[at+3]=yj;
    if(Number.isFinite(xi)&&Number.isFinite(yi)&&Number.isFinite(xj)&&Number.isFinite(yj)){min=Math.min(min,yi,yj);max=Math.max(max,yi,yj);}
  }
  if(!(max>min)){const empty=()=>false;return coordinateView?attachCoordinateView(empty,edges):empty;}
  const count=Math.min(64,Math.max(1,Math.ceil(Math.sqrt(ring.length))));
  const bin=y=>Math.max(0,Math.min(count-1,Math.floor((y-min)/(max-min)*count)));
  let lists=Array.from({length:count},()=>[]),references=0;
  for(let i=0;i<ring.length;i++){
    const at=i*4,yi=edges[at+1],yj=edges[at+3];
    if(!Number.isFinite(edges[at])||!Number.isFinite(edges[at+2])||!Number.isFinite(yi)||!Number.isFinite(yj)||yi===yj)continue;
    for(let b=bin(Math.min(yi,yj)),end=bin(Math.max(yi,yj));b<=end;b++){lists[b].push(at);references++;}
    // Adversarial zig-zag rings use a flat typed scan rather than an expansive
    // index. This changes only the acceleration structure, never the polygon.
    if(references>ring.length*16){lists=null;break;}
  }
  const offsets=lists?allocate(Uint32Array,count+1):null;
  const indices=lists?allocate(Uint32Array,references):null;
  if(lists){let cursor=0;for(let b=0;b<count;b++){offsets[b]=cursor;indices.set(lists[b],cursor);cursor+=lists[b].length;}offsets[count]=cursor;}
  const contains = (lon,lat)=>{
    if(lat<min||lat>max)return false;
    let inside=false;
    const b=bin(lat),start=offsets?offsets[b]:0,end=offsets?offsets[b+1]:edgeCount;
    for(let entry=start;entry<end;entry++){
      const at=indices?indices[entry]:entry*4,yi=edges[at+1],yj=edges[at+3];
      if((yi>lat)===(yj>lat))continue;
      const xi=edges[at],xj=edges[at+2];
      if(!Number.isFinite(xi)||!Number.isFinite(yi)||!Number.isFinite(xj)||!Number.isFinite(yj))continue;
      if(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi)inside=!inside;
    }
    return inside;
  };
  return coordinateView ? attachCoordinateView(contains, edges) : contains;
}
