export function createSpacecraft(ctx) {
  ctx.solarSystem.spacecraftMeshes = [];

  ctx.SPACECRAFT.forEach((craft, i) => {
    let meshGroup;
    if (craft.name === 'ISS') {
      meshGroup = buildISSMesh(craft);
    } else if (craft.name === 'Hubble') {
      meshGroup = buildHubbleMesh(craft);
    } else if (craft.name === 'JWST') {
      meshGroup = buildJWSTMesh(craft);
    } else {
      meshGroup = buildVoyagerMesh(craft);
    }

    meshGroup.name = craft.name;
    meshGroup.userData = { isSpacecraft: true, spacecraftIndex: i };

    const hitRadius = Math.max(craft.size * 6, 30);
    const hitGeo = new THREE.SphereGeometry(hitRadius, 6, 6);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.userData = { isSpacecraft: true, spacecraftIndex: i };
    meshGroup.add(hitbox);

    ctx.createLabel(craft.name, meshGroup, craft.size * 2);

    const orbitData = {};
    if (craft.orbit === 'Earth') {
      orbitData.type = 'earthOrbit';
      orbitData.radius = craft.orbitRadius;
      orbitData.periodDays = craft.orbitPeriodDays;
      orbitData.inclination = craft.orbitInclination * ctx.DEG2RAD;
      orbitData.phase = craft.phaseOffset;
      meshGroup.position.set(0, 0, 0);
    } else if (craft.orbit === 'L2') {
      orbitData.type = 'L2';
      orbitData.offset = craft.orbitOffset;
      meshGroup.position.set(0, 0, 0);
    } else if (craft.orbit === 'heliocentric') {
      orbitData.type = 'deepSpace';
      const ra = craft.directionRA * ctx.DEG2RAD;
      const dec = craft.directionDec * ctx.DEG2RAD;
      const dist = craft.visualDistanceAU * ctx.AU_TO_SCENE;
      const x = dist * Math.cos(dec) * Math.cos(ra);
      const z = dist * Math.cos(dec) * Math.sin(ra);
      const y = dist * Math.sin(dec) * 0.3;
      meshGroup.position.set(x, y, z);
      ctx.solarSystem.group.add(meshGroup);
    }

    ctx.solarSystem.spacecraftMeshes.push({
      mesh: meshGroup,
      hitbox,
      spacecraft: craft,
      orbitData
    });
  });
}

function buildISSMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color,
    emissive: craft.emissive,
    shininess: 60
  });
  const panelMat = new THREE.MeshPhongMaterial({
    color: 0x223388,
    emissive: 0x111844,
    shininess: 40,
    side: THREE.DoubleSide
  });

  group.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 6), bodyMat));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 0.3), bodyMat));

  for (let side = -1; side <= 1; side += 2) {
    for (let pair = -1; pair <= 1; pair += 2) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 4), panelMat);
      panel.position.set(side * 4.5, 0, pair * 1.2);
      group.add(panel);
    }
  }

  group.scale.setScalar(craft.size / 3);
  return group;
}

function buildHubbleMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color,
    emissive: craft.emissive,
    shininess: 50
  });
  const panelMat = new THREE.MeshPhongMaterial({
    color: 0x223366,
    emissive: 0x111833,
    shininess: 30,
    side: THREE.DoubleSide
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5, 12), bodyMat);
  body.rotation.z = Math.PI / 2;
  group.add(body);

  const door = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), bodyMat);
  door.position.x = 2.5;
  door.rotation.y = Math.PI / 2;
  group.add(door);

  for (let side = -1; side <= 1; side += 2) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 5), panelMat);
    panel.position.set(0, side * 1.8, 0);
    group.add(panel);
  }

  group.scale.setScalar(craft.size / 2.5);
  return group;
}

