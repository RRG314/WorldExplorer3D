import { loadClassicScript } from '../modules/script-loader.js?v=56';
import { vendorScriptsCritical } from '../modules/manifest.js?v=597';

export async function createCaptureViewer(host, bytes, signal) {
  if (!globalThis.THREE) await loadClassicScript(vendorScriptsCritical[0]);
  if (!globalThis.THREE.GLTFLoader) await loadClassicScript(vendorScriptsCritical[3]);
  if (!globalThis.THREE.OrbitControls) await loadClassicScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
  if (signal.aborted) return null;
  const T = globalThis.THREE;
  const gltf = await new Promise((resolve, reject) => new T.GLTFLoader().parse(bytes, '', resolve, reject));
  const model = gltf.scene;
  const disposeModel = () => model.traverse(object => {
    object.geometry?.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
  if (signal.aborted) { disposeModel(); return null; }
  const scene = new T.Scene();
  scene.background = new T.Color('#102b36');
  const bounds = new T.Box3().setFromObject(model);
  if (bounds.isEmpty()) { disposeModel(); throw Error('The reconstruction has no visible geometry.'); }
  const center = bounds.getCenter(new T.Vector3());
  const size = bounds.getSize(new T.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(radius) || radius <= 0) { disposeModel(); throw Error('Invalid reconstruction bounds.'); }
  model.position.sub(center);
  scene.add(model, new T.HemisphereLight(0xffffff, 0x4b6970, 1.4));
  const light = new T.DirectionalLight(0xffffff, 0.8);
  light.position.set(1, 2, 3); scene.add(light);
  const camera = new T.PerspectiveCamera(50, 1, radius / 1000, radius * 100);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Your reconstructed model. Drag to rotate, pinch or scroll to zoom. Use the buttons below for keyboard control.');
  canvas.style.cssText = 'display:block;width:100%;height:280px;touch-action:none';
  host.replaceChildren(canvas);
  const controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = radius * 0.04;
  controls.maxDistance = radius * 10;
  let disposed = false;
  const draw = () => { if (!disposed && !document.hidden) renderer.render(scene, camera); };
  const reset = () => { camera.position.set(radius, radius * 0.6, radius * 1.5); controls.target.set(0, 0, 0); controls.update(); draw(); };
  const resize = () => { const w = Math.max(1, host.clientWidth); renderer.setSize(w, 280, false); camera.aspect = w / 280; camera.updateProjectionMatrix(); draw(); };
  controls.addEventListener('change', draw);
  const observer = new ResizeObserver(resize); observer.observe(host);
  document.addEventListener('visibilitychange', draw, { signal });
  reset(); resize();
  const dispose = () => {
    if (disposed) return;
    disposed = true; observer.disconnect(); controls.dispose(); disposeModel(); renderer.dispose(); renderer.forceContextLoss(); host.replaceChildren();
  };
  signal.addEventListener('abort', dispose, { once: true });
  return { dispose, reset, rotate: () => { model.rotation.y += Math.PI / 8; draw(); }, zoom: (factor) => {
    camera.position.multiplyScalar(factor); controls.update(); draw();
  } };
}
