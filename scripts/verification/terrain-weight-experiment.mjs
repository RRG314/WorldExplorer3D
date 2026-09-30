// Verification only. Keep explicit UV derivatives outside each weight branch;
// texture filtering at semantic boundaries must not depend on lane divergence.
export function installTerrainWeightExperiment(ctx) {
  if(!ctx.renderer.capabilities.isWebGL2)throw Error('This diagnostic requires WebGL2');
  const entries=[];let enabled=false;
  const weights='float terrainSnowWeight = clamp(vTerrainSurfaceMixB.y, 0.0, 1.0);\nfloat terrainClassWeight = clamp(dot(vTerrainSurfaceMixA, vec4(1.0)) + vTerrainSurfaceMixB.x + terrainSnowWeight, 0.0, 1.0);';
  const calls=[
    ['map, vUv','1.0 - terrainClassWeight'],
    ['map, groundPoint * 0.007','1.0 - terrainClassWeight'],
    ['terrainUrbanMap, groundPoint / 5.0','vTerrainSurfaceMixA.x'],
    ['terrainSandMap, groundPoint / 6.0','vTerrainSurfaceMixA.y'],
    ['terrainSandMap, mat2(0.8, -0.6, 0.6, 0.8) * groundPoint / 8.226 + vec2(0.37, 0.19)','vTerrainSurfaceMixA.y'],
    ['terrainForestMap, groundPoint / 4.0','vTerrainSurfaceMixA.z'],
    ['terrainSoilMap, groundPoint / 5.0','vTerrainSurfaceMixA.w'],
    ['terrainSnowMap, snowPoint','terrainSnowWeight'],
    ['terrainSnowMap, mat2(0.8, -0.6, 0.6, 0.8) * snowPoint * 1.371 + vec2(0.37, 0.19)','terrainSnowWeight'],
    ['terrainSnowMap, mat2(0.8, -0.6, 0.6, 0.8) * snowPoint * 0.073','terrainSnowWeight']
  ];
  const helper=`vec4 we3dWeightedTerrain(sampler2D image,vec2 uv,float weight){
    vec2 dx=dFdx(uv),dy=dFdy(uv);
    if(weight>0.0)return texture2DGradEXT(image,uv,dx,dy);
    return vec4(0.0);
  }\n`;
  const materials=new Set();ctx.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.userData?.terrainSurfaceMaterialBlend)materials.add(m);});
  for(const material of materials){
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
    material.onBeforeCompile=function(shader,renderer){
      compile.call(this,shader,renderer);
      if(!enabled)return;
      let source=shader.fragmentShader;
      if(!source.includes(weights))throw Error('Terrain weight declarations changed');
      source=source.replace(weights,'').replace('vec4 terrainGrassColor =',weights+'\nvec4 terrainGrassColor =');
      for(const [args,weight]of calls){const needle='texture2D('+args+')';if(!source.includes(needle))throw Error('Terrain sample changed: '+needle);source=source.replace(needle,'we3dWeightedTerrain('+args+','+weight+')');}
      shader.fragmentShader=helper+source;
    };
    material.customProgramCacheKey=function(){return key.call(this)+(enabled?':weighted-terrain-experiment':'');};
    entries.push({material,compile,key});
  }
  return {count:entries.length,setEnabled(value){enabled=value;for(const {material}of entries)material.needsUpdate=true;},dispose(){for(const {material,compile,key}of entries){material.onBeforeCompile=compile;material.customProgramCacheKey=key;material.needsUpdate=true;}}};
}
