import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { REFERENCE_VISUALS } from '../app/js/discovery/visual-content.js?v=1';
import { startStaticRootServer } from './test-static-server.mjs';

assert.ok(Object.keys(REFERENCE_VISUALS).length >= 10, 'discovery reference library is incomplete');
for (const visual of Object.values(REFERENCE_VISUALS)) {
  assert.match(visual.image, /^assets\/discovery\/reference\/.+\.jpg$/);
  assert.match(visual.sourceUrl, /^https:\/\/(?:commons\.wikimedia\.org\/wiki\/File:|www\.fws\.gov\/media\/)/);
  assert.ok(visual.author && visual.license && visual.alt, `${visual.id} is missing attribution or alt text`);
}

const server = await startStaticRootServer({ rootDir: process.cwd(), host: '127.0.0.1', candidatePorts: [4340, 4341, 4342] });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fatalErrors = [];
page.on('pageerror', (error) => fatalErrors.push(String(error?.message || error)));
try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?discovery-visual-budget=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!globalThis.THREE, null, { timeout: 90000 });
  const results = await page.evaluate(async () => {
    const THREE = globalThis.THREE;
    const [{ createAnimalModel, ANIMAL_VISUAL_BUDGET }, { createNaturalHistoryModel }, { createFieldEquipmentPresentation }, { COMPANION_CATALOG }] = await Promise.all([
      import('/app/js/discovery/animal-models.js?v=1'),
      import('/app/js/discovery/natural-history-models.js?v=1'),
      import('/app/js/discovery/field-equipment.js?v=1'),
      import('/app/js/discovery/catalog.js?v=1')
    ]);
    const measure = (root) => {
      let meshes = 0;
      let triangles = 0;
      const materials = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        meshes++;
        triangles += object.geometry?.index ? object.geometry.index.count / 3 : (object.geometry?.attributes?.position?.count || 0) / 3;
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material && materials.add(material.uuid));
      });
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray().map((value) => Number(value.toFixed(2)));
      return { meshes, triangles: Math.round(triangles), materials: materials.size, size };
    };
    const species = ['trail-hound', 'field-retriever', 'park-terrier', 'harbor-cat', 'meadow-tabby', 'midnight-cat', 'woodland-fox', 'white-tailed-deer', 'small-mammal', 'mallard', 'rock-pigeon', 'marsh-mallard', 'city-pigeon'];
    const animals = Object.fromEntries(species.map((id) => [id, measure(createAnimalModel(THREE, id))]));
    const companions = Object.fromEntries(COMPANION_CATALOG.map((entry) => [entry.id, {
      sizeClass: entry.sizeClass,
      behaviorArchetype: entry.behaviorArchetype,
      worldScale: entry.worldScale,
      renderedHeight: Number((animals[entry.id].size[1] * entry.worldScale).toFixed(3))
    }]));
    const specimens = Object.fromEntries(['granite-field-sample', 'quartz-vein-sample', 'common-plant-record', 'shell-impression-cast', 'sea-glass-fragment'].map((id) => [id, measure(createNaturalHistoryModel(THREE, id))]));
    const character = new THREE.Group();
    character.userData.limbs = { arm2: new THREE.Group() };
    const scene = new THREE.Scene();
    const equipment = createFieldEquipmentPresentation({ Walk: { state: { mode: 'walk', characterMesh: character, walker: { y: 1.7 } } }, addEarthWorldObject: (object) => scene.add(object), sampleFeatureSurfaceY: () => 0 });
    equipment.update({ x: 0, y: 1.7, z: 0 }, { active: true, phase: 'sweeping', signalStrength: .8 }, .016, 'metal-detect');
    const heldDetectorVisible = !!character.getObjectByName('Held metal-detector')?.visible;
    equipment.dispose();
    return { animals, companions, specimens, equipment: equipment.diagnostics, heldDetectorVisible, budget: ANIMAL_VISUAL_BUDGET };
  });
  for (const [species, model] of Object.entries(results.animals)) {
    assert.ok(model.meshes <= results.budget.maxMeshes, `${species} mesh budget exceeded`);
    assert.ok(model.triangles <= results.budget.maxTriangles, `${species} triangle budget exceeded`);
    assert.ok(model.materials <= results.budget.maxMaterials, `${species} material budget exceeded`);
  }
  assert.notDeepEqual(results.animals['trail-hound'].size, results.animals['harbor-cat'].size, 'hound and cat must not share one silhouette');
  assert.notDeepEqual(results.animals['trail-hound'].size, results.animals['field-retriever'].size, 'dog breeds must not share one silhouette');
  assert.notDeepEqual(results.animals['harbor-cat'].size, results.animals['meadow-tabby'].size, 'cat types must not share one silhouette');
  assert.notDeepEqual(results.animals.mallard.size, results.animals['rock-pigeon'].size, 'waterbird and pigeon must not share one silhouette');
  const companionEntries = Object.entries(results.companions);
  assert.equal(companionEntries.filter(([, entry]) => entry.sizeClass?.includes('dog')).length, 3, 'companion roster must include three dog types');
  assert.equal(companionEntries.filter(([, entry]) => entry.sizeClass === 'cat').length, 3, 'companion roster must include three cat types');
  assert.equal(companionEntries.filter(([, entry]) => entry.behaviorArchetype === 'air-follower').length, 2, 'companion roster must include two bird followers');
  assert.ok(results.companions['trail-hound'].renderedHeight <= .75, 'Trail Hound is oversized beside the character');
  assert.ok(results.companions['field-retriever'].renderedHeight <= .82, 'Field Retriever is oversized beside the character');
  assert.ok(results.companions['park-terrier'].renderedHeight <= .52, 'Park Terrier is oversized beside the character');
  ['harbor-cat', 'meadow-tabby', 'midnight-cat'].forEach((id) => assert.ok(results.companions[id].renderedHeight <= .46, `${id} is oversized beside the character`));
  assert.ok(results.companions['marsh-mallard'].renderedHeight <= .38, 'Mallard companion is oversized');
  assert.ok(results.companions['city-pigeon'].renderedHeight <= .27, 'Pigeon companion is oversized');
  for (const [id, model] of Object.entries(results.specimens)) {
    assert.ok(model.meshes <= 16 && model.triangles <= 1000 && model.materials <= 4, `${id} visual budget exceeded`);
  }
  assert.equal(results.heldDetectorVisible, true, 'detector is not attached to the walking character');
  assert.equal(results.equipment.heldAttachment, true);
  assert.ok(results.equipment.distinctTools >= 8);
  for (const visual of Object.values(REFERENCE_VISUALS)) {
    const response = await page.request.get(`http://127.0.0.1:${server.port}/app/${visual.image}`);
    assert.equal(response.ok(), true, `${visual.image} is not loadable`);
  }
  assert.deepEqual(fatalErrors, []);
  console.log(JSON.stringify({ ok: true, references: Object.keys(REFERENCE_VISUALS).length, ...results }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
