import { createAnimalModel } from './animal-models.js?v=2';

function makeMaterials(THREE) {
  return {
    granite: new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: .92, metalness: .02, flatShading: true }),
    feldspar: new THREE.MeshStandardMaterial({ color: 0xb5a99e, roughness: .82, metalness: .02, flatShading: true }),
    quartz: new THREE.MeshStandardMaterial({ color: 0xbcd5dc, emissive: 0x152a31, roughness: .28, metalness: .05, flatShading: true }),
    crystalCore: new THREE.MeshStandardMaterial({ color: 0xe7f2f2, emissive: 0x294b55, roughness: .18, metalness: .03, flatShading: true }),
    stem: new THREE.MeshStandardMaterial({ color: 0x3e6b31, roughness: .9, metalness: 0, flatShading: true }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x56823d, roughness: .92, metalness: 0, flatShading: true }),
    flower: new THREE.MeshStandardMaterial({ color: 0xe6b51d, emissive: 0x3d2900, roughness: .8, metalness: 0, flatShading: true }),
    fossil: new THREE.MeshStandardMaterial({ color: 0xb49a72, roughness: .95, metalness: 0, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x4e9b8a, emissive: 0x0a2c28, roughness: .24, metalness: .08, flatShading: true })
  };
}

function createNaturalHistoryModel(THREE, catalogId) {
  const animalSpecies = {
    'woodland-track-clue': 'white-tailed-deer',
    'wetland-waterbird-clue': 'mallard',
    'urban-nature-photo': 'rock-pigeon'
  }[catalogId];
  if (animalSpecies) {
    const animal = createAnimalModel(THREE, animalSpecies);
    animal.userData.worldDiscoveryNaturalHistory = { catalogId, speciesId: animalSpecies };
    return animal;
  }
  const group = new THREE.Group();
  group.name = `World Discovery Natural History ${catalogId}`;
  const materials = makeMaterials(THREE);
  let meshes = 0;
  let triangles = 0;
  const add = (geometry, material, name, position, scale = [1, 1, 1], rotation = null) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.position.set(...position);
    object.scale.set(...scale);
    if (rotation) object.rotation.set(...rotation);
    object.castShadow = true;
    group.add(object);
    meshes++;
    triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes?.position?.count || 0) / 3;
    return object;
  };
  if (catalogId === 'granite-field-sample') {
    add(new THREE.DodecahedronGeometry(.42, 0), materials.granite, 'Granite body', [0, .32, 0], [1.35, .72, 1]);
    [[-.21,.52,-.1],[.16,.42,-.28],[.22,.23,.1],[-.16,.22,.26],[.02,.58,.14]].forEach((p, i) => add(new THREE.BoxGeometry(.11,.055,.15), materials.feldspar, `Feldspar crystal ${i + 1}`, p, [1,1,1], [i * .3,.2,i * .45]));
  } else if (catalogId === 'quartz-vein-sample') {
    add(new THREE.DodecahedronGeometry(.36, 0), materials.granite, 'Quartz matrix', [0, .2, 0], [1.2,.48,1]);
    [[0,.56,0,.16,.65],[-.2,.43,.03,.11,.45],[.2,.4,.08,.12,.4],[-.08,.38,.2,.09,.34],[.1,.34,-.2,.1,.3]].forEach(([x,y,z,r,h], i) => add(new THREE.CylinderGeometry(r * .72, r, h, 6), i ? materials.quartz : materials.crystalCore, `Quartz crystal ${i + 1}`, [x,y,z], [1,1,1], [i * .08,0,i * .1]));
  } else if (catalogId === 'common-plant-record') {
    [-.18,0,.17].forEach((x, i) => {
      const height = .3 + i * .07;
      add(new THREE.CylinderGeometry(.012,.018,height,6), materials.stem, `Dandelion stem ${i + 1}`, [x,height / 2, (i - 1) * .07]);
      add(new THREE.SphereGeometry(.095,8,6), materials.flower, `Dandelion flower ${i + 1}`, [x,height + .03,(i - 1) * .07], [1,.45,1]);
    });
    [-.28,-.14,0,.14,.28].forEach((x, i) => add(new THREE.ConeGeometry(.075,.36,5), materials.leaf, `Dandelion leaf ${i + 1}`, [x,.045,.07], [1,.22,1], [Math.PI / 2,0,(i - 2) * .22]));
  } else if (catalogId === 'shell-impression-cast') {
    add(new THREE.DodecahedronGeometry(.4,0), materials.fossil, 'Fossil matrix', [0,.18,0], [1.25,.38,1]);
    [0,.09,.18].forEach((radius, i) => add(new THREE.TorusGeometry(.08 + radius,.022,6,18,Math.PI * 1.65), materials.feldspar, `Shell spiral ${i + 1}`, [0,.36 + i * .008,-.03], [1,1,1], [Math.PI / 2,0,.4]));
  } else if (catalogId === 'sea-glass-fragment') {
    [[-.16,.08,.03],[.08,.11,-.09],[.19,.07,.12]].forEach((p, i) => add(new THREE.DodecahedronGeometry(.14 - i * .015,0), materials.glass, `Sea glass fragment ${i + 1}`, p, [1,.45,.8], [i*.3,i*.2,0]));
  } else {
    add(new THREE.TorusGeometry(.3,.025,7,24), materials.quartz, 'Field evidence locator', [0,.07,0], [1,1,1], [Math.PI / 2,0,0]);
    add(new THREE.OctahedronGeometry(.12,0), materials.crystalCore, 'Field evidence sample', [0,.2,0]);
  }
  group.userData.worldDiscoveryNaturalHistory = { catalogId };
  group.userData.performanceProfile = Object.freeze({ meshes, triangles: Math.round(triangles), materials: new Set(Object.values(materials).map((material) => material.uuid)).size });
  return group;
}

export { createNaturalHistoryModel };
