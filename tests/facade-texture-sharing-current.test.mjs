import test from 'node:test';
import assert from 'node:assert/strict';
import {getBuildingMaterial,facadeTextureProjection,clearBuildingExteriorMaterialPool,buildingExteriorMaterialPoolSnapshot} from '../app/js/engine/building-facade-materials.js';

test('four facade phases share one image while preserving independent shader projections and disposal',t=>{
 const old=globalThis.THREE,loaded=[];
 class Color{constructor(value){this.value=value;}getHexString(){return String(this.value);}}
 class Vector4{constructor(...values){this.values=values;}}
 class Material{constructor(values){Object.assign(this,values);}dispose(){this.disposed=true;}}
 class Loader{load(url){const texture={url,repeat:{x:1,y:1},offset:{x:0,y:0},dispose(){this.disposals=(this.disposals||0)+1;}};loaded.push(texture);return texture;}}
 globalThis.THREE={Color,Vector4,MeshStandardMaterial:Material,TextureLoader:Loader};
 t.after(()=>{clearBuildingExteriorMaterialPool();globalThis.THREE=old;});
 const materials=[];
 for(const lodTier of ['near','mid'])for(let facadeVariant=0;facadeVariant<4;facadeVariant++){
  const projection=facadeTextureProjection('brick','townhouse',facadeVariant,lodTier);
  const resolvedPresentation={mappedFamily:false,mappedColor:false,materialId:'brick',catalogMaterial:{texture:'brick'},exteriorProfile:{category:'residential',storefrontStyle:'none',familyId:'test'},family:'brick',profile:{roughness:.9,metalness:0},lodTier,presentation:{facadeStyle:'townhouse'},roof:{key:'roof',metalness:0,colorA:0,colorB:0},facadeStyle:'townhouse',facadeAtlasStyle:'brick',facadeVariant,lodTextureId:'brick',textureProjectionStyle:'townhouse',tintHex:123};
  const material=getBuildingMaterial({},'house',facadeVariant,0,{resolvedPresentation});
  const shader={uniforms:{},vertexShader:'',fragmentShader:''};material.onBeforeCompile(shader);
  assert.deepEqual(shader.uniforms.facadeProjection.value.values,projection);
  assert.deepEqual(material.userData.facadeProjection,projection);
  materials.push(material);
 }
 assert.equal(new Set(materials.map(m=>m.map)).size,1);
 assert.equal(buildingExteriorMaterialPoolSnapshot().textures.length,1);
 assert.equal(loaded.length,2,'one facade image and one entrance atlas');
 assert.notDeepEqual(materials[0].userData.facadeProjection,materials[1].userData.facadeProjection);
 assert.equal(materials[4].userData.facadeProjection[3],0,'distant storeys retain vertical alignment');
 clearBuildingExteriorMaterialPool();assert.ok(loaded.every(texture=>texture.disposals===1));
});
