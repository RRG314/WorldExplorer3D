import { ctx as appCtx } from '../shared-context.js?v=55';
import { getAstronomicalBody } from '../astronomy/body-catalog.js?v=3';
import { disposeThreeObjectTree } from '../engine/webgl-lifecycle.js?v=2';

const BODY_STYLE = Object.freeze({
  jupiter: Object.freeze({ sky: 0x9f6a4d, haze: 0xd7a77c, deck: 0xc28e67, cloud: 0xf0d1ad }),
  saturn: Object.freeze({ sky: 0xa88b62, haze: 0xe5c994, deck: 0xcdb181, cloud: 0xf4dfb2 }),
  uranus: Object.freeze({ sky: 0x568f9b, haze: 0xa8e1e6, deck: 0x72bdc7, cloud: 0xc9f0ee }),
  neptune: Object.freeze({ sky: 0x1d376f, haze: 0x527fd1, deck: 0x294f9e, cloud: 0x8ab0ef })
});

let active = null;
// Sample the catalog cloud map on a sphere, using the flight's actual
// radial direction and altitude. No repeated tiles or camera-following floor.
function createAtmosphericSky(body, style) {
  const map = new THREE.TextureLoader().load(body.presentation.globalTexturePath);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      cloudMap: { value: map },
      viewToWorld: { value: new THREE.Matrix3() },
      radial: { value: new THREE.Vector3(0, 1, 0) },
      radiusM: { value: body.physical.meanRadiusM },
      relativeAltitude: { value: 20000 / (body.physical.meanRadiusM) },
      skyColor: { value: new THREE.Color(style.sky) },
      hazeColor: { value: new THREE.Color(style.haze) },
      immersion: { value: 0 }
    },
    vertexShader: `varying vec3 sight;
      void main() {
        // Model-view is calculated at JS double precision before reaching the
        // GPU. Subtracting two huge world positions in float loses the ray.
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        sight = view.xyz;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `precision highp float;
      varying vec3 sight;
      uniform sampler2D cloudMap;
      uniform mat3 viewToWorld;
      uniform vec3 radial, skyColor, hazeColor;
      uniform float relativeAltitude, immersion, radiusM;
      float cloudHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float cloudNoise(vec3 p) {
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(cloudHash(i),cloudHash(i+vec3(1,0,0)),f.x),mix(cloudHash(i+vec3(0,1,0)),cloudHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(cloudHash(i+vec3(0,0,1)),cloudHash(i+vec3(1,0,1)),f.x),mix(cloudHash(i+vec3(0,1,1)),cloudHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 ray = normalize(viewToWorld * sight);
        float altitude = max(relativeAltitude, 0.000005);
        vec3 origin = normalize(radial) * (1.0 + altitude);
        float b = dot(origin, ray);
        // Factored subtraction retains precision close to the cloud tops.
        float c = altitude * (2.0 + altitude);
        float discriminant = b*b-c;
        float elevation = dot(normalize(radial), ray);
        vec3 color = mix(hazeColor, skyColor, smoothstep(-0.02, 0.55, elevation));
        if (discriminant > 0.0 && b < 0.0) {
          float distance = c / (-b + sqrt(discriminant));
          vec3 point = normalize(origin + ray * distance);
          vec2 uv = vec2(fract(atan(point.z, -point.x) / 6.28318530718),
                         clamp(0.5 + asin(clamp(point.y, -1.0, 1.0)) / 3.14159265359, 0.001, 0.999));
          vec3 observed = pow(texture2D(cloudMap, uv).rgb, vec3(2.2));
          // A bounded cloud layer above the reference pressure surface.
          // Density is reconstructed below the map's resolution, not claimed
          // as measured weather. All samples remain fixed to body coordinates.
          float top=7000.0/radiusM;
          float outerC=(altitude-top)*(2.0+altitude+top);
          float outerDiscriminant=max(0.0,b*b-outerC);
          float entry=max(0.0,outerC/(-b+sqrt(outerDiscriminant)));
          float segment=max(0.0,distance-entry);
          float stepLength=segment/12.0;
          vec3 cloudLight=vec3(0.0);
          float transmission=1.0;
          for(int step=0;step<12;step++) {
            vec3 samplePoint=origin+ray*(entry+(float(step)+.5)*stepLength);
            float height=(length(samplePoint)-1.0)/top;
            vec3 q=samplePoint*(radiusM/11000.0);
            float broad=cloudNoise(q);
            float detail=cloudNoise(q*3.1+vec3(broad*2.0));
            float density=smoothstep(.34,.72,broad*.75+detail*.25);
            density*=1.0-smoothstep(.45,1.0,height);
            float alpha=1.0-exp(-density*stepLength*radiusM/1800.0);
            float shade=.5+.5*smoothstep(0.0,.8,height);
            vec3 lit=mix(observed,hazeColor*.8,.32)*shade;
            cloudLight+=transmission*alpha*lit;
            transmission*=1.0-alpha;
          }
          observed=cloudLight+transmission*observed*.6;
          float aerial = 1.0-exp(-distance*8.0);
          color = mix(observed, hazeColor, aerial*0.8);
        }
        color = mix(color, hazeColor, immersion);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 20), material);
  dome.name = 'spherical cloud atmosphere';
  dome.userData.imagery = body.id === 'jupiter' ? 'Hubble OPAL 2015; observed to 80 degrees; polar fill and local cloud detail modeled' : 'NASA/JPL synthesized map; not current observed weather';
  dome.renderOrder = -900;
  dome.frustumCulled = false;
  dome.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms.viewToWorld.value.setFromMatrix4(camera.matrixWorld);
  };
  return { dome, map };
}

