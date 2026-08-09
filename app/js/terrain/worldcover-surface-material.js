function sampleWorldCoverScalarAtUv(values, size, u, v) {
  const sourceX = Math.max(0, Math.min(size - 1, u * (size - 1)));
  const sourceY = Math.max(0, Math.min(size - 1, (1 - v) * (size - 1)));
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;
  const north = values[y0 * size + x0] * (1 - tx) + values[y0 * size + x1] * tx;
  const south = values[y1 * size + x0] * (1 - tx) + values[y1 * size + x1] * tx;
  return (north * (1 - ty) + south * ty) / 255;
}

function replaceShaderChunk(source, marker, replacement, injection, key) {
  const next = source.replace(marker, replacement);
  injection[key] = next !== source;
  return next;
}

export function applyWorldCoverBuiltSurfaceMaterial(mesh, result, builtTextures) {
  const geometry = mesh?.geometry;
  const material = mesh?.material;
  const uvs = geometry?.attributes?.uv;
  const weights = result?.surfaceBuiltWeights;
  const size = Number(result?.surfaceBuiltWeightSize || 0);
  if (!geometry || !uvs || !material || !weights || size < 2 || !builtTextures?.map) return false;

  const attribute = new Float32Array(uvs.count);
  let weakestWeight = 1;
  let strongestWeight = 0;
  let builtVertexCount = 0;
  let naturalVertexCount = 0;
  for (let index = 0; index < uvs.count; index += 1) {
    const weight = sampleWorldCoverScalarAtUv(weights, size, uvs.getX(index), uvs.getY(index));
    attribute[index] = weight;
    weakestWeight = Math.min(weakestWeight, weight);
    strongestWeight = Math.max(strongestWeight, weight);
    if (weight >= 0.8) builtVertexCount += 1;
    if (weight <= 0.2) naturalVertexCount += 1;
  }
  geometry.setAttribute('surfaceBuiltWeight', new THREE.Float32BufferAttribute(attribute, 1));
  geometry.attributes.surfaceBuiltWeight.needsUpdate = true;
  if (strongestWeight <= 0.001) return false;

  material.onBeforeCompile = (shader) => {
    const injection = {
      vertexDeclaration: false,
      vertexAssignment: false,
      fragmentDeclaration: false,
      diffuseBlend: false,
      normalBlend: false,
      roughnessBlend: false
    };
    shader.uniforms.surfaceBuiltMap = { value: builtTextures.map };
    shader.uniforms.surfaceBuiltNormalMap = { value: builtTextures.normalMap || material.normalMap };
    shader.uniforms.surfaceBuiltRoughnessMap = { value: builtTextures.roughnessMap || material.roughnessMap };
    shader.vertexShader = replaceShaderChunk(
      shader.vertexShader,
      '#include <common>',
      '#include <common>\nattribute float surfaceBuiltWeight;\nvarying float vSurfaceBuiltWeight;',
      injection,
      'vertexDeclaration'
    );
    shader.vertexShader = replaceShaderChunk(
      shader.vertexShader,
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSurfaceBuiltWeight = surfaceBuiltWeight;',
      injection,
      'vertexAssignment'
    );
    shader.fragmentShader = replaceShaderChunk(
      shader.fragmentShader,
      '#include <common>',
      '#include <common>\nuniform sampler2D surfaceBuiltMap;\nuniform sampler2D surfaceBuiltNormalMap;\nuniform sampler2D surfaceBuiltRoughnessMap;\nvarying float vSurfaceBuiltWeight;\nfloat surfaceBuiltBlend() { return smoothstep(0.18, 0.72, vSurfaceBuiltWeight); }',
      injection,
      'fragmentDeclaration'
    );
    shader.fragmentShader = replaceShaderChunk(
      shader.fragmentShader,
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 naturalTexelColor = mapTexelToLinear(texture2D(map, vUv));
        vec4 builtTexelColor = mapTexelToLinear(texture2D(surfaceBuiltMap, vUv));
        diffuseColor *= mix(naturalTexelColor, builtTexelColor, surfaceBuiltBlend());
      #endif`,
      injection,
      'diffuseBlend'
    );
    shader.fragmentShader = replaceShaderChunk(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#ifdef OBJECTSPACE_NORMALMAP
        vec3 naturalMapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
        vec3 builtMapN = texture2D(surfaceBuiltNormalMap, vUv).xyz * 2.0 - 1.0;
        normal = normalize(mix(naturalMapN, builtMapN, surfaceBuiltBlend()));
        #ifdef FLIP_SIDED
          normal = -normal;
        #endif
        #ifdef DOUBLE_SIDED
          normal = normal * faceDirection;
        #endif
        normal = normalize(normalMatrix * normal);
      #elif defined(TANGENTSPACE_NORMALMAP)
        vec3 naturalMapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
        vec3 builtMapN = texture2D(surfaceBuiltNormalMap, vUv).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(mix(naturalMapN, builtMapN, surfaceBuiltBlend()));
        mapN.xy *= normalScale;
        #ifdef USE_TANGENT
          normal = normalize(vTBN * mapN);
        #else
          normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);
        #endif
      #elif defined(USE_BUMPMAP)
        normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
      #endif`,
      injection,
      'normalBlend'
    );
    shader.fragmentShader = replaceShaderChunk(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        float naturalRoughness = texture2D(roughnessMap, vUv).g;
        float builtRoughness = texture2D(surfaceBuiltRoughnessMap, vUv).g;
        roughnessFactor *= mix(naturalRoughness, builtRoughness, surfaceBuiltBlend());
      #endif`,
      injection,
      'roughnessBlend'
    );
    mesh.userData.worldCoverBuiltBlend = {
      ...mesh.userData.worldCoverBuiltBlend,
      shaderCompiled: true,
      shaderInjection: injection
    };
  };
  material.customProgramCacheKey = () => 'worldcover-built-surface-blend-v2';
  material.needsUpdate = true;
  mesh.userData.worldCoverBuiltBlend = {
    mode: 'terrain-shader',
    minWeight: weakestWeight,
    maxWeight: strongestWeight,
    builtVertexCount,
    naturalVertexCount,
    shaderCompiled: false,
    shaderInjection: null
  };
  return true;
}
