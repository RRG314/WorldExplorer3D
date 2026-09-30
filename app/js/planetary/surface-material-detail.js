// Procedural metre-scale regolith/ice variation below the resolution of the
// mission map. This changes shading only; collision height remains authoritative.
export function addSurfaceMaterialDetail(material, strength = 0.22) {
  material.extensions = { ...material.extensions, derivatives: true };
  material.onBeforeCompile = shader => {
    shader.uniforms.surfaceDetailStrength = { value: strength };
    shader.vertexShader = 'varying vec3 surfaceDetailPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsurfaceDetailPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 surfaceDetailPosition;
      uniform float surfaceDetailStrength;
      float terrainHash(vec2 p) {vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float terrainNoise(vec2 p) {
        vec2 cell=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(terrainHash(cell),terrainHash(cell+vec2(1,0)),f.x),mix(terrainHash(cell+vec2(0,1)),terrainHash(cell+vec2(1,1)),f.x),f.y);
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float viewDistance=length(cameraPosition-surfaceDetailPosition);
      float broad=terrainNoise(surfaceDetailPosition.xz*0.018);
      float granular=terrainNoise(surfaceDetailPosition.xz*1.6);
      float footprint=max(length(dFdx(surfaceDetailPosition.xz)),length(dFdy(surfaceDetailPosition.xz)));
      float fineVisibility=(1.0-smoothstep(25.0,180.0,viewDistance))*(1.0-smoothstep(.15,.65,footprint));
      float detail=(broad-0.5)*0.65+(granular-0.5)*fineVisibility;
      diffuseColor.rgb *= 1.0 + detail*surfaceDetailStrength;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      // Derivative bump mapping adds sub-grid regolith/ice relief without
      // treating a mission color map as an elevation measurement.
      float localRange=1.0-smoothstep(60.0,450.0,length(cameraPosition-surfaceDetailPosition));
      float footprintBump=max(length(dFdx(surfaceDetailPosition.xz)),length(dFdy(surfaceDetailPosition.xz)));
      float grainHeight=terrainNoise(surfaceDetailPosition.xz*.7)*.045*(1.0-smoothstep(.4,1.5,footprintBump))
                      +terrainNoise(surfaceDetailPosition.xz*.13)*.12*(1.0-smoothstep(2.0,8.0,footprintBump));
      vec3 sigmaX=dFdx(-vViewPosition), sigmaY=dFdy(-vViewPosition);
      vec3 terrainCrossX=cross(sigmaY,normal), terrainCrossY=cross(normal,sigmaX);
      float determinant=dot(sigmaX,terrainCrossX);
      vec3 gradient=sign(determinant)*(dFdx(grainHeight)*terrainCrossX+dFdy(grainHeight)*terrainCrossY);
      normal=normalize(abs(determinant)*normal-gradient*localRange);
    `);
  };
  material.customProgramCacheKey = () => 'planetary-metre-detail-v3';
  return material;
}
