const FAR_FACADE_ATLAS_URL = '/app/assets/textures/facades/neutral-urban-v1.webp';
let farFacadeAtlas = null;

function sharedFarFacadeAtlas() {
  if (farFacadeAtlas) return farFacadeAtlas;
  farFacadeAtlas = new THREE.TextureLoader().load(FAR_FACADE_ATLAS_URL);
  farFacadeAtlas.name = 'far-building-shared-neutral-facade-atlas';
  farFacadeAtlas.wrapS = THREE.RepeatWrapping;
  farFacadeAtlas.wrapT = THREE.RepeatWrapping;
  farFacadeAtlas.colorSpace = THREE.SRGBColorSpace;
  farFacadeAtlas.anisotropy = 4;
  return farFacadeAtlas;
}

function applyFarBuildingFacadeDetail(material) {
  if (!material || typeof material !== 'object') return material;
  const facadeAtlas = sharedFarFacadeAtlas();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.farFacadeAtlas = { value: facadeAtlas };
    shader.vertexShader = [
      'varying vec3 vFarBuildingWorldPosition;',
      'varying float vFarBuildingWallMask;',
      shader.vertexShader
    ].join('\n');
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      [
        '#include <beginnormal_vertex>',
        'vFarBuildingWallMask = smoothstep(0.24, 0.78, 1.0 - abs(objectNormal.y));'
      ].join('\n')
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      [
        '#include <worldpos_vertex>',
        'vFarBuildingWorldPosition = worldPosition.xyz;'
      ].join('\n')
    );
    shader.fragmentShader = [
      'varying vec3 vFarBuildingWorldPosition;',
      'varying float vFarBuildingWallMask;',
      'uniform sampler2D farFacadeAtlas;',
      'float farFacadeHash(vec2 p) {',
      '  return fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453);',
      '}',
      shader.fragmentShader
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      [
        '#include <color_fragment>',
        'float farFacadeHorizontal = vFarBuildingWorldPosition.x * 0.73 + vFarBuildingWorldPosition.z * 0.68;',
        'vec2 farFacadeGrid = vec2(farFacadeHorizontal / 3.4, vFarBuildingWorldPosition.y / 3.15);',
        'vec2 farFacadeCell = abs(fract(farFacadeGrid) - 0.5);',
        'vec2 farFacadeAa = max(fwidth(farFacadeGrid) * 0.85, vec2(0.012));',
        'float farFacadeColumn = 1.0 - smoothstep(0.31 - farFacadeAa.x, 0.31 + farFacadeAa.x, farFacadeCell.x);',
        'float farFacadeRow = 1.0 - smoothstep(0.27 - farFacadeAa.y, 0.27 + farFacadeAa.y, farFacadeCell.y);',
        'float farFacadeWindow = farFacadeColumn * farFacadeRow * vFarBuildingWallMask;',
        // Window-scale detail aliases into a flat pale wall at the aerial
        // distances used to explore a whole city. Preserve the same facade
        // owner and blend to a larger, antialiased floor/bay pattern instead
        // of publishing a second building renderer.
        'vec2 farFacadeMacroGrid = vec2(farFacadeHorizontal / 13.6, vFarBuildingWorldPosition.y / 12.6);',
        'vec2 farFacadeMacroCell = abs(fract(farFacadeMacroGrid) - 0.5);',
        'vec2 farFacadeMacroAa = max(fwidth(farFacadeMacroGrid), vec2(0.008));',
        'float farFacadeMacroColumn = 1.0 - smoothstep(0.34 - farFacadeMacroAa.x, 0.34 + farFacadeMacroAa.x, farFacadeMacroCell.x);',
        'float farFacadeMacroRow = 1.0 - smoothstep(0.30 - farFacadeMacroAa.y, 0.30 + farFacadeMacroAa.y, farFacadeMacroCell.y);',
        'float farFacadeMacroWindow = farFacadeMacroColumn * farFacadeMacroRow * vFarBuildingWallMask;',
        'float farFacadePixelFootprint = max(fwidth(farFacadeGrid.x), fwidth(farFacadeGrid.y));',
        'float farFacadeAerialLod = smoothstep(0.18, 0.82, farFacadePixelFootprint);',
        'farFacadeWindow = mix(farFacadeWindow, farFacadeMacroWindow, farFacadeAerialLod);',
        'float farFacadeDistanceFade = 1.0 - smoothstep(16000.0, 22000.0, distance(cameraPosition, vFarBuildingWorldPosition));',
        // Match the neutral atlas and meter scale used by the shared near/mid
        // facade owner. World projection lets both merged and instanced far
        // geometry use the asset without creating a second render system.
        'vec2 farFacadeAtlasUv = vec2(farFacadeHorizontal * 0.08, vFarBuildingWorldPosition.y / 16.0);',
        'vec3 farFacadeAtlasColor = sRGBToLinear(texture2D(farFacadeAtlas, farFacadeAtlasUv)).rgb;',
        'float farFacadeAtlasLod = (1.0 - smoothstep(0.32, 1.05, farFacadePixelFootprint)) * farFacadeDistanceFade;',
        'float farFacadeAtlasBlend = vFarBuildingWallMask * farFacadeAtlasLod * 0.82;',
        'vec3 farFacadeTintedAtlas = farFacadeAtlasColor * mix(vec3(0.82), diffuseColor.rgb * 1.22, 0.38);',
        'diffuseColor.rgb = mix(diffuseColor.rgb, farFacadeTintedAtlas, farFacadeAtlasBlend);',
        'float farFacadeVariation = farFacadeHash(farFacadeGrid);',
        'vec3 farFacadeGlass = mix(vec3(0.035, 0.075, 0.105), vec3(0.12, 0.20, 0.25), farFacadeVariation);',
        // Roofs remain light enough to read from above, while walls retain
        // enough contrast for the city to look constructed instead of like a
        // field of untextured white blocks.
        'float farFacadeWallTone = mix(1.0, 0.62, vFarBuildingWallMask * farFacadeAerialLod);',
        'diffuseColor.rgb *= farFacadeWallTone;',
        'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.28 + farFacadeGlass * 0.72, farFacadeWindow * farFacadeDistanceFade * 0.82);'
      ].join('\n')
    );
  };
  material.customProgramCacheKey = () => 'far-building-facade-detail-v4-shared-atlas';
  material.userData = {
    ...(material.userData || {}),
    farBuildingFacadeDetail: 'world-space-distance-adaptive-window-grid',
    farBuildingFacadeOwner: 'terrain/far-building-facade-material',
    farBuildingFacadeCoverage: 'entire-fixed-map',
    farBuildingFacadeAtlas: FAR_FACADE_ATLAS_URL,
    farBuildingFacadeAtlasMode: 'shared-neutral-urban-atlas'
  };
  return material;
}

export { applyFarBuildingFacadeDetail };
