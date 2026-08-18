import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4324, 4325, 4326, 4327]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fatalErrors = [];

const [sceneBootstrapSource, walkingCharacterSource] = await Promise.all([
  readFile(new URL('../app/js/engine/scene-bootstrap.js', import.meta.url), 'utf8'),
  readFile(new URL('../app/js/walking/character.js', import.meta.url), 'utf8')
]);
assert.match(sceneBootstrapSource, /createClassicUtilityCar\(THREE\)/, 'engine runtime is not wired to Car D');
assert.match(walkingCharacterSource, /createFieldNavigatorMesh\(THREE\)/, 'walking runtime is not wired to Character C');

page.on('pageerror', (error) => fatalErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
    fatalErrors.push(message.text());
  }
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?vehicle-visual-budgets=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  });
  await page.waitForFunction(() => !!globalThis.THREE, null, { timeout: 90000 });

  const models = await page.evaluate(async () => {
    const THREE = globalThis.THREE;
    const [
      { createClassicUtilityCar },
      { createFieldNavigatorMesh },
      { createExpeditionPlaneMesh },
      { createBoatModeMesh },
      { createExpeditionSpacecraftMesh },
      { createUrbanVehicleVisual },
      { URBAN_VEHICLE_CATALOG }
    ] = await Promise.all([
      import('/app/js/engine/classic-utility-car.js?v=2'),
      import('/app/js/walking/field-navigator-mesh.js?v=1'),
      import('/app/js/plane/expedition-plane-mesh.js?v=1'),
      import('/app/js/boat-mode/boat-model.js?v=2'),
      import('/app/js/space/expedition-spacecraft-mesh.js?v=1'),
      import('/app/js/urban-sandbox/vehicle-visuals.js?v=1'),
      import('/app/js/urban-sandbox/vehicle-model.js?v=1')
    ]);
    const carResult = createClassicUtilityCar(THREE);
    const planeResult = createExpeditionPlaneMesh();
    const roots = {
      car: carResult.car,
      character: createFieldNavigatorMesh(THREE),
      plane: planeResult.plane,
      boat: createBoatModeMesh(),
      spacecraft: createExpeditionSpacecraftMesh()
    };
    const urbanVehicles = URBAN_VEHICLE_CATALOG.map((variant) => ({
      variant,
      visual: createUrbanVehicleVisual(THREE, { id: `budget:${variant.id}`, variant, color: variant.color })
    }));

    function measure(root) {
      let meshes = 0;
      let triangles = 0;
      let transparentMaterials = 0;
      const materials = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        meshes += 1;
        const geometry = object.geometry;
        triangles += geometry?.index
          ? geometry.index.count / 3
          : (geometry?.attributes?.position?.count || 0) / 3;
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => {
          if (!material || materials.has(material.uuid)) return;
          materials.add(material.uuid);
          if (material.transparent) transparentMaterials += 1;
        });
      });
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      return {
        name: root.name,
        style: root.userData.visualStyle,
        meshes,
        triangles: Math.round(triangles),
        materials: materials.size,
        transparentMaterials,
        size: size.toArray().map((value) => Number(value.toFixed(2)))
      };
    }

    return {
      car: {
        ...measure(roots.car),
        style: roots.car.userData.vehicleStyle,
        wheels: carResult.wheels.length,
        headlightLenses: roots.car.children.filter((child) => child.userData?.vehicleHeadlightLens).length,
        paintFinish: carResult.paintMaterial.userData.vehiclePaintFinish || ''
      },
      character: {
        ...measure(roots.character),
        style: roots.character.userData.characterStyle,
        limbHooks: Object.keys(roots.character.userData.limbs || {}).filter((key) => key !== 'scale').length
      },
      plane: {
        ...measure(roots.plane),
        propellerHook: planeResult.propeller === roots.plane.getObjectByName('propeller')
      },
      boat: measure(roots.boat),
      spacecraft: {
        ...measure(roots.spacecraft),
        engineGlowHook: !!roots.spacecraft.getObjectByName('engineGlow')?.material,
        exhaustParticles: roots.spacecraft.getObjectByName('exhaust')?.children?.length || 0
      },
      urbanVehicles: urbanVehicles.map(({ variant, visual }) => ({
        id: variant.id,
        ...measure(visual.root),
        wheels: visual.wheels.length,
        doors: Object.keys(visual.doors).length
      }))
    };
  });

  assert.equal(models.car.style, 'classic-utility-d');
  assert.equal(models.car.wheels, 4, 'car lost its four wheel-owner hooks');
  assert.equal(models.car.headlightLenses, 2, 'car lost its two headlight lens hooks');
  assert.equal(models.car.paintFinish, 'utility-matte', 'car lost its readable matte paint policy');
  assert.ok(models.car.meshes <= 50 && models.car.triangles <= 1100 && models.car.materials <= 8);
  assert.equal(models.car.transparentMaterials, 0, 'car added transparent draw-order work');

  assert.equal(models.character.style, 'field-navigator-c');
  assert.equal(models.character.limbHooks, 5, 'character lost its body/arm/leg animation hooks');
  assert.ok(models.character.meshes <= 26 && models.character.triangles <= 650 && models.character.materials <= 7);
  assert.equal(models.character.transparentMaterials, 0, 'character added transparent draw-order work');

  assert.equal(models.plane.style, 'trailblazer-expedition');
  assert.ok(models.plane.propellerHook, 'plane lost its animated propeller hook');
  assert.ok(models.plane.meshes <= 32 && models.plane.triangles <= 1500 && models.plane.materials <= 12);
  assert.equal(models.plane.transparentMaterials, 0, 'plane added transparent draw-order work');

  assert.equal(models.boat.style, 'harbor-scout-expedition');
  assert.ok(models.boat.meshes <= 40 && models.boat.triangles <= 1300 && models.boat.materials <= 16);
  assert.equal(models.boat.transparentMaterials, 0, 'boat added transparent draw-order work');
  assert.ok(models.boat.size[0] <= 3.6 && models.boat.size[2] <= 11.2, 'boat exceeded its actor footprint');

  assert.equal(models.spacecraft.style, 'wayfinder-expedition');
  assert.ok(models.spacecraft.engineGlowHook, 'spacecraft lost its engine-glow hook');
  assert.equal(models.spacecraft.exhaustParticles, 6, 'spacecraft lost its exhaust-particle contract');
  assert.ok(models.spacecraft.meshes <= 26 && models.spacecraft.triangles <= 1500 && models.spacecraft.materials <= 11);
  assert.equal(models.spacecraft.transparentMaterials, 3, 'spacecraft must limit transparency to shared thrust effects');

  for (const vehicle of models.urbanVehicles) {
    assert.equal(vehicle.wheels, 4, `${vehicle.id} lost its wheel-controller hooks`);
    assert.equal(vehicle.doors, 2, `${vehicle.id} lost its entry animation hooks`);
    assert.ok(vehicle.meshes <= 40 && vehicle.triangles <= 1200 && vehicle.materials <= 9,
      `${vehicle.id} exceeded its close-range visual budget: ${JSON.stringify(vehicle)}`);
    assert.equal(vehicle.transparentMaterials, 0, `${vehicle.id} added transparent draw-order work`);
  }

  assert.deepEqual(fatalErrors, []);
  console.log(JSON.stringify({ ok: true, models }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
