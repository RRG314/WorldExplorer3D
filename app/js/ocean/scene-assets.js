import {
  getSeabedTextureSet
} from "./scene-textures.js?v=1";

export function disposeObject3D(obj) {
  if (!obj) return;
  const managed = [];
  obj.traverse(child => {
    for (const key of ['disposeOceanHabitat', 'disposeCuratedMarineVisual']) {
      if (child.userData?.[key]) managed.push(child.userData[key]);
    }
  });
  // Detach leased models before visiting shared resources. A docked instance
  // can still be using the same textures in another scene.
  for (const dispose of managed) dispose();
  const geometries=new Set(),materials=new Set(),textures=new Set(),targets=new Set();
  obj.traverse((child) => {
    if (!child) return;
    // r128 stores instance attributes outside geometry; only the mesh's
    // disposal event retires those GPU buffers while the renderer stays alive.
    if (child.isInstancedMesh) child.dispose?.();
    for (const key of ['map','mapPass']) {
      const target=child.shadow?.[key];
      if(target){targets.add(target);child.shadow[key]=null;}
    }
    if(child.geometry)geometries.add(child.geometry);
    for(const material of [].concat(child.material||[]))materials.add(material);
  });
  for(const material of materials){
    for(const value of Object.values(material))if(value?.isTexture&&!value.userData?.sharedOceanTexture)textures.add(value);
    material.dispose?.();
  }
  for(const geometry of geometries)geometry.dispose?.();
  for(const texture of textures)texture.dispose?.();
  for(const target of targets)target.dispose?.();
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

    const study=deps.studyCoordinates?.(x,z)||{x,z};
    const reefWeight = Math.exp(-((study.x - 24) ** 2 + (study.z - 124) ** 2) / 25500);
    const deepWeight = deps.smoothstep(55, 420, -study.z + 70);
    const noise = deps.valueNoise2D(study.x * 0.028 + 20, study.z * 0.028 - 14, 31);

    const sandR = 0.48 + noise * 0.08;
    const sandG = 0.49 + noise * 0.08;
    const sandB = 0.37 + noise * 0.06;

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

export function createDeepOceanBackdrop({includeFloor=true}={}) {
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

  if(!includeFloor)return group;
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

export {createSubmarineMesh} from './submarine-visual.js';
