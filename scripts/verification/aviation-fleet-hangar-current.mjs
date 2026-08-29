import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const outputDir = 'output/verification/aviation-fleet-hangar-current';
await fs.mkdir(outputDir, { recursive: true });
const htmlPath = `${outputDir}/hangar.html`;
await fs.writeFile(htmlPath, `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#cfd5d7;font-family:Arial,sans-serif}
canvas{display:block}#label{position:fixed;left:24px;top:22px;padding:10px 14px;background:#111b22;color:#fff;font:700 18px/1.2 Arial;border-left:4px solid #c76738}
</style></head><body><div id="label">Aircraft</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script type="module">
import { AVIATION_CATALOG } from '/app/js/transport/aviation-catalog.js?v=2';
import { aircraftGroundOffset, createAircraftVisual, updateAircraftVisual } from '/app/js/transport/aircraft-visual-recipe.js?v=4';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9da9af);
scene.fog=new THREE.Fog(0x9da9af,90,260);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,500);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff,0x52606a,.92));
const sun=new THREE.DirectionalLight(0xffffff,1.25);sun.position.set(-28,42,-18);sun.castShadow=true;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(260,260),new THREE.MeshStandardMaterial({color:0x5b656a,roughness:.92,metalness:.02}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.2;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(220,44,0x829098,0x829098);grid.position.y=-1.18;grid.material.opacity=.22;grid.material.transparent=true;scene.add(grid);
let active=null;
globalThis.renderAircraft=(id)=>{
  active?.dispose?.();
  const entry=AVIATION_CATALOG.find((item)=>item.id===id);if(!entry)return false;
  active=createAircraftVisual(THREE,entry,{mobile:false,state:'active'});scene.add(active.root);
  const footprint=Math.max(entry.dimensions.length,entry.dimensions.wingspan||entry.dimensions.rotorDiameter||entry.dimensions.width);
  const groundOffset=aircraftGroundOffset(entry);active.root.position.y=groundOffset-1.2;
  camera.position.set(footprint*.72,Math.max(entry.dimensions.height*.62,footprint*.24),-footprint*.86);
  camera.lookAt(0,Math.max(.2,entry.dimensions.height*.12),0);
  document.getElementById('label').textContent=entry.label;
  updateAircraftVisual(active,1,.1);renderer.render(scene,camera);return true;
};
function frame(){if(active)updateAircraftVisual(active,1,1/60);renderer.render(scene,camera);requestAnimationFrame(frame)}
frame();globalThis.__HANGAR_READY__=true;
</script></body></html>`);

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4533, 4534, 4535] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(`${baseUrl}/${htmlPath}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__HANGAR_READY__ === true, null, { timeout: 120_000 });
  const ids = ['expedition-prop', 'business-jet', 'regional-jet', 'long-range-airliner', 'utility-helicopter'];
  const screenshots = [];
  for (const id of ids) {
    assert.equal(await page.evaluate((catalogId) => globalThis.renderAircraft(catalogId), id), true);
    await page.waitForTimeout(350);
    const path = `${outputDir}/${id}.png`;
    await page.screenshot({ path });
    screenshots.push(path);
  }
  const report = { ok: pageErrors.length === 0 && screenshots.length === 5, screenshots, pageErrors };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Focused aircraft hangar render failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
