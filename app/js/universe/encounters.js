function seededRandom(seed = 1) {
  let state = Math.abs(Math.floor(Number(seed) || 1)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createAsteroidMaterial(index) {
  const colors = [0x5c6065, 0x6c635a, 0x4f565d, 0x746c61];
  return new THREE.MeshPhongMaterial({
    color: colors[index % colors.length],
    shininess: 2,
    flatShading: true
  });
}

function createRegionEncounter(frameGroup, entity) {
  if (!frameGroup || entity?.objectClass !== 'stellar_region') return null;
  const random = seededRandom(entity.visualProfile?.seed + 901);
  const group = new THREE.Group();
  group.name = 'Generated minor-body encounter';
  group.userData = {
    accuracy: 'procedurally generated gameplay content',
    stableSeed: entity.visualProfile?.seed + 901
  };
  frameGroup.add(group);

  const asteroids = [];
  for (let i = 0; i < 36; i++) {
    const radius = 7 + random() * 18;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, i % 5 === 0 ? 1 : 0),
      createAsteroidMaterial(i)
    );
    mesh.position.set(
      (random() - 0.5) * 820,
      (random() - 0.5) * 460,
      120 + random() * 760
    );
    mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    mesh.scale.set(0.72 + random() * 0.55, 0.7 + random() * 0.7, 0.72 + random() * 0.55);
    mesh.userData = {
      generatedEncounterBody: true,
      radius,
      spin: new THREE.Vector3(
        (random() - 0.5) * 0.012,
        (random() - 0.5) * 0.012,
        (random() - 0.5) * 0.012
      )
    };
    group.add(mesh);
    asteroids.push(mesh);
  }

  const projectileGroup = new THREE.Group();
  projectileGroup.name = 'Rocket pulse projectiles';
  frameGroup.add(projectileGroup);
  return {
    type: 'generated-asteroids',
    accuracy: 'procedurally generated gameplay content',
    frameGroup,
    group,
    projectileGroup,
    asteroids,
    projectiles: [],
    destroyed: 0,
    active: asteroids.length
  };
}

function fireEncounterPulse(encounter, rocket) {
  if (!encounter || !rocket || encounter.projectiles.length >= 12) return false;
  encounter.frameGroup.updateMatrixWorld(true);
  const worldStart = rocket.position.clone();
  const worldDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
  worldStart.addScaledVector(worldDirection, 15);
  const localStart = encounter.frameGroup.worldToLocal(worldStart.clone());
  const localEnd = encounter.frameGroup.worldToLocal(worldStart.clone().addScaledVector(worldDirection, 100));
  const direction = localEnd.sub(localStart).normalize();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.1, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x8fe7ff })
  );
  mesh.position.copy(localStart);
  mesh.userData = { direction, ttl: 2.8 };
  encounter.projectileGroup.add(mesh);
  encounter.projectiles.push(mesh);
  return true;
}

function removeProjectile(encounter, projectile) {
  encounter.projectileGroup.remove(projectile);
  projectile.geometry.dispose();
  projectile.material.dispose();
}

function hitAsteroid(encounter, asteroid) {
  asteroid.visible = false;
  asteroid.userData.destroyed = true;
  encounter.destroyed += 1;
  encounter.active = Math.max(0, encounter.active - 1);
}

function updateRegionEncounter(encounter, deltaSeconds) {
  if (!encounter) return;
  const dt = Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0));
  encounter.asteroids.forEach((asteroid) => {
    if (!asteroid.visible) return;
    asteroid.rotation.x += asteroid.userData.spin.x;
    asteroid.rotation.y += asteroid.userData.spin.y;
    asteroid.rotation.z += asteroid.userData.spin.z;
  });

  const survivors = [];
  encounter.projectiles.forEach((projectile) => {
    projectile.userData.ttl -= dt;
    projectile.position.addScaledVector(projectile.userData.direction, 620 * dt);
    let collided = false;
    for (let i = 0; i < encounter.asteroids.length; i++) {
      const asteroid = encounter.asteroids[i];
      if (!asteroid.visible) continue;
      const hitRadius = Number(asteroid.userData.radius || 10) * 1.2;
      if (projectile.position.distanceToSquared(asteroid.position) <= hitRadius * hitRadius) {
        hitAsteroid(encounter, asteroid);
        collided = true;
        break;
      }
    }
    if (collided || projectile.userData.ttl <= 0) removeProjectile(encounter, projectile);
    else survivors.push(projectile);
  });
  encounter.projectiles = survivors;
}

export { createRegionEncounter, fireEncounterPulse, updateRegionEncounter };
