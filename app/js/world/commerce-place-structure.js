const STONE_ATLAS = '/app/assets/textures/facades/stone-civic-v1.webp';
const GLASS_ATLAS = '/app/assets/textures/facades/glass-curtain-v1.webp';

function facadeMaterial(url, color, repeatX, repeatY, roughness, metalness = 0.02) {
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
    owner: 'world/commerce-place-structure',
    source: 'project-authored-static-atlas',
    assetUrl: url
  };
  const material = new THREE.MeshStandardMaterial({ color, map: texture, roughness, metalness });
  material.userData = { landmarkFacade: true, facadeAtlas: true, materialClaim: 'measured-landmark' };
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

export function createMeasuredCommercePlace() {
  const root = new THREE.Group();
  root.name = 'measured-commerce-place';
  const stone = facadeMaterial(STONE_ATLAS, 0xcfc4aa, 3.2, 9.5, 0.86);
  const stoneDark = facadeMaterial(STONE_ATLAS, 0xa99d86, 2.4, 6.5, 0.9);
  const glass = facadeMaterial(GLASS_ATLAS, 0x78909d, 1.8, 8.5, 0.34, 0.12);
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x65706f,
    roughness: 0.56,
    metalness: 0.46
  });

  // The measured 138.4 m envelope uses a single coherent mass and hipped
  // crown. Source roof slices are deliberately not rendered independently.
  addBox(root, 48, 20, 36, 0, stoneDark);
  addBox(root, 39, 91, 29, 20, stone);
  addBox(root, 33, 12, 25, 111, stone);

  // Commerce Place's strong vertical glazing is expressed as inset curtain
  // wall bays rather than a generic all-glass box.
  addBox(root, 9.5, 88, 0.5, 22, glass, 0, 14.65);
  addBox(root, 9.5, 88, 0.5, 22, glass, 0, -14.65);
  addBox(root, 0.5, 88, 7.5, 22, glass, 19.65, 0);
  addBox(root, 0.5, 88, 7.5, 22, glass, -19.65, 0);

  for (const baseY of [19.5, 110.5, 122.5]) {
    const width = baseY < 30 ? 48.8 : baseY < 120 ? 39.8 : 33.8;
    const depth = baseY < 30 ? 36.8 : baseY < 120 ? 29.8 : 25.8;
    addBox(root, width, 0.7, depth, baseY, stoneDark);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 15.4, 4), roofMaterial);
  roof.scale.set(19, 1, 14.5);
  roof.position.y = 130.7;
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  roof.receiveShadow = true;
  root.add(roof);

  root.userData = {
    measuredStructure: true,
    architecturalStyle: 'Postmodern',
    facadeMaterials: ['stone', 'glass'],
    crownMaterials: ['metal'],
    sourceBasis: 'public dimensions and architectural references'
  };
  return root;
}
