import {
  getRockTextureSet,
  getSeabedTextureSet
} from "./scene-textures.js?v=1";

const _tmpAssetObj = new THREE.Object3D();

export function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (!child || !child.isMesh) return;
    if (child.geometry && typeof child.geometry.dispose === "function") {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap"].forEach((key) => {
        const texture = material[key];
        if (
          texture &&
          typeof texture.dispose === "function" &&
          !(texture.userData && texture.userData.sharedOceanTexture)
        ) {
          texture.dispose();
        }
      });
      if (typeof material.dispose === "function") material.dispose();
    });
  });
}

export function createSeabedMesh(renderer = null, deps = {}) {
  const geo = new THREE.PlaneGeometry(1800, 1800, 220, 220);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = deps.sampleSeabedHeight(x, z);
    pos.setY(i, y);

    const reefWeight = Math.exp(-((x - 24) ** 2 + (z - 124) ** 2) / 25500);
    const deepWeight = deps.smoothstep(55, 420, -z + 70);
    const noise = deps.valueNoise2D(x * 0.028 + 20, z * 0.028 - 14, 31);

    const sandR = 0.72 + noise * 0.08;
    const sandG = 0.80 + noise * 0.08;
    const sandB = 0.74 + noise * 0.06;

    const reefR = 0.58 + noise * 0.1;
    const reefG = 0.69 + noise * 0.1;
    const reefB = 0.62 + noise * 0.08;

    const deepR = 0.17 + noise * 0.03;
    const deepG = 0.25 + noise * 0.04;
    const deepB = 0.30 + noise * 0.05;

    const r = deps.lerp(deps.lerp(sandR, reefR, reefWeight * 0.8), deepR, deepWeight * 0.75);
    const g = deps.lerp(deps.lerp(sandG, reefG, reefWeight * 0.8), deepG, deepWeight * 0.75);
    const b = deps.lerp(deps.lerp(sandB, reefB, reefWeight * 0.8), deepB, deepWeight * 0.75);

    color.setRGB(r, g, b);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const seabedTextures = getSeabedTextureSet(renderer, deps);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: seabedTextures.map,
    normalMap: seabedTextures.normalMap,
    roughnessMap: seabedTextures.roughnessMap,
    roughness: 0.92,
    metalness: 0.02
  });
  mat.normalScale = new THREE.Vector2(0.48, 0.48);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = "OceanSeabed";
  return mesh;
}

