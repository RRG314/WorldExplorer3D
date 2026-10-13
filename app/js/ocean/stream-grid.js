// A cube covers poles and the date line without an infinitely thin longitude
// strip. Tile IDs and source nodes are geographic, independent of render origin.
export const OCEAN_TILE_LEVEL = 13;
export const OCEAN_TILE_SEGMENTS = 24;
const N = 2 ** OCEAN_TILE_LEVEL;
const rad = Math.PI / 180;
const frames = [
  (u,v)=>[1,u,v], (u,v)=>[-1,-u,v], (u,v)=>[-u,1,v],
  (u,v)=>[u,-1,v], (u,v)=>[u,v,1], (u,v)=>[u,-v,-1]
];
export function oceanCubeCoordinate(face,u,v) {
  const [x,y,z]=frames[face](u,v),length=Math.hypot(x,y,z);
  return {lat:Math.asin(z/length)/rad,lon:Math.atan2(y,x)/rad};
}
export function oceanTileAt(lat,lon) {
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return null;
  const x=Math.cos(lat*rad)*Math.cos(lon*rad),y=Math.cos(lat*rad)*Math.sin(lon*rad),z=Math.sin(lat*rad);
  const ax=Math.abs(x),ay=Math.abs(y),az=Math.abs(z);let face,u,v;
  if(ax>=ay&&ax>=az){face=x>=0?0:1;u=(x>=0?y:-y)/ax;v=z/ax;}
  else if(ay>=az){face=y>=0?2:3;u=(y>=0?-x:x)/ay;v=z/ay;}
  else{face=z>=0?4:5;u=x/az;v=(z>=0?y:-y)/az;}
  const a=Math.max(0,Math.min(N-1e-8,(u+1)*N/2)),b=Math.max(0,Math.min(N-1e-8,(v+1)*N/2));
  const i=Math.floor(a),j=Math.floor(b);
  return {key:`${face}/${i}/${j}`,face,i,j,s:a-i,t:b-j};
}
export function oceanTileCoordinate(tile,s,t) {
  return oceanCubeCoordinate(tile.face,(tile.i+s)*2/N-1,(tile.j+t)*2/N-1);
}
export function oceanTileWindow(lat,lon) {
  const center=oceanTileAt(lat,lon);if(!center)return [];
  const result=new Map([[center.key,center]]);
  // Cross-face neighbors use the same projection, including at cube corners.
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
    const p=oceanTileCoordinate(center,i+.5,j+.5),tile=oceanTileAt(p.lat,p.lon);result.set(tile.key,tile);
  }
  return [...result.values()];
}
export function oceanNodeKey(point) {
  // Normalizing Cartesian coordinates unifies both spellings of +/-180 and
  // pole vertices shared by different cube faces.
  const c=Math.cos(point.lat*rad);
  return [c*Math.cos(point.lon*rad),c*Math.sin(point.lon*rad),Math.sin(point.lat*rad)].map(v=>String(Math.round(v*1e11)||0)).join('/');
}
export function interpolateOceanTile(values,s,t) {
  if(!values?.every(Number.isFinite)||values.length!==4)return null;
  const n=OCEAN_TILE_SEGMENTS,a=Math.min(n-1,Math.floor(s*n)),b=Math.min(n-1,Math.floor(t*n)),x=s*n-a,y=t*n-b;
  const h=(u,v)=>values[0]*(1-u)*(1-v)+values[1]*u*(1-v)+values[2]*(1-u)*v+values[3]*u*v;
  const h10=h((a+1)/n,b/n),h01=h(a/n,(b+1)/n);
  // Match the rendered triangles, not a different collision interpolation.
  return x+y<=1?h(a/n,b/n)*(1-x-y)+h10*x+h01*y:h10*(1-y)+h01*(1-x)+h((a+1)/n,(b+1)/n)*(x+y-1);
}
