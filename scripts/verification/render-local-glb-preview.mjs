import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const [inputPath, outputPath = 'output/verification/local-glb-preview.png'] = process.argv.slice(2);
if (!inputPath) throw new Error('Usage: node render-local-glb-preview.mjs <model.glb> [preview.png]');
const payload = (await fs.readFile(path.resolve(inputPath))).toString('base64');
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
try {
  await page.goto('http://127.0.0.1:4192/app/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => globalThis.THREE?.GLTFLoader, null, { timeout: 120_000 });
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const gltf = await new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes.buffer, '', resolve, reject));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);
    const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    document.body.appendChild(renderer.domElement);
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const scale = 7 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    model.rotation.set(-0.32, 0.62, 0.08);
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xa9dcff, 0x182038, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x67e8f9, 1.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);
    camera.position.set(0, 2.5, 12);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }, payload);
  await page.screenshot({ path: path.resolve(outputPath) });
} finally {
  await browser.close();
}
