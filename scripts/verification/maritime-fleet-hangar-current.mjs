import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const outputDir = 'output/verification/maritime-fleet-hangar-current';
await fs.mkdir(outputDir, { recursive: true });
const htmlPath = `${outputDir}/hangar.html`;
await fs.writeFile(htmlPath, `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#9da9af;font-family:Arial,sans-serif}
canvas{display:block}#label{position:fixed;left:24px;top:22px;padding:10px 14px;background:#111b22;color:#fff;font:700 18px/1.2 Arial;border-left:4px solid #d36b35}
</style></head><body><div id="label">Vessel</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script type="module">
import { MARITIME_CATALOG } from '/app/js/transport/maritime-catalog.js?v=1';
import { createVesselVisual, updateVesselVisual } from '/app/js/transport/vessel-visual-recipe.js?v=6';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9da9af);scene.fog=new THREE.Fog(0x9da9af,220,620);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,1200);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xeef7ff,0x43545b,1.05));const sun=new THREE.DirectionalLight(0xffffff,1.4);sun.position.set(-48,80,-32);sun.castShadow=true;scene.add(sun);
const water=new THREE.Mesh(new THREE.PlaneGeometry(900,900),new THREE.MeshStandardMaterial({color:0x2d6876,roughness:.42,metalness:.08}));water.rotation.x=-Math.PI/2;water.receiveShadow=true;scene.add(water);
const grid=new THREE.GridHelper(700,70,0x6f9299,0x6f9299);grid.position.y=.02;grid.material.opacity=.18;grid.material.transparent=true;scene.add(grid);
let active=null;globalThis.renderVessel=(id,condition=1)=>{active?.dispose?.();const entry=MARITIME_CATALOG.find((item)=>item.id===id);if(!entry)return false;active=createVesselVisual(THREE,entry,{mobile:false,state:'active'});scene.add(active.root);active.root.position.y=Math.min(entry.dimensions.draft*.5,entry.dimensions.width*.22);const extent=Math.max(entry.dimensions.length,entry.dimensions.height*1.8);camera.position.set(extent*.7,Math.max(entry.dimensions.height*.8,extent*.28),-extent*.82);camera.lookAt(0,Math.max(1,entry.dimensions.height*.2),0);document.getElementById('label').textContent=entry.label+(condition<1?' · damage '+Math.round((1-condition)*100)+'%':'');updateVesselVisual(active,condition);renderer.render(scene,camera);return true;};
function frame(){renderer.render(scene,camera);requestAnimationFrame(frame)}frame();globalThis.__HANGAR_READY__=true;
</script></body></html>`);

const externalUrl = String(process.env.WE3D_VERIFY_BASE_URL || '').replace(/\/$/, '');
const server = externalUrl ? null : await startStaticServer({ rootDir: process.cwd(), ports: [4536, 4537, 4538] });
const baseUrl = externalUrl || `http://127.0.0.1:${server.port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

try {
  await page.goto(`${baseUrl}/${htmlPath}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.__HANGAR_READY__ === true, null, { timeout: 120_000 });
  const ids = ['marina-runabout', 'cruising-sailboat', 'coastal-workboat', 'harbor-tug', 'passenger-ferry', 'ocean-research-vessel', 'container-cargo-ship'];
  const screenshots = [];
  for (const id of ids) {
    assert.equal(await page.evaluate((catalogId) => globalThis.renderVessel(catalogId), id), true);
    await page.waitForTimeout(250);
    const path = `${outputDir}/${id}.png`;
    await page.screenshot({ path });
    screenshots.push(path);
  }
  for (const damageState of [
    { id: 'marina-runabout', condition: .42, suffix: 'damaged' },
    { id: 'container-cargo-ship', condition: .18, suffix: 'critical' }
  ]) {
    assert.equal(await page.evaluate(({ id, condition }) => globalThis.renderVessel(id, condition), damageState), true);
    await page.waitForTimeout(250);
    const path = `${outputDir}/${damageState.id}-${damageState.suffix}.png`;
    await page.screenshot({ path });
    screenshots.push(path);
  }
  const report = { ok: pageErrors.length === 0 && screenshots.length === ids.length + 2, screenshots, pageErrors };
  await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.ok, true, 'Focused maritime hangar render failed.');
} finally {
  await context.close();
  await browser.close();
  await server?.close();
}
