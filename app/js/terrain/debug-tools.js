import { ctx as appCtx } from "../shared-context.js?v=55";

let roadDebugMode = false;
let roadDebugMeshes = [];

export function disableRoadDebugMode() {
  if (!roadDebugMode) return;

  roadDebugMode = false;

  roadDebugMeshes.forEach((mesh) => {
    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  roadDebugMeshes = [];

  appCtx.roadMeshes.forEach((mesh) => {
    if (mesh.userData._originalMaterial) {
      mesh.material.dispose();
      mesh.material = mesh.userData._originalMaterial;
      delete mesh.userData._originalMaterial;
    }
  });

  console.log("🔍 Road Debug Mode FORCE DISABLED - Materials restored");
}

export function toggleRoadDebugMode(deps = {}) {
  const { terrainMeshHeightAt } = deps;

  roadDebugMode = !roadDebugMode;

  roadDebugMeshes.forEach((mesh) => {
    appCtx.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  roadDebugMeshes = [];

  if (roadDebugMode) {
    console.log("🔍 Road Debug Mode ENABLED");

    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt) return;

      if (!mesh.userData._originalMaterial) {
        mesh.userData._originalMaterial = mesh.material;
      }
      mesh.material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide
      });
    });

    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      const points = [];
      for (let i = 0; i < pos.count; i += 2) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        points.push(new THREE.Vector3(x, y + 0.5, z));
      }

      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        const line = new THREE.Line(lineGeo, lineMat);
        appCtx.scene.add(line);
        roadDebugMeshes.push(line);
      }

      for (let i = 0; i < points.length; i += 10) {
        const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[i]);
        appCtx.scene.add(sphere);
        roadDebugMeshes.push(sphere);
      }
    });

    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos || typeof terrainMeshHeightAt !== "function") return;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const terrainY = terrainMeshHeightAt(x, z);
        const delta = y - terrainY;

        if (delta < -0.05) {
          const markerGeo = new THREE.BoxGeometry(0.5, 2, 0.5);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
          const marker = new THREE.Mesh(markerGeo, markerMat);
          marker.position.set(x, y + 1, z);
          appCtx.scene.add(marker);
          roadDebugMeshes.push(marker);
        }
      }
    });
  } else {
    console.log("🔍 Road Debug Mode DISABLED");

    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData._originalMaterial) {
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
}

export function validateRoadTerrainConformance(deps = {}) {
  const { terrainMeshHeightAt, worldToLatLon } = deps;
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return null;
  if (typeof terrainMeshHeightAt !== "function") return null;

  let totalSamples = 0;
  let issuesFound = 0;
  let minimumDelta = Infinity;
  const worstDeltas = [];

  appCtx.roadMeshes.forEach((mesh) => {
    if (
      mesh.userData?.isRoadSkirt ||
      mesh.userData?.isRoadMarking ||
      mesh.userData?.isStructureVisual
    ) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    // Road publication uses indexed batches, not one mesh per road. The old
    // validator required `roadIdx`, so it skipped every current road surface
    // and could report zero problems without sampling a single vertex.
    const sampleStride = Math.max(1, Math.floor(pos.count / 12000));
    for (let i = 0; i < pos.count; i += sampleStride) {
      const x = pos.getX(i) + Number(mesh.position?.x || 0);
      const y = pos.getY(i) + Number(mesh.position?.y || 0);
      const z = pos.getZ(i) + Number(mesh.position?.z || 0);

      const terrainY = terrainMeshHeightAt(x, z);
      if (!Number.isFinite(terrainY)) continue;
      const delta = y - terrainY;

      totalSamples++;
      minimumDelta = Math.min(minimumDelta, delta);

      if (delta < -0.05) {
        issuesFound++;
        const geographic = typeof worldToLatLon === 'function'
          ? worldToLatLon(x, z)
          : null;
        worstDeltas.push({
          batchIndex: Number(mesh.userData?.roadBatchIndex ?? -1),
          delta: Number(delta.toFixed(3)),
          lat: Number.isFinite(geographic?.lat) ? Number(geographic.lat.toFixed(6)) : null,
          lon: Number.isFinite(geographic?.lon) ? Number(geographic.lon.toFixed(6)) : null,
          x: Number(x.toFixed(1)),
          z: Number(z.toFixed(1))
        });
      }
    }
  });

  worstDeltas.sort((a, b) => a.delta - b.delta);
  return Object.freeze({
    authority: 'published-road-mesh-versus-rendered-terrain',
    totalSamples,
    issuesFound,
    minimumDelta: Number.isFinite(minimumDelta) ? Number(minimumDelta.toFixed(4)) : null,
    worstDeltas: Object.freeze(worstDeltas.slice(0, 10).map(Object.freeze))
  });
}