export function createReefCluster(renderer = null, deps = {}) {
  const group = new THREE.Group();
  group.name = "OceanReefCluster";

  const palette = [0xffa986, 0xff88c1, 0x8be8da, 0xffd6a4, 0xa8f2bc, 0xf8b6de];
  const branchGeo = new THREE.CylinderGeometry(0.16, 0.44, 2.8, 8);
  const fanGeo = new THREE.ConeGeometry(0.7, 1.5, 8);
  const moundGeo = new THREE.IcosahedronGeometry(0.85, 0);
  const rockGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const spikeGeo = new THREE.ConeGeometry(0.55, 2.8, 7);
  const rockTextures = getRockTextureSet(renderer, deps);

  const branchMat = new THREE.MeshStandardMaterial({
    roughness: 0.64,
    metalness: 0.04,
    emissive: 0x11222a,
    emissiveIntensity: 0.35,
    vertexColors: true
  });
  const fanMat = branchMat.clone();
  const moundMat = branchMat.clone();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rockTextures.map,
    normalMap: rockTextures.normalMap,
    roughnessMap: rockTextures.roughnessMap,
    roughness: 0.89,
    metalness: 0.02
  });
  rockMat.normalScale = new THREE.Vector2(0.58, 0.58);
  const darkRockMat = new THREE.MeshStandardMaterial({
    color: 0x7f97ad,
    map: rockTextures.map,
    normalMap: rockTextures.normalMap,
    roughnessMap: rockTextures.roughnessMap,
    roughness: 0.94,
    metalness: 0.03
  });
  darkRockMat.normalScale = new THREE.Vector2(0.66, 0.66);

  const branchMesh = new THREE.InstancedMesh(branchGeo, branchMat, 620);
  const fanMesh = new THREE.InstancedMesh(fanGeo, fanMat, 360);
  const moundMesh = new THREE.InstancedMesh(moundGeo, moundMat, 560);
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 700);
  const spikeMesh = new THREE.InstancedMesh(spikeGeo, darkRockMat, 320);

  function randomReefPoint(radiusMin, radiusMax, centerX = 24, centerZ = 124) {
    const angle = Math.random() * Math.PI * 2;
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    const x = centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 18;
    const z = centerZ + Math.sin(angle) * radius + (Math.random() - 0.5) * 22;
    return { x, z, y: deps.sampleSeabedHeight(x, z) };
  }

  const setInstancedColor = (mesh, index, hex) => {
    if (!mesh || typeof mesh.setColorAt !== "function") return;
    mesh.setColorAt(index, new THREE.Color(hex));
  };

  for (let i = 0; i < branchMesh.count; i++) {
    const p = randomReefPoint(8, 250);
    const scale = 0.8 + Math.random() * 1.8;
    _tmpAssetObj.position.set(p.x, p.y + 0.2, p.z);
    _tmpAssetObj.rotation.set((Math.random() - 0.5) * 0.28, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.28);
    _tmpAssetObj.scale.set(scale * 0.6, scale, scale * 0.6);
    _tmpAssetObj.updateMatrix();
    branchMesh.setMatrixAt(i, _tmpAssetObj.matrix);
    setInstancedColor(branchMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < fanMesh.count; i++) {
    const p = randomReefPoint(10, 220);
    const scale = 0.75 + Math.random() * 1.5;
    _tmpAssetObj.position.set(p.x, p.y + 0.55, p.z);
    _tmpAssetObj.rotation.set(Math.random() * 0.22, Math.random() * Math.PI * 2, Math.random() * 0.22);
    _tmpAssetObj.scale.set(scale, scale * (0.7 + Math.random() * 0.55), scale);
    _tmpAssetObj.updateMatrix();
    fanMesh.setMatrixAt(i, _tmpAssetObj.matrix);
    setInstancedColor(fanMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < moundMesh.count; i++) {
    const p = randomReefPoint(8, 330);
    const sx = 0.8 + Math.random() * 2.3;
    const sy = 0.6 + Math.random() * 1.6;
    const sz = 0.7 + Math.random() * 2.1;
    _tmpAssetObj.position.set(p.x, p.y + 0.35, p.z);
    _tmpAssetObj.rotation.set(Math.random() * 0.35, Math.random() * Math.PI * 2, Math.random() * 0.35);
    _tmpAssetObj.scale.set(sx, sy, sz);
    _tmpAssetObj.updateMatrix();
    moundMesh.setMatrixAt(i, _tmpAssetObj.matrix);
    setInstancedColor(moundMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < rockMesh.count; i++) {
    const area = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const radius = area < 0.8 ? 24 + Math.random() * 430 : 260 + Math.random() * 520;
    const x = 6 + Math.cos(angle) * radius + (Math.random() - 0.5) * 22;
    const z = 84 + Math.sin(angle) * radius + (Math.random() - 0.5) * 28;
    const y = deps.sampleSeabedHeight(x, z);
    const sx = 1.1 + Math.random() * 3.4;
    const sy = 0.6 + Math.random() * 1.8;
    const sz = 1.0 + Math.random() * 3.0;
    _tmpAssetObj.position.set(x, y + 0.3, z);
    _tmpAssetObj.rotation.set(Math.random() * 0.45, Math.random() * Math.PI * 2, Math.random() * 0.45);
    _tmpAssetObj.scale.set(sx, sy, sz);
    _tmpAssetObj.updateMatrix();
    rockMesh.setMatrixAt(i, _tmpAssetObj.matrix);
  }

  for (let i = 0; i < spikeMesh.count; i++) {
    const p = randomReefPoint(40, 610, 0, 40);
    const sy = 0.6 + Math.random() * 2.8;
    _tmpAssetObj.position.set(p.x, p.y + sy * 0.5, p.z);
    _tmpAssetObj.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12);
    _tmpAssetObj.scale.set(0.45 + Math.random() * 0.9, sy, 0.45 + Math.random() * 0.9);
    _tmpAssetObj.updateMatrix();
    spikeMesh.setMatrixAt(i, _tmpAssetObj.matrix);
  }

  if (branchMesh.instanceColor) branchMesh.instanceColor.needsUpdate = true;
  if (fanMesh.instanceColor) fanMesh.instanceColor.needsUpdate = true;
  if (moundMesh.instanceColor) moundMesh.instanceColor.needsUpdate = true;

  [branchMesh, fanMesh, moundMesh, rockMesh, spikeMesh].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const kelpGeo = new THREE.CylinderGeometry(0.05, 0.12, 2.8, 6);
  const kelpMat = new THREE.MeshStandardMaterial({
    color: 0x2f7e60,
    roughness: 0.82,
    metalness: 0.01,
    emissive: 0x0c2a21,
    emissiveIntensity: 0.24
  });
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, 520);
  for (let i = 0; i < kelp.count; i++) {
    const p = randomReefPoint(10, 280);
    const sy = 0.7 + Math.random() * 2.6;
    _tmpAssetObj.position.set(p.x, p.y + sy * 0.5, p.z);
    _tmpAssetObj.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.2);
    _tmpAssetObj.scale.set(0.9, sy, 0.9);
    _tmpAssetObj.updateMatrix();
    kelp.setMatrixAt(i, _tmpAssetObj.matrix);
  }
  kelp.instanceMatrix.needsUpdate = true;
  kelp.castShadow = true;
  kelp.receiveShadow = true;
  group.add(kelp);

  return group;
}

