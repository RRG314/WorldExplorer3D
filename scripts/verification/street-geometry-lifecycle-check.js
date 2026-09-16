import {createTerrainReprojectionApi} from '../../app/js/terrain/reprojection.js';

export function verifyReprojectedPathVisibility(THREE) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,-1,1,0,-1,-1,0,1,1,0,1],3));
  geometry.setIndex([0,2,1,1,2,3]);
  geometry.computeBoundingSphere();
  const previousBounds=geometry.boundingSphere.clone();
  const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);
  try {
    mesh.userData={linearFeatureCenterline:[{x:0,z:-1},{x:0,z:1}],linearFeatureWidth:2,linearFeatureKind:'footway'};
    const camera=new THREE.PerspectiveCamera(45,1,.1,1000);
    camera.position.set(0,105,10);camera.lookAt(0,100,0);camera.updateMatrixWorld();mesh.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const appCtx={terrainEnabled:true,buildingMeshes:[],buildings:[],landuseMeshes:[],linearFeatureMeshes:[mesh],poiMeshes:[],streetFurnitureMeshes:[]};
    createTerrainReprojectionApi({appCtx,terrainMeshHeightAt:()=>100,cachedBaseTerrainHeight:()=>100}).repositionBuildingsWithTerrain();
    if(geometry.boundingSphere!==null)throw Error('Reprojected path retains stale culling bounds');
    geometry.boundingSphere=previousBounds;
    const staleBoundsVisible=frustum.intersectsObject(mesh);
    geometry.boundingSphere=null;
    const repairedBoundsVisible=frustum.intersectsObject(mesh);
    appCtx.linearWalkContactIndex.dispose();
    if(staleBoundsVisible||!repairedBoundsVisible)throw Error('Reprojected path visibility regression');
    return {engineRevision:THREE.REVISION,staleBoundsVisible,repairedBoundsVisible};
  } finally {
    geometry.dispose();material.dispose();
  }
}
