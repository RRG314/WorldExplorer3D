import { ctx as appCtx } from "../shared-context.js?v=55";

export function updatePolice(dt) {
  if (!appCtx.policeOn || appCtx.police.length === 0) return;
  const mph = Math.abs(appCtx.car.speed * 0.5);
  const limit = appCtx.car.road?.limit || 25;
  const speeding = mph > limit;

  appCtx.police.forEach((cop) => {
    cop.siren += dt * 10;
    if (cop.cooldown > 0) cop.cooldown -= dt;
    const dx = appCtx.car.x - cop.x;
    const dz = appCtx.car.z - cop.z;
    const dist = Math.hypot(dx, dz);

    if (speeding && dist < appCtx.CFG.policeDist) cop.chasing = true;
    if (dist > appCtx.CFG.policeDist * 1.5) cop.chasing = false;

    if (cop.chasing) {
      const ta = Math.atan2(dx, dz);
      let ad = ta - cop.angle;
      while (ad > Math.PI) ad -= Math.PI * 2;
      while (ad < -Math.PI) ad += Math.PI * 2;
      cop.angle += ad * 4 * dt;
      if (dist > 50) cop.speed += appCtx.CFG.policeAccel * dt;
      else cop.speed *= 0.95;
      cop.speed = Math.min(cop.speed, appCtx.CFG.policeSpd);
      cop.mesh.children[2].material.color.setHex(Math.sin(cop.siren) > 0 ? 0xff0000 : 0x440000);
      cop.mesh.children[3].material.color.setHex(Math.sin(cop.siren) > 0 ? 0x000044 : 0x0066ff);
    } else {
      cop.speed *= 0.98;
    }

    const cnx = cop.x + Math.sin(cop.angle) * cop.speed * dt;
    const cnz = cop.z + Math.cos(cop.angle) * cop.speed * dt;

    if (cop.chasing) {
      cop.x = cnx;
      cop.z = cnz;
    } else {
      const nr = appCtx.findNearestRoad(cnx, cnz);
      if (nr.dist < 50) {
        cop.x = cnx;
        cop.z = cnz;
      } else if (nr.pt) {
        cop.x = nr.pt.x;
        cop.z = nr.pt.z;
      }
    }

    let policeY = 0;
    if (appCtx.terrainEnabled) {
      const baseY = appCtx.elevationWorldYAtWorldXZ(cop.x, cop.z);
      const nearRoad = appCtx.findNearestRoad(cop.x, cop.z);

      if (nearRoad.dist < 20 && appCtx.roadMeshes.length > 0) {
        const raycaster = appCtx._getPhysRaycaster();
        appCtx._physRayStart.set(cop.x, 200, cop.z);
        raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
        const roadHits = raycaster.intersectObjects(appCtx.roadMeshes, false);
        if (roadHits.length > 0) policeY = roadHits[0].point.y;
        else policeY = baseY;
      } else {
        policeY = baseY;
      }
    }

    cop.mesh.position.set(cop.x, policeY, cop.z);
    cop.mesh.rotation.y = cop.angle;

    if (dist < 4 && cop.chasing && cop.cooldown <= 0) {
      appCtx.policeHits++;
      cop.cooldown = 2;
      appCtx.car.speed *= 0.3;
      cop.speed = 0;
      document.getElementById("police").textContent = `💔 ${appCtx.policeHits}/3`;
      if (appCtx.policeHits >= 3) {
        appCtx.paused = true;
        document.getElementById("caughtScreen").classList.add("show");
      }
    }
  });
}

export function spawnPolice() {
  appCtx.policeMeshes.forEach((mesh) => appCtx.scene.remove(mesh));
  appCtx.policeMeshes = [];
  appCtx.police = [];
  appCtx.policeHits = 0;
  document.getElementById("police").textContent = "💔 0/3";

  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.5, 3.5),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.8 })
    );
    body.position.y = 0.5;
    body.castShadow = true;
    mesh.add(body);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.9 })
    );
    hood.position.set(0, 0.8, 0.7);
    mesh.add(hood);

    const sirenRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 })
    );
    sirenRed.position.set(-0.3, 0.92, 0);
    mesh.add(sirenRed);

    const sirenBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0066ff, emissive: 0x0066ff, emissiveIntensity: 1.5 })
    );
    sirenBlue.position.set(0.3, 0.92, 0);
    mesh.add(sirenBlue);

    const ang = appCtx.car.angle + Math.PI + (i === 0 ? 0.4 : -0.4);
    const dist = 50 + i * 20;
    const spawnX = appCtx.car.x + Math.sin(ang) * dist;
    const spawnZ = appCtx.car.z + Math.cos(ang) * dist;

    let spawnY = 0;
    if (appCtx.terrainEnabled && appCtx.roadMeshes.length > 0) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(spawnX, 200, spawnZ);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const roadHits = raycaster.intersectObjects(appCtx.roadMeshes, false);
      if (roadHits.length > 0) spawnY = roadHits[0].point.y;
      else spawnY = appCtx.elevationWorldYAtWorldXZ(spawnX, spawnZ);
    }

    mesh.position.set(spawnX, spawnY, spawnZ);
    appCtx.scene.add(mesh);
    appCtx.policeMeshes.push(mesh);
    appCtx.police.push({
      mesh,
      x: spawnX,
      z: spawnZ,
      angle: appCtx.car.angle,
      speed: 0,
      siren: i * Math.PI,
      chasing: false,
      cooldown: 0
    });
  }
}

export function clearPolice() {
  appCtx.policeMeshes.forEach((mesh) => {
    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
  appCtx.policeMeshes = [];
  appCtx.police = [];
  appCtx.policeOn = false;
}
