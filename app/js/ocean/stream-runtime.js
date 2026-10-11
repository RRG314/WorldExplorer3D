import {createOceanDepthStream} from './stream-depth.js';
import {OCEAN_TILE_SEGMENTS,oceanTileCoordinate,interpolateOceanTile} from './stream-grid.js';
import {earthCoordinateFrame} from '../earth-core/coordinate-frame.js?v=1';

export function oceanRenderFrame(mode,scale){return earthCoordinateFrame(mode.frameOrigin||mode.launchSite,scale);}
export function oceanParentPosition(mode,scale){
  if(!mode.continuous||!mode.launchSite)return {x:0,z:0};
  const frame=oceanRenderFrame(mode,scale),a=frame.origin,b=mode.launchSite,rad=Math.PI/180;
  const delta=(b.lon-a.lon)*rad,latA=a.lat*rad,latB=b.lat*rad;
  const h=Math.sin((latB-latA)/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(delta/2)**2;
  const metres=12742000*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
  // An ENU tangent plane folds the far side of the planet underneath its
  // origin. Use a great-circle bearing for distant map/return markers so an
  // antipodal parent cannot appear beside the player or collide with them.
  if(metres>5000){
    const bearing=Math.atan2(Math.sin(delta)*Math.cos(latB),Math.cos(latA)*Math.sin(latB)-Math.sin(latA)*Math.cos(latB)*Math.cos(delta));
    const distance=metres*scale/111000;
    return {x:Math.sin(bearing)*distance,z:-Math.cos(bearing)*distance,yawOffset:0,distanceMeters:metres};
  }
  const position=frame.toWorld(b.lat,b.lon),launch=earthCoordinateFrame(b,scale);
  const south=launch.toGeographic(0,1),forward=frame.toWorld(south.lat,south.lon);
  return {...position,yawOffset:Math.atan2(forward.x-position.x,forward.z-position.z),distanceMeters:metres};
}
export function reprojectOceanPose(pose,oldFrame,newFrame){
  const point=oldFrame.toGeographic(pose.x,pose.z),position=newFrame.toWorld(point.lat,point.lon);
  if(Number.isFinite(pose.yaw)){
    const ahead=oldFrame.toGeographic(pose.x+Math.sin(pose.yaw),pose.z+Math.cos(pose.yaw));
    const projected=newFrame.toWorld(ahead.lat,ahead.lon);position.yaw=Math.atan2(projected.x-position.x,projected.z-position.z);
  }
  return {...pose,...position};
}

// Meshes own only geometry/material. Shared ocean textures remain leased by
// the scene texture owner. Every tile publishes/evicts through the depth owner.
export function createOceanStreamRuntime(THREE,{mode,scale,metersPerUnit,textures,fetchDepth}){
  const group=new THREE.Group();group.name='Geographic ocean tiles';mode.scene.add(group);
  const meshes=new Map();let disposed=false;
  function project(tile,mesh){
    const frame=oceanRenderFrame(mode,scale),n=OCEAN_TILE_SEGMENTS,pos=mesh.geometry.attributes.position;
    const midpoint=oceanTileCoordinate(tile,.5,.5),origin=frame.toWorld(midpoint.lat,midpoint.lon);
    mesh.position.set(origin.x,0,origin.z);
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const p=oceanTileCoordinate(tile,i/n,j/n),local=frame.toWorld(p.lat,p.lon);
      pos.setXYZ(j*(n+1)+i,local.x-origin.x,interpolateOceanTile(tile.values,i/n,j/n)/metersPerUnit,local.z-origin.z);
    }
    pos.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    const normals=mesh.geometry.attributes.normal;for(let i=0;i<normals.count;i++)if(normals.getY(i)<0)normals.setXYZ(i,-normals.getX(i),-normals.getY(i),-normals.getZ(i));normals.needsUpdate=true;
  }
  function retire(tile){const mesh=meshes.get(tile.key);if(!mesh)return;group.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();meshes.delete(tile.key);}
  const depth=createOceanDepthStream({fetchDepth,onRetire:retire,onTile(tile){
    const n=OCEAN_TILE_SEGMENTS,geo=new THREE.BufferGeometry(),positions=new Float32Array((n+1)**2*3),uv=new Float32Array((n+1)**2*2),indices=[];
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
      const k=j*(n+1)+i;uv[k*2]=i/n;uv[k*2+1]=j/n;
      if(i<n&&j<n){indices.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);}
    }
    geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));geo.setIndex(indices);
    // Cube faces may reverse winding in north/south world axes. Double-sided
    // bathymetry avoids a missing floor at a face edge; normals point upward.
    const material=new THREE.MeshStandardMaterial({color:0x8e958b,map:textures.map||null,normalMap:textures.normalMap||null,roughnessMap:textures.roughnessMap||null,roughness:.94,side:THREE.DoubleSide});
    material.normalScale.set(.48,.48);
    const mesh=new THREE.Mesh(geo,material);mesh.name=`Seabed ${tile.key}`;mesh.receiveShadow=true;project(tile,mesh);
    const normals=geo.attributes.normal;for(let i=0;i<normals.count;i++)if(normals.getY(i)<0)normals.setXYZ(i,-normals.getX(i),-normals.getY(i),-normals.getZ(i));normals.needsUpdate=true;
    meshes.set(tile.key,mesh);group.add(mesh);
  }});
  function geographic(x,z){return oceanRenderFrame(mode,scale).toGeographic(x,z);}
  return {group,depth,update(position){const p=geographic(position.x,position.z);depth.update(p.lat,p.lon);},
    sample(x,z){const p=geographic(x,z);return depth.sample(p.lat,p.lon);},
    canNavigate(x,z,radius=8){return [[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius]].every(([dx,dz])=>{
      const p=geographic(x+dx,z+dz),e=depth.sample(p.lat,p.lon);return Number.isFinite(e.elevationMeters)&&e.elevationMeters < -2;
    });},
    reproject(){for(const tile of depth.tiles){const mesh=meshes.get(tile.key);if(mesh)project(tile,mesh);}},
    snapshot:()=>({...depth.snapshot(),meshes:meshes.size,vertices:meshes.size*(OCEAN_TILE_SEGMENTS+1)**2,frameOrigin:{...mode.frameOrigin}}),
    dispose(){if(disposed)return;disposed=true;depth.dispose();group.parent?.remove(group);}
  };
}
