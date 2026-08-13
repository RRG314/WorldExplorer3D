import { ctx as appCtx } from "../shared-context.js?v=55";
import { detectRoadIntersections } from "./rebuild.js?v=33";

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
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;
  if (typeof terrainMeshHeightAt !== "function" || typeof worldToLatLon !== "function") return;

  console.log("🔬 Validating road-terrain conformance...");

  let totalSamples = 0;
  let issuesFound = 0;
  const worstDeltas = [];

  appCtx.roadMeshes.forEach((mesh) => {
    if (mesh.userData.isRoadSkirt) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const roadIdx = mesh.userData.roadIdx;
    const road = appCtx.roads[roadIdx];
    if (!road) return;

    for (let i = 0; i < pos.count; i += 5) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const terrainY = terrainMeshHeightAt(x, z);
      const delta = y - terrainY;

      totalSamples++;

      if (delta < -0.05) {
        issuesFound++;
        const { lat, lon } = worldToLatLon(x, z);
        worstDeltas.push({
          roadName: road.name || `Road ${roadIdx}`,
          delta: delta.toFixed(3),
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          worldPos: `(${x.toFixed(1)}, ${z.toFixed(1)})`
        });
      }
    }
  });

  worstDeltas.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));

  console.log(`✅ Validation complete: ${totalSamples} samples checked`);

  if (issuesFound > 0) {
    console.warn(`⚠️  Found ${issuesFound} points where road is below terrain (delta < -0.05)`);
    console.warn("Worst 10 deltas:");
    worstDeltas.slice(0, 10).forEach((d) => {
      console.warn(`  ${d.roadName}: delta=${d.delta}m at ${d.worldPos} (${d.lat}, ${d.lon})`);
    });
  } else {
    console.log("✅ No issues found - all roads conform to terrain!");
  }

  const intersections = detectRoadIntersections(appCtx.roads);
  console.log(`📍 Detected ${intersections.length} intersections`);

  return {
    totalSamples,
    issuesFound,
    worstDeltas: worstDeltas.slice(0, 10),
    intersectionCount: intersections.length
  };
}
