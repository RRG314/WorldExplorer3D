export function applyFacadeWallMask(material, roofColor = 0x777777) {
  if (!material?.map || typeof THREE === 'undefined') return material;

  const resolvedRoofColor = new THREE.Color(roofColor);
  material.userData = {
    ...(material.userData || {}),
    facadeWallsOnly: true,
    facadeRoofColor: resolvedRoofColor.getHex()
  };

  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.call(material, shader, renderer);
    shader.uniforms.weFacadeRoofColor = { value: resolvedRoofColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWeFacadeSide;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvWeFacadeSide = 1.0 - smoothstep(0.72, 0.94, abs(objectNormal.y));'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vWeFacadeSide;\nuniform vec3 weFacadeRoofColor;'
      )
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n' +
        '  vec4 texelColor = texture2D(map, vUv);\n' +
        '  texelColor = mapTexelToLinear(texelColor);\n' +
        '  texelColor.rgb = mix(weFacadeRoofColor, texelColor.rgb, vWeFacadeSide);\n' +
        '  diffuseColor *= texelColor;\n' +
        '#endif'
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey?.() || ''}|we3d-facade-wall-v1`;
  material.needsUpdate = true;
  return material;
}

export function restoreFacadeWallMask(material) {
  if (!material?.userData?.facadeWallsOnly) return material;
  return applyFacadeWallMask(material, material.userData.facadeRoofColor);
}