function hideOrbitalPresentation() {
  const spaceBodies = appCtx.getAllSpaceBodies?.() || [];
  const solarBodyGroup = spaceBodies.find((body) => body?.mesh?.parent && body.mesh.parent !== appCtx.spaceFlight?.scene)?.mesh?.parent || null;
  const objects = [
    appCtx.spaceFlight?.celestialCatalog?.group,
    solarBodyGroup,
    appCtx.spaceFlight?.earth,
    appCtx.spaceFlight?.moon,
    appCtx.universeRuntime?.frameGroup,
    ...spaceBodies.map((body) => body?.mesh)
  ].filter(Boolean);
  const solarFrameWasVisible = solarBodyGroup?.visible !== false;
  const hidden = [...new Set(objects)].map((object) => {
    const visible = object.visible;
    object.visible = false;
    return { object, visible };
  });
  ['solarSystemScale', 'ssProximity', 'solarSystemInfo'].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    hidden.push({ object: element, visible: element.style.display });
    element.style.display = 'none';
  });
  if (typeof appCtx.setSolarSystemFrameVisibility === 'function') {
    appCtx.setSolarSystemFrameVisibility(false);
    hidden.push({ restore: () => appCtx.setSolarSystemFrameVisibility(solarFrameWasVisible) });
  }
  return hidden;
}

function ensureAtmosphericFlightPresentation(bodyId) {
  const scene = appCtx.spaceFlight?.scene;
  const rocket = appCtx.spaceFlight?.rocket;
  const style = BODY_STYLE[bodyId];
  if (!scene || !rocket || !style) return null;
  if (active?.bodyId === bodyId && active.group?.parent === scene) return active;
  releaseAtmosphericFlightPresentation();

  const group = new THREE.Group();
  group.name = `${bodyId} atmospheric flight volume`;
  const body = getAstronomicalBody(bodyId);
  const { dome, map } = createAtmosphericSky(body, style);
  group.add(dome);
  scene.add(group);
  active = { bodyId, group, dome, cloudTexture: map, body, hidden: hideOrbitalPresentation() };
  appCtx.spaceFlight.atmosphericPresentation = active;
  return active;
}

function updateAtmosphericFlightPresentation(bodyId, options = {}) {
  const presentation = ensureAtmosphericFlightPresentation(bodyId);
  const rocket = appCtx.spaceFlight?.rocket;
  if (!presentation || !rocket) return false;
  presentation.group.position.copy(rocket.position);
  const uniforms = presentation.dome.material.uniforms;
  const radial = options.radial || { x: 0, y: 1, z: 0 };
  uniforms.radial.value.set(Number(radial.x) || 0, Number(radial.y) || 0, Number(radial.z) || 0);
  if (uniforms.radial.value.lengthSq() < 1e-12) uniforms.radial.value.set(0, 1, 0);
  uniforms.radial.value.normalize();
  const altitudeM = Number.isFinite(options.altitudeM) ? options.altitudeM : 20000;
  uniforms.relativeAltitude.value = altitudeM / (presentation.body.physical.meanRadiusM);
  uniforms.immersion.value = Math.min(0.96, Math.max(0, -altitudeM / 25000));
  return true;
}

function releaseAtmosphericFlightPresentation() {
  if (!active) return false;
  active.hidden?.forEach(({ object, visible, restore }) => {
    if (typeof restore === 'function') {
      restore();
      return;
    }
    if (!object) return;
    if (typeof HTMLElement !== 'undefined' && object instanceof HTMLElement) object.style.display = visible;
    else object.visible = visible;
  });
  active.group?.parent?.remove?.(active.group);
  active.cloudTexture?.dispose();
  if (active.group) disposeThreeObjectTree(active.group);
  if (appCtx.spaceFlight) appCtx.spaceFlight.atmosphericPresentation = null;
  active = null;
  return true;
}

export {
  ensureAtmosphericFlightPresentation,
  releaseAtmosphericFlightPresentation,
  updateAtmosphericFlightPresentation
};
