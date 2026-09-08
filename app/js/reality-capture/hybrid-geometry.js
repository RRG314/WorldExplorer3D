import {resolveMappedRoof,createMappedRoofMesh} from '../world/mapped-roof-geometry.js?v=6';
import {manualRoomFootprint,manualRoomSurfacePoint} from '../../../functions/capture-room-geometry.mjs';
// Photo-supported planar patches, never an inferred reconstruction of hidden surfaces.
export function wallFootprint(building) {
  if(building?.manualRoom)return manualRoomFootprint(building.manualRoom);
  const input = building?.spatialContext?.footprint;
  if (!Array.isArray(input) || input.length < 3 || input.length > 256) throw Error('This capture needs its mapped footprint before a hybrid preview can be made.');
  const pts = input.map(p => ({x:p.x,z:p.z}));
  if (pts.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw Error('Invalid mapped footprint.');
  if (Math.hypot(pts[0].x-pts.at(-1).x, pts[0].z-pts.at(-1).z) < .001) pts.pop();
  if (pts.length < 3 || pts.some((p,i) => Math.hypot(p.x-pts[(i+1)%pts.length].x,p.z-pts[(i+1)%pts.length].z)<.01)) throw Error('The footprint has a degenerate wall.');
  return pts;
}

import {validateQuad,photoHomography,projectPhoto} from '../../../functions/capture-projectivity.mjs';
export {validateQuad,photoHomography,projectPhoto};

export function rectifyPhoto(bitmap, quad, aspect=1, maxSize=1024) {
  const h=photoHomography(quad), source=document.createElement('canvas');
  // Bound decoded working copies and output texture independently of input size.
  const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height));
  source.width=Math.round(bitmap.width*scale); source.height=Math.round(bitmap.height*scale);
  const sc=source.getContext('2d',{willReadFrequently:true}); sc.drawImage(bitmap,0,0,source.width,source.height);
  const src=sc.getImageData(0,0,source.width,source.height).data;
  const result=document.createElement('canvas');
  const limit=Math.max(32,Math.min(1024,maxSize));
  result.width=Math.max(32,Math.round(limit*Math.min(1,aspect)));
  result.height=Math.max(32,Math.round(limit*Math.min(1,1/aspect)));
  const ctx=result.getContext('2d'), out=ctx.createImageData(result.width,result.height);
  for(let y=0;y<result.height;y++) for(let x=0;x<result.width;x++) {
    const [u,v]=projectPhoto(h,(x+.5)/result.width,(y+.5)/result.height);
    const sx=Math.max(0,Math.min(source.width-1,u*(source.width-1))), sy=Math.max(0,Math.min(source.height-1,v*(source.height-1)));
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,k=(y*result.width+x)*4;
    for(let c=0;c<3;c++) {
      const a=src[(iy*source.width+ix)*4+c], b=src[(iy*source.width+Math.min(ix+1,source.width-1))*4+c];
      const d=src[(Math.min(iy+1,source.height-1)*source.width+ix)*4+c], e=src[(Math.min(iy+1,source.height-1)*source.width+Math.min(ix+1,source.width-1))*4+c];
      out.data[k+c]=(a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy;
    }
    out.data[k+3]=255;
  }
  ctx.putImageData(out,0,0); source.width=source.height=0; return result;
}

export function buildHybridShell(T, building, height, roof={}) {
  if(building.manualRoom){
    const group=new T.Group();group.userData.evidence='user-dimensioned-room';
    for(let wall=0;wall<6;wall++){
      const mesh=buildWallPatch(T,building,height,{wall,region:[0,0,1,1]},null);
      mesh.material.color.setHex(wall===4?0x776a59:0xc7c0b4);
      mesh.material.polygonOffset=false;mesh.userData.roomShell=true;
      group.add(mesh);
    }
    return group;
  }
  const pts=wallFootprint(building);
  if(!Number.isFinite(height)||height<1||height>1200) throw Error('Enter a preview wall height between 1 and 1,200 metres.');
  const group=new T.Group(); group.userData.evidence='procedural-unobserved-shell';
  const shape=new T.Shape(pts.map(p=>new T.Vector2(p.x,-p.z)));
  const geo=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
  geo.rotateX(-Math.PI/2);
  const material=new T.MeshStandardMaterial({color:0x9c9386,roughness:.95,side:T.DoubleSide});
  group.add(new T.Mesh(geo,material));
  const edges=new T.LineSegments(new T.EdgesGeometry(geo),new T.LineBasicMaterial({color:0x5b554c})); group.add(edges);
  if(['gabled','hipped'].includes(roof.roofShape)) {
    const tags={'roof:shape':roof.roofShape,'roof:height':roof.roofRiseMeters};
    const spec=resolveMappedRoof(tags,height+roof.roofRiseMeters,null,pts);
    if(!spec)throw Error('This footprint or height is not supported by the existing pitched-roof generator. Choose a flat cap for this preview.');
    spec.roofShapeSource='user-preview-unverified';spec.roofHeightSource='user-preview-unverified';
    const mesh=createMappedRoofMesh(pts,0,height,spec,tags);if(mesh)group.add(mesh);
  }
  return group;
}

export function buildWallPatch(T, building, height, patch, texture) {
  const pts=wallFootprint(building), a=pts[patch.wall], b=pts[(patch.wall+1)%pts.length];
  if(!building.manualRoom&&(!a||!b)) throw Error('Select a mapped wall.');
  const [left,bottom,right,top]=patch.region;
  if(![left,bottom,right,top].every(Number.isFinite)||left<0||right>1||bottom<0||top>1||right-left<.01||top-bottom<.01) throw Error('Choose a non-empty region within this wall.');
  const point=(u,v)=>building.manualRoom?manualRoomSurfacePoint(building.manualRoom,patch.wall,u,v):[a.x+(b.x-a.x)*u,height*v,a.z+(b.z-a.z)*u];
  const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.Float32BufferAttribute([...point(left,bottom),...point(right,bottom),...point(right,top),...point(left,top)],3));
  geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({map:texture,side:building.manualRoom?T.FrontSide:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  mesh.userData={evidence:'photo-projected-user-alignment',photoId:patch.photoId,wall:patch.wall};return mesh;
}