function buildJWSTMesh(craft) {
  const group = new THREE.Group();
  const shieldShape = new THREE.Shape();
  const hexR = 3;
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2 - Math.PI / 6;
    const x = Math.cos(angle) * hexR;
    const y = Math.sin(angle) * hexR;
    if (i === 0) shieldShape.moveTo(x, y); else shieldShape.lineTo(x, y);
  }
  shieldShape.closePath();

  const shieldGeo = new THREE.ShapeGeometry(shieldShape);
  const shieldMat = new THREE.MeshPhongMaterial({
    color: 0xddaa22,
    emissive: 0x665510,
    shininess: 80,
    side: THREE.DoubleSide
  });
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.rotation.x = -Math.PI / 2;
  group.add(shield);

  const mirrorGeo = new THREE.CircleGeometry(1.2, 6);
  const mirrorMat = new THREE.MeshPhongMaterial({
    color: 0xeecc44,
    emissive: 0x776622,
    shininess: 100,
    side: THREE.DoubleSide
  });
  const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
  mirror.position.y = 1.5;
  mirror.rotation.x = -Math.PI / 2;
  group.add(mirror);

  const strutMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
  for (let i = 0; i < 3; i++) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4), strutMat);
    const angle = i / 3 * Math.PI * 2;
    strut.position.set(Math.cos(angle) * 0.8, 0.75, Math.sin(angle) * 0.8);
    group.add(strut);
  }

  group.scale.setScalar(craft.size / 3);
  return group;
}

function buildVoyagerMesh(craft) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({
    color: craft.color,
    emissive: craft.emissive,
    shininess: 30
  });

  const dishGeo = new THREE.ConeGeometry(2, 0.8, 16, 1, true);
  const dish = new THREE.Mesh(dishGeo, bodyMat);
  dish.rotation.x = Math.PI;
  group.add(dish);

  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), bodyMat);
  feed.position.y = 0.6;
  group.add(feed);

  const bus = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), bodyMat);
  bus.position.y = -0.8;
  group.add(bus);

  const boomMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5, 4), boomMat);
  boom.position.set(2.5, -0.5, 0);
  boom.rotation.z = Math.PI / 2;
  group.add(boom);

  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 6), bodyMat);
  rtg.position.set(5, -0.5, 0);
  rtg.rotation.z = Math.PI / 2;
  group.add(rtg);

  group.scale.setScalar(craft.size / 2);
  return group;
}

export function updateSpacecraftPositions(ctx) {
  if (!ctx.solarSystem.spacecraftMeshes.length) return;

  const elapsedDays = Date.now() / 86400000;
  let earthPos = null;
  if (ctx.appCtx.spaceFlight && ctx.appCtx.spaceFlight.earth) {
    earthPos = ctx.appCtx.spaceFlight.earth.position;
  }
  const sunWorldPos = ctx.solarSystem.group ? ctx.solarSystem.group.position : new THREE.Vector3(0, 0, 0);

  ctx.solarSystem.spacecraftMeshes.forEach((entry) => {
    const od = entry.orbitData;

    if (od.type === 'earthOrbit' && earthPos) {
      const angularSpeed = Math.PI * 2 / od.periodDays;
      const theta = od.phase + elapsedDays * angularSpeed * ctx.solarSystem.MOON_TIME_SCALE;
      const sinInc = Math.sin(od.inclination);
      const localX = Math.cos(theta) * od.radius;
      const localZ = Math.sin(theta) * od.radius;
      const localY = Math.sin(theta) * od.radius * sinInc * 0.15;

      entry.mesh.position.set(
        earthPos.x + localX,
        earthPos.y + localY,
        earthPos.z + localZ
      );
      entry.mesh.rotation.y += 0.01;
    } else if (od.type === 'L2' && earthPos) {
      const toSun = new THREE.Vector3().subVectors(sunWorldPos, earthPos);
      if (toSun.length() > 0) {
        toSun.normalize();
      } else {
        toSun.set(-1, 0, 0);
      }
      entry.mesh.position.set(
        earthPos.x - toSun.x * od.offset,
        earthPos.y - toSun.y * od.offset + 5,
        earthPos.z - toSun.z * od.offset
      );
      entry.mesh.rotation.y += 0.003;
    } else if (od.type === 'deepSpace') {
      entry.mesh.rotation.y += 0.002;
    }
  });
}