export function createMarineParticles() {
  const count = 2600;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 840;
    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = -3 - Math.random() * 160;
    positions[i3 + 2] = Math.sin(angle) * radius;
    sizes[i] = 0.35 + Math.random() * 1.05;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xb8defa,
    size: 0.78,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  points.name = "OceanSuspendedParticles";
  return points;
}

export function createDeepOceanBackdrop() {
  const group = new THREE.Group();
  group.name = "OceanBackdrop";

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(2900, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x04162a,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.94
    })
  );
  group.add(shell);

  const farFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(2800, 2800),
    new THREE.MeshBasicMaterial({
      color: 0x031120,
      transparent: true,
      opacity: 0.86
    })
  );
  farFloor.rotation.x = -Math.PI / 2;
  farFloor.position.set(0, -165, -430);
  group.add(farFloor);

  return group;
}

export function createSubmarineMesh(deps = {}) {
  const submarine = new THREE.Group();
  submarine.name = "MiniSub";

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead9,
    roughness: 0.38,
    metalness: 0.16
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2f8ab8,
    roughness: 0.52,
    metalness: 0.14
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaee4ff,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.65, 9.0, 24), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  submarine.add(hull);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.38, 2.2, 22), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 5.45;
  nose.castShadow = true;
  submarine.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 18), hullMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -5.45;
  tail.castShadow = true;
  submarine.add(tail);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 16), glassMat);
  cockpit.position.set(0, 1.05, 1.65);
  cockpit.castShadow = true;
  submarine.add(cockpit);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.55, 1.45), accentMat);
  tower.position.set(0, 1.45, -0.4);
  tower.castShadow = true;
  submarine.add(tower);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.7), accentMat);
  wingL.position.set(-1.4, -0.52, -2.4);
  wingL.rotation.z = 0.18;
  submarine.add(wingL);

  const wingR = wingL.clone();
  wingR.position.x = 1.4;
  wingR.rotation.z = -0.18;
  submarine.add(wingR);

  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.78, 8), accentMat);
  dorsalFin.rotation.z = Math.PI;
  dorsalFin.position.set(0, 0.95, -4.2);
  submarine.add(dorsalFin);

  const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 10), accentMat);
  propellerHub.rotation.x = Math.PI / 2;
  propellerHub.position.set(0, 0, -6.1);
  submarine.add(propellerHub);

  const propeller = new THREE.Group();
  propeller.position.copy(propellerHub.position);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.22), accentMat);
    blade.position.y = 0.37;
    blade.rotation.z = (Math.PI * 2 * i) / 3;
    propeller.add(blade);
  }
  submarine.add(propeller);

  const lamp = new THREE.SpotLight(0xc8efff, 2.2, 170, Math.PI / 8, 0.5, 1.1);
  lamp.position.set(0, 0.5, 4.8);
  lamp.target.position.set(0, 0.1, 32);
  submarine.add(lamp);
  submarine.add(lamp.target);

  submarine.scale.setScalar(deps.OCEAN_CONSTANTS.SUB_SCALE);
  submarine.userData.propeller = propeller;
  return submarine;
}
