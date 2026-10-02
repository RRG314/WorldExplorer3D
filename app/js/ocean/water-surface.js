import {sampleDynamicWaterAt} from '../boat-mode/water-query.js?v=21';
import {registerWaterWaveMaterial} from '../world/water-materials.js?v=5';
import {createWaterPatchGeometry} from '../world/water-patch-geometry.js?v=1';
import {buildBoatWaveProfile,applyWaveUniformsToMaterial} from '../boat-mode/surface-effects.js?v=18';

export function createOceanWaterSurface(ctx,mode,sampleSeabedEvidence) {
 const body={waterKind:'open_ocean',surfaceY:.08,id:'active-ocean-volume',
   datum:{id:'engine_local_world_y_v1',method:'game-sea-level'},provenance:{dataset:'admitted-ocean-gameplay'}};
 const candidate={source:body,waterKind:'open_ocean',surfaceY:.08};
 const material=new THREE.MeshBasicMaterial({color:0x235e79,side:THREE.DoubleSide});
 registerWaterWaveMaterial(material,{waterBody:body,waterKind:'open_ocean',track:false});
 const mesh=new THREE.Mesh(createWaterPatchGeometry(THREE,2400),material);
 mesh.name='OceanWaterSurface';mesh.position.y=.08;mesh.frustumCulled=false;
 function sample(x,z,options={}){
   body.waveOffset=mode.waveOffset || {x:0,z:0};
   const seabed=sampleSeabedEvidence(x,z);
   return sampleDynamicWaterAt(x,z,candidate,{...options,bottomY:seabed.presentationWorldY,depthEvidence:seabed.bathymetry});
 }
 function update(time){
   body.waveOffset=mode.waveOffset || {x:0,z:0};
   mesh.position.set(mode.submarine.position.x,.08,mode.submarine.position.z);
   applyWaveUniformsToMaterial(material,buildBoatWaveProfile(material,undefined,time));
 }
 return {mesh,sample,update};
}
