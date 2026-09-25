// Procedural metre-scale regolith/ice variation below the resolution of the
// mission map. This changes shading only; collision height remains authoritative.
export function addSurfaceMaterialDetail(material, strength = 0.22) {
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceDetailStrength = { value: strength };
    shader.vertexShader = 'varying vec3 surfaceDetailPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfaceDetailPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 surfaceDetailPosition;
      uniform float surfaceDetailStrength;
      float terrainHash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float terrainNoise(vec2 p) {
        vec2 cell=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(terrainHash(cell),terrainHash(cell+vec2(1,0)),f.x),mix(terrainHash(cell+vec2(0,1)),terrainHash(cell+vec2(1,1)),f.x),f.y);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float viewDistance=length(cameraPosition-surfaceDetailPosition);
      float broad=terrainNoise(surfaceDetailPosition.xz*0.018);
      float granular=terrainNoise(surfaceDetailPosition.xz*1.6);
      float fineVisibility=1.0-smoothstep(25.0,180.0,viewDistance);
      float detail=(broad-0.5)*0.65+(granular-0.5)*fineVisibility;
      diffuseColor.rgb *= 1.0 + detail*surfaceDetailStrength;
    `);
  };
  material.customProgramCacheKey = () => 'planetary-metre-detail-v1';
  return material;
}
