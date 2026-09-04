const SOLAR_MASS_KG = 1.98847e30;
const GRAVITATIONAL_CONSTANT = 6.6743e-11;
const LIGHT_SPEED_MPS = 299792458;

const _toHole = new THREE.Vector3();
const _cameraLocal = new THREE.Vector3();

function physicalSchwarzschildRadiusKm(massSolar) {
  const massKg = Math.max(1, Number(massSolar) || 1) * SOLAR_MASS_KG;
  return 2 * GRAVITATIONAL_CONSTANT * massKg / (LIGHT_SPEED_MPS * LIGHT_SPEED_MPS) / 1000;
}

function makeAccretionMaterial(color, visualRadius) {
  return new THREE.ShaderMaterial({
    uniforms: {
      diskColor: { value: new THREE.Color(color || 0xffa45c) },
      time: { value: 0 },
      cameraLocal: { value: new THREE.Vector3(0, 4, 12) },
      visualRadius: { value: visualRadius }
    },
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 diskColor;
      uniform float time;
      uniform vec3 cameraLocal;
      uniform float visualRadius;
      varying vec3 vLocal;

      void main() {
        float radius = length(vLocal.xy) / visualRadius;
        float normalizedRadius = clamp((radius - 3.0) / 9.0, 0.0, 1.0);
        float angle = atan(vLocal.y, vLocal.x);
        float spiral = sin(radius * 7.0 - time * 2.4 + sin(angle * 5.0 - time) * 0.7);
        float turbulence = sin(angle * 17.0 + radius * 2.3 - time * 1.7) *
          sin(angle * 7.0 - radius * 5.1 + time * 0.9);
        float filaments = smoothstep(0.38, 0.96, abs(sin(angle * 11.0 + radius * 4.6 - time * 1.2)));
        float band = 0.7 + 0.17 * spiral + 0.1 * turbulence + 0.12 * filaments;
        float edge = smoothstep(3.0, 3.35, radius) * (1.0 - smoothstep(11.2, 12.0, radius));

        // Schwarzschild gravitational redshift, evaluated in units of Rs.
        float redshift = sqrt(max(0.0, 1.0 - 1.0 / max(radius, 1.001)));
        vec2 tangent = normalize(vec2(-vLocal.y, vLocal.x));
        vec2 viewDir = normalize(cameraLocal.xy + vec2(0.0001));
        float orbitalBeta = min(0.48, sqrt(0.5 / max(radius, 3.0)));
        float doppler = pow(max(0.45, 1.0 + orbitalBeta * dot(tangent, viewDir)), 3.0);
        float heat = 1.0 - normalizedRadius;
        vec3 hotColor = mix(diskColor * 0.45, vec3(1.0, 0.94, 0.78), heat * heat);
        vec3 finalColor = hotColor * band * redshift * doppler;
        gl_FragColor = vec4(finalColor, edge * (0.42 + heat * 0.48) * (0.82 + filaments * 0.18));
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createBlackHoleVisual(entity, visualRadius = 115) {
  const group = new THREE.Group();
  group.name = entity.name;
  group.userData = { universeEntityId: entity.id, isBlackHole: true };

  const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches === true;
  const sphereWidth = mobile ? 48 : 80;
  const sphereHeight = mobile ? 32 : 56;
  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(visualRadius, sphereWidth, sphereHeight),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  horizon.name = 'Event horizon';
  group.add(horizon);

  const shadow = new THREE.Mesh(
    new THREE.SphereGeometry(visualRadius * 1.82, sphereWidth, sphereHeight),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.98, depthWrite: true })
  );
  shadow.name = 'Gravitationally enlarged event-horizon shadow';
  group.add(shadow);

  const photonShell = new THREE.Mesh(
    new THREE.SphereGeometry(visualRadius * 1.94, sphereWidth, sphereHeight),
    new THREE.MeshBasicMaterial({
      color: entity.visualProfile?.diskColor || 0xffa45c,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  photonShell.name = 'Photon sphere glow';
  group.add(photonShell);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(visualRadius * 1.92, visualRadius * 0.028, mobile ? 10 : 16, mobile ? 128 : 224),
    new THREE.MeshBasicMaterial({
      color: 0xfff0cb,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  ring.name = 'Photon ring';
  group.add(ring);

  const diskGeometry = new THREE.RingGeometry(
    visualRadius * 3,
    visualRadius * 12,
    mobile ? 128 : 256,
    mobile ? 12 : 28
  );
  const diskMaterial = makeAccretionMaterial(entity.visualProfile?.diskColor, visualRadius);
  const disk = new THREE.Mesh(diskGeometry, diskMaterial);
  disk.name = 'Accretion disk';
  const inclination = Number(entity.visualProfile?.diskInclinationDeg || 0) * Math.PI / 180;
  disk.rotation.x = inclination;
  disk.renderOrder = 4;
  group.add(disk);

  const lensArcMaterial = new THREE.MeshBasicMaterial({
    color: entity.visualProfile?.diskColor || 0xffa45c,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lensArc = new THREE.Mesh(
    new THREE.TorusGeometry(visualRadius * 1.72, visualRadius * 0.018, 8, 128),
    lensArcMaterial
  );
  lensArc.name = 'Lensed far-side disk light';
  lensArc.rotation.x = inclination;
  group.add(lensArc);

  const lensMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd19a,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const upperLens = new THREE.Mesh(
    new THREE.TorusGeometry(visualRadius * 2.16, visualRadius * 0.045, mobile ? 8 : 12, mobile ? 72 : 128, Math.PI),
    lensMaterial
  );
  upperLens.name = 'Upper lensed accretion-disk image';
  upperLens.position.y = visualRadius * 0.58;
  const lowerLens = upperLens.clone();
  lowerLens.name = 'Lower lensed accretion-disk image';
  lowerLens.position.y = -visualRadius * 0.58;
  lowerLens.rotation.z = Math.PI;
  lowerLens.material = lensMaterial.clone();
  lowerLens.material.opacity = 0.3;
  group.add(upperLens, lowerLens);

  const catalogRs = Number(entity.physical?.schwarzschildRadiusKm);
  const calculatedRs = physicalSchwarzschildRadiusKm(entity.physical?.massSolar);
  group.userData.blackHole = {
    entity,
    visualRadius,
    schwarzschildRadiusKm: Number.isFinite(catalogRs) ? catalogRs : calculatedRs,
    photonSphereRadiusKm: (Number.isFinite(catalogRs) ? catalogRs : calculatedRs) * 1.5,
    iscoRadiusKm: (Number.isFinite(catalogRs) ? catalogRs : calculatedRs) * 3,
    disk,
    horizon,
    shadow,
    photonShell,
    ring,
    lensArc,
    upperLens,
    lowerLens,
    qualityTier: mobile ? 'mobile' : 'desktop-high',
    renderingEvidence: 'Event-horizon shadow, photon ring, Doppler-brightened accretion disk, and far-side lens images are a real-time visual approximation.'
  };
  return group;
}

function updateBlackHoleVisual(group, camera, elapsedSeconds) {
  const model = group?.userData?.blackHole;
  if (!model) return;
  model.disk.material.uniforms.time.value = elapsedSeconds;
  _cameraLocal.copy(camera.position);
  group.worldToLocal(_cameraLocal);
  model.disk.material.uniforms.cameraLocal.value.copy(_cameraLocal).divideScalar(model.visualRadius);
  const pulse = 0.88 + Math.sin(elapsedSeconds * 1.7) * 0.08;
  model.photonShell.material.opacity = 0.07 + pulse * 0.04;
  model.lensArc.material.opacity = 0.22 + pulse * 0.09;
  model.upperLens.material.opacity = 0.38 + pulse * 0.12;
  model.lowerLens.material.opacity = 0.24 + pulse * 0.08;
  model.upperLens.quaternion.copy(camera.quaternion);
  model.lowerLens.quaternion.copy(camera.quaternion);
  model.lowerLens.rotateZ(Math.PI);
}

function updateBlackHoleEncounter(group, rocket, spacecraftVelocity, frameSeconds = 1 / 60) {
  const model = group?.userData?.blackHole;
  if (!model || !rocket) return null;
  _toHole.copy(group.position).sub(rocket.position);
  const distance = Math.max(0.001, _toHole.length());
  const radiusInRs = distance / model.visualRadius;
  const timeDilation = radiusInRs <= 1 ? 0 : Math.sqrt(Math.max(0, 1 - 1 / radiusInRs));
  const safeDistanceSq = Math.max(model.visualRadius * model.visualRadius, distance * distance);
  const massScale = Math.max(1, Math.log10(Number(model.entity.physical?.massSolar || 1)));
  const accelerationPerSecond = Math.min(3.12, massScale * 1800 / safeDistanceSq);
  if (spacecraftVelocity && distance > 0) {
    spacecraftVelocity.addScaledVector(
      _toHole.multiplyScalar(1 / distance),
      accelerationPerSecond * Math.max(0, Number(frameSeconds) || 0)
    );
  }
  return {
    captured: distance <= model.visualRadius,
    distance,
    distanceInRs: radiusInRs,
    timeDilation,
    accelerationPerSecond,
    schwarzschildRadiusKm: model.schwarzschildRadiusKm,
    photonSphereRadiusKm: model.photonSphereRadiusKm,
    iscoRadiusKm: model.iscoRadiusKm
  };
}

export {
  createBlackHoleVisual,
  physicalSchwarzschildRadiusKm,
  updateBlackHoleEncounter,
  updateBlackHoleVisual
};
