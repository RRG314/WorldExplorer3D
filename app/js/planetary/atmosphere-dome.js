const PROFILES = Object.freeze({
  mars: Object.freeze({
    zenith: 0x4d2525,
    midSky: 0x96513c,
    horizon: 0xd58a61,
    sunGlow: 0xffcf9e,
    opacity: 0.9
  })
});

function makeAtmosphereMaterial(profile) {
  return new THREE.ShaderMaterial({
    uniforms: {
      zenithColor: { value: new THREE.Color(profile.zenith) },
      midSkyColor: { value: new THREE.Color(profile.midSky) },
      horizonColor: { value: new THREE.Color(profile.horizon) },
      sunGlowColor: { value: new THREE.Color(profile.sunGlow) },
      sunDirection: { value: new THREE.Vector3(-0.5, 0.72, 0.38).normalize() },
      opacity: { value: profile.opacity }
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 zenithColor;
      uniform vec3 midSkyColor;
      uniform vec3 horizonColor;
      uniform vec3 sunGlowColor;
      uniform vec3 sunDirection;
      uniform float opacity;
      varying vec3 vDirection;

      void main() {
        float elevation = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        float horizonBlend = smoothstep(0.0, 0.24, elevation);
        float zenithBlend = smoothstep(0.34, 0.92, elevation);
        vec3 sky = mix(horizonColor, midSkyColor, horizonBlend);
        sky = mix(sky, zenithColor, zenithBlend);
        float sunAmount = pow(max(dot(normalize(vDirection), normalize(sunDirection)), 0.0), 42.0);
        sky = mix(sky, sunGlowColor, sunAmount * 0.52);
        float alpha = opacity * (0.72 + (1.0 - zenithBlend) * 0.24);
        gl_FragColor = vec4(sky, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
}

function ensurePlanetaryAtmosphere(scene, body) {
  const profile = PROFILES[body];
  if (!scene || !profile) return null;
  const existing = scene.getObjectByName(`Planetary atmosphere: ${body}`);
  if (existing) return existing;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(11000, 40, 24),
    makeAtmosphereMaterial(profile)
  );
  dome.name = `Planetary atmosphere: ${body}`;
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  dome.userData = {
    planetaryBody: body,
    accuracy: 'atmospheric display model; catalog sky directions remain separate'
  };
  scene.add(dome);
  return dome;
}

function updatePlanetaryAtmosphere(dome, camera, sunPosition) {
  if (!dome?.visible || !camera) return;
  dome.position.copy(camera.position);
  if (sunPosition?.isVector3) {
    dome.material.uniforms.sunDirection.value.copy(sunPosition).sub(camera.position).normalize();
  }
}

export { ensurePlanetaryAtmosphere, updatePlanetaryAtmosphere };
