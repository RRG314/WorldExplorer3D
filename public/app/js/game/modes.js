import { ctx as appCtx } from "../shared-context.js?v=55";
import { clearPolice, spawnPolice } from "./police.js?v=1";
import { resetPaintTownMode, startPaintTownMode, updateActivePaintTownMode } from "./paint-town.js?v=1";

function fmtTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
}

function showModeResult(title, stats) {
  if (typeof appCtx.showResult === "function") {
    appCtx.showResult(title, stats);
    return;
  }
  const titleEl = document.getElementById("resultTitle");
  const statsEl = document.getElementById("resultStats");
  const screen = document.getElementById("resultScreen");
  if (titleEl) titleEl.textContent = title;
  if (statsEl) statsEl.textContent = stats;
  if (screen) screen.classList.add("show");
  appCtx.setPauseReason?.('game_result', true);
}

export function pickRoadPt() {
  if (appCtx.roads.length === 0) return null;
  const road = appCtx.roads[Math.floor(Math.random() * appCtx.roads.length)];
  return road.pts[Math.floor(Math.random() * road.pts.length)];
}

export function clearObjectives() {
  resetPaintTownMode();
  if (appCtx.gameMode !== "painttown") appCtx.disableNearBuildingBatching = false;

  appCtx.cpMeshes.forEach((mesh) => {
    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose());
      else mesh.material.dispose();
    }
  });
  appCtx.cpMeshes = [];
  appCtx.checkpoints = [];
  appCtx.cpCollected = 0;

  if (appCtx.destMesh) {
    appCtx.scene.remove(appCtx.destMesh);
    if (appCtx.destMesh.geometry) appCtx.destMesh.geometry.dispose();
    if (appCtx.destMesh.material) {
      if (Array.isArray(appCtx.destMesh.material)) appCtx.destMesh.material.forEach((mat) => mat.dispose());
      else appCtx.destMesh.material.dispose();
    }
    appCtx.destMesh = null;
  }

  appCtx.destination = null;
  appCtx.trialDone = false;
}

export function spawnDest() {
  clearObjectives();
  let best = null;
  for (let i = 0; i < 40; i++) {
    const point = pickRoadPt();
    if (!point) continue;
    const dist = Math.hypot(point.x - appCtx.car.x, point.z - appCtx.car.z);
    if (dist > 400 && dist < 1200) {
      best = point;
      break;
    }
    if (!best || dist > Math.hypot(best.x - appCtx.car.x, best.z - appCtx.car.z)) best = point;
  }
  if (!best) return;

  appCtx.destination = { x: best.x, z: best.z };
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 1, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  group.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 40, 8),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.3 })
  );
  beam.position.y = 20;
  group.add(beam);

  group.position.set(best.x, 0, best.z);
  appCtx.scene.add(group);
  appCtx.destMesh = group;
}

export function spawnCheckpoints() {
  clearObjectives();
  for (let i = 0; i < 8; i++) {
    let point = null;
    for (let t = 0; t < 60; t++) {
      const candidate = pickRoadPt();
      if (!candidate) continue;
      if (Math.hypot(candidate.x - appCtx.car.x, candidate.z - appCtx.car.z) < 250) continue;
      if (appCtx.checkpoints.every((cp) => Math.hypot(candidate.x - cp.x, candidate.z - cp.z) > 200)) {
        point = candidate;
        break;
      }
    }
    if (!point) point = pickRoadPt();
    if (!point) continue;

    appCtx.checkpoints.push({ x: point.x, z: point.z, collected: false, idx: i + 1 });
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.8, 8, 20), new THREE.MeshBasicMaterial({ color: 0xff3366 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    group.add(ring);
    group.position.set(point.x, 0, point.z);
    appCtx.scene.add(group);
    appCtx.cpMeshes.push(group);
  }
}

export function startMode() {
  appCtx.gameTimer = 0;
  clearObjectives();
  clearPolice();
  appCtx.policeOn = false;

  const policeHud = document.getElementById("police");
  if (policeHud) policeHud.classList.remove("show");
  const policeToggle = document.getElementById("fPolice");
  if (policeToggle) policeToggle.classList.remove("on");

  if (typeof appCtx.stopFlowerChallenge === "function") appCtx.stopFlowerChallenge();

  if (appCtx.gameMode === "trial") spawnDest();
  else if (appCtx.gameMode === "checkpoint") spawnCheckpoints();
  else if (appCtx.gameMode === "painttown") startPaintTownMode();
  else if (appCtx.gameMode === "police") {
    appCtx.policeOn = true;
    if (policeHud) policeHud.classList.add("show");
    if (policeToggle) policeToggle.classList.add("on");
    spawnPolice();
  } else if (appCtx.gameMode === "flower" && typeof appCtx.startFlowerChallenge === "function") {
    appCtx.startFlowerChallenge("game-mode");
  }
}

export function updateMode(dt) {
  if (appCtx.gameMode === "trial" || appCtx.gameMode === "checkpoint" || appCtx.gameMode === "painttown") {
    appCtx.gameTimer += dt;
  }
  appCtx.cpMeshes.forEach((mesh) => {
    mesh.rotation.y += dt * 1.5;
  });
  if (appCtx.destMesh) appCtx.destMesh.rotation.y += dt * 1.2;

  if (appCtx.gameMode === "trial" && appCtx.destination && !appCtx.trialDone) {
    const dist = Math.hypot(appCtx.destination.x - appCtx.car.x, appCtx.destination.z - appCtx.car.z);
    if (dist < appCtx.CFG.cpRadius) {
      appCtx.trialDone = true;
      showModeResult("Destination Reached!", "Time: " + fmtTime(appCtx.gameTimer));
    } else if (appCtx.gameTimer > appCtx.CFG.trialTime) {
      showModeResult("Time's Up!", "Result: Failed");
    }
  }

  if (appCtx.gameMode === "checkpoint") {
    for (let i = 0; i < appCtx.checkpoints.length; i++) {
      const checkpoint = appCtx.checkpoints[i];
      if (checkpoint.collected) continue;
      if (Math.hypot(checkpoint.x - appCtx.car.x, checkpoint.z - appCtx.car.z) < appCtx.CFG.cpRadius) {
        checkpoint.collected = true;
        appCtx.cpCollected++;
        if (appCtx.cpMeshes[i]) appCtx.cpMeshes[i].visible = false;
        if (appCtx.cpCollected >= appCtx.checkpoints.length) {
          showModeResult("All Checkpoints!", "Time: " + fmtTime(appCtx.gameTimer));
        }
        break;
      }
    }
  }

  if (appCtx.gameMode === "painttown") {
    updateActivePaintTownMode(dt);
  }
}
