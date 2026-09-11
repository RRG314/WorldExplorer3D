const BRICK_ATLAS = '/app/assets/textures/facades/brick-classic-v1.webp';
const STONE_ATLAS = '/app/assets/textures/facades/stone-civic-v1.webp';

function facadeMaterial(url, color, repeatX, repeatY, roughness = 0.88) {
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  else texture.encoding = THREE.sRGBEncoding;
  texture.userData = {
    owner: 'world/ten-light-street-structure',
    source: 'project-authored-static-atlas',
    assetUrl: url
  };
  const material = new THREE.MeshStandardMaterial({ color, map: texture, roughness, metalness: 0.01 });
  material.userData = {
    landmarkFacade: true,
    facadeAtlas: true,
    materialClaim: 'measured-landmark'
  };
  return material;
}

function addBox(root, width, height, depth, baseY, material, x = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, baseY + height * 0.5, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addRib(root, from, to, material) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  if (!(length > 0.01)) return;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, length, 6), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  root.add(mesh);
}

function addFacadePiers(root, width, depth, baseY, height, material, columns) {
  for (let index = 0; index < columns; index += 1) {
    const t = columns === 1 ? 0.5 : index / (columns - 1);
    const x = -width * 0.42 + width * 0.84 * t;
    addBox(root, 0.42, height, 0.34, baseY, material, x, depth * 0.5 + 0.13);
    addBox(root, 0.42, height, 0.34, baseY, material, x, -depth * 0.5 - 0.13);
  }
  for (let index = 1; index < Math.max(2, columns - 1); index += 1) {
    const t = index / Math.max(2, columns - 1);
    const z = -depth * 0.38 + depth * 0.76 * t;
    addBox(root, 0.34, height, 0.42, baseY, material, width * 0.5 + 0.13, z);
    addBox(root, 0.34, height, 0.42, baseY, material, -width * 0.5 - 0.13, z);
  }
}

export function createMeasuredTenLightStreet() {
  const root = new THREE.Group();
  root.name = 'measured-ten-light-street';

  const brick = facadeMaterial(BRICK_ATLAS, 0xb88a68, 3.2, 9.5, 0.9);
  const brickUpper = facadeMaterial(BRICK_ATLAS, 0xc29a76, 2.6, 7.5, 0.88);
  const limestone = facadeMaterial(STONE_ATLAS, 0xd8cfb6, 2.4, 5.5, 0.84);
  const copper = new THREE.MeshStandardMaterial({ color: 0x477b70, roughness: 0.58, metalness: 0.46 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb49343, roughness: 0.42, metalness: 0.72 });
  const antenna = new THREE.MeshStandardMaterial({ color: 0x485158, roughness: 0.62, metalness: 0.55 });

  // Public dimensions establish the 155.2 m height. The massing captures the
  // tower's Art Deco setbacks rather than interpreting source building parts
  // as separate full-height wedges.
  addBox(root, 48, 17, 37, 0, limestone);
  addBox(root, 42, 45, 31, 17, brick);
  addBox(root, 35, 31, 27, 62, brick);
  addBox(root, 29, 25, 22, 93, brickUpper);
  addBox(root, 22, 17, 18, 118, limestone);

  for (const bandY of [16.6, 61.6, 92.6, 117.6, 134.6]) {
    const width = bandY < 20 ? 48.7 : bandY < 70 ? 42.7 : bandY < 100 ? 35.7 : bandY < 125 ? 29.7 : 22.7;
    const depth = bandY < 20 ? 37.7 : bandY < 70 ? 31.7 : bandY < 100 ? 27.7 : bandY < 125 ? 22.7 : 18.7;
    addBox(root, width, 0.65, depth, bandY, limestone);
  }
  addFacadePiers(root, 42, 31, 18, 43, limestone, 8);
  addFacadePiers(root, 35, 27, 63, 29, limestone, 7);
  addFacadePiers(root, 29, 22, 94, 23, limestone, 6);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 14, 4), copper);
  roof.scale.set(12.6, 1, 10.2);
  roof.position.y = 142;
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  roof.receiveShadow = true;
  root.add(roof);

  const apex = new THREE.Vector3(0, 149, 0);
  for (const x of [-8.9, 8.9]) {
    for (const z of [-7.2, 7.2]) addRib(root, new THREE.Vector3(x, 135, z), apex, gold);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 6.2, 10), gold);
  mast.position.y = 152.1;
  mast.castShadow = true;
  root.add(mast);
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.22, 4.2, 8), antenna);
  aerial.position.y = 157.3;
  aerial.castShadow = true;
  root.add(aerial);

  root.userData = {
    measuredStructure: true,
    architecturalStyle: 'Art Deco',
    facadeMaterials: ['brick', 'limestone'],
    crownMaterials: ['copper', 'gold'],
    sourceBasis: 'public dimensions and architectural references'
  };
  return root;
}
