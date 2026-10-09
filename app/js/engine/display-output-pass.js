// r128 renders the scene into a linear EffectComposer target. Its bloom and
// SMAA passes do not encode the final pixels for the display. Do that exactly
// once, after all effects. Scene materials already applied tone mapping.
export function createDisplayOutputPass(THREE) {
  const pass = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tDiffuse, vUv);
        #include <encodings_fragment>
      }`
  });
  pass.material.name = 'World Explorer display output';
  pass.material.toneMapped = false;
  return pass;
}
