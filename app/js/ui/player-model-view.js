import { createAuxiliaryRenderer, disposeThreeRenderer } from '../engine/webgl-lifecycle.js?v=2';
import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';
import { prepareE34Model } from '../engine/curated-player-car.js?v=7';

// On-demand player introduction rendering. Original model leases retain resource ownership.
export function createIntroModelView() {
  const THREE = globalThis.THREE;
  if (!THREE) throw Error('The model viewer could not load. Your choices are still available.');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x192320);
  const renderer = createAuxiliaryRenderer({
    canvas: document.createElement('canvas'),
    pixelRatioCap: 1.5,
    optionsList: [
      { antialias: true, alpha: false, powerPreference: 'low-power' },
      { antialias: false, alpha: false },
    ],
  });
  if (!renderer) throw Error('The model viewer could not start. Your choices are still available.');
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Selected game model. Drag or use left and right arrows to rotate.'
  );
  renderer.domElement.setAttribute('role', 'img');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 100);
  scene.add(new THREE.HemisphereLight(0xe9f0e8, 0x4e6056, 1.25));
  const light = new THREE.DirectionalLight(0xffe5cf, 1.5);
  light.position.set(3, 5, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xb9d8f4, 1.2);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.8, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x26382d).convertSRGBToLinear() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.015;
  scene.add(ground);
  let container,
    status,
    credit,
    instance,
    model,
    mixer,
    requested,
    loading = false,
    disposed = false,
    yaw = 0;
  const events = new AbortController();
  function draw() {
    if (!container?.isConnected || disposed) return;
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    if (model) model.rotation.y = yaw;
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(draw);
  function release() {
    mixer?.stopAllAction();
    if (mixer && instance) mixer.uncacheRoot(instance.root);
    mixer = null;
    if (model) scene.remove(model);
    instance?.dispose();
    instance = null;
    model = null;
  }
  async function drain() {
    if (loading || disposed) return;
    loading = true;
    while (requested && !disposed) {
      const next = requested;
      requested = null;
      release();
      if (status) {
        status.hidden = false;
        status.textContent = 'Loading the game model…';
      }
      let loaded;
      try {
        loaded = await loadModelAsset(THREE, next.id);
        if (disposed || requested) {
          loaded.dispose();
          continue;
        }
        instance = loaded;
        const root =
          next.id === 'vehicle-bmw-525i-e34'
            ? prepareE34Model(THREE, loaded.root, loaded.record)
            : loaded.root;
        if (next.kind === 'character') {
          root.traverse((o) => {
            if (o.isMesh && /pistol|rifle|gun|weapon/i.test(o.name)) o.visible = false;
          });
          const clip =
            loaded.animations.find((c) => /^idle$/i.test(c.name)) || loaded.animations[0];
          if (clip) {
            mixer = new THREE.AnimationMixer(root);
            mixer.clipAction(clip).play();
            mixer.update(0.01);
          }
        }
        root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(root),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        const scale =
          next.kind === 'character'
            ? 1.8 / Math.max(0.001, size.y)
            : 4.5 / Math.max(0.001, size.x, size.z);
        root.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
        model = new THREE.Group();
        model.add(root);
        model.scale.setScalar(scale);
        scene.add(model);
        yaw = next.kind === 'character' ? -0.16 : 0.65;
        camera.position.set(
          next.kind === 'character' ? 0 : 4.6,
          next.kind === 'character' ? 1.05 : 2.6,
          next.kind === 'character' ? 4.6 : 6.2
        );
        camera.lookAt(0, next.kind === 'character' ? 0.95 : 0.6, 0);
        if (status) status.hidden = true;
        if (credit) credit.textContent = `${loaded.record.attribution} · ${loaded.record.license}`;
        renderer.domElement.dataset.assetId = next.id;
        renderer.domElement.dataset.presentation =
          next.id === 'vehicle-bmw-525i-e34' ? 'original-primary-e34' : 'original-model';
        draw();
      } catch (error) {
        if (status && !disposed) {
          status.hidden = false;
          status.textContent = 'Model unavailable. You can still keep this selection and continue.';
        }
        if (!disposed) console.warn('[intro model]', error.message);
      }
    }
    loading = false;
  }
  let dragX = null;
  renderer.domElement.addEventListener(
    'pointerdown',
    (e) => {
      dragX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    },
    { signal: events.signal }
  );
  renderer.domElement.addEventListener(
    'pointermove',
    (e) => {
      if (dragX === null) return;
      yaw += (e.clientX - dragX) * 0.009;
      dragX = e.clientX;
      draw();
    },
    { signal: events.signal }
  );
  const endDrag = () => {
    dragX = null;
  };
  renderer.domElement.addEventListener('pointerup', endDrag, { signal: events.signal });
  renderer.domElement.addEventListener('pointercancel', endDrag, { signal: events.signal });
  renderer.domElement.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        yaw += e.key === 'ArrowLeft' ? -0.2 : 0.2;
        draw();
      }
    },
    { signal: events.signal }
  );
  return {
    mount(node, assetId, kind) {
      if (disposed) return;
      observer.disconnect();
      container = node;
      container.append(renderer.domElement);
      status = container.parentElement.querySelector('[data-model-status]');
      credit = container.parentElement.querySelector('[data-model-credit]');
      observer.observe(container);
      if (renderer.domElement.dataset.assetId === assetId && !loading) draw();
      else {
        requested = { id: assetId, kind };
        void drain();
      }
    },
    rotate(delta) {
      yaw += delta;
      draw();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      events.abort();
      release();
      ground.geometry.dispose();
      ground.material.dispose();
      disposeThreeRenderer(renderer);
      renderer.domElement.remove();
    },
  };
}
