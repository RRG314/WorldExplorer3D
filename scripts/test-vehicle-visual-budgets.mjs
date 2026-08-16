import assert from 'node:assert/strict';
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
    const [{ createExpeditionPlaneMesh }, { createBoatModeMesh }, { createExpeditionSpacecraftMesh }] = await Promise.all([
      import('/app/js/plane/expedition-plane-mesh.js?v=1'),
      import('/app/js/boat-mode/boat-model.js?v=2'),
      import('/app/js/space/expedition-spacecraft-mesh.js?v=1')
    ]);
    const planeResult = createExpeditionPlaneMesh();
    const roots = {
      plane: planeResult.plane,
      boat: createBoatModeMesh(),
      spacecraft: createExpeditionSpacecraftMesh()
    };

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
      plane: {
        ...measure(roots.plane),
        propellerHook: planeResult.propeller === roots.plane.getObjectByName('propeller')
      },
      boat: measure(roots.boat),
      spacecraft: {
        ...measure(roots.spacecraft),
        engineGlowHook: !!roots.spacecraft.getObjectByName('engineGlow')?.material,
        exhaustParticles: roots.spacecraft.getObjectByName('exhaust')?.children?.length || 0
      }
    };
  });

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

  assert.deepEqual(fatalErrors, []);
  console.log(JSON.stringify({ ok: true, models }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
