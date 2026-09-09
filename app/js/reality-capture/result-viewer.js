import { loadClassicScript } from '../modules/script-loader.js?v=56';
import { vendorScriptsCritical } from '../modules/manifest.js?v=597';
import { applyCaptureAlignment } from './alignment.js?v=1';

export async function createCaptureViewer(host, bytes, signal, options = {}) {
  if (!globalThis.THREE) await loadClassicScript(vendorScriptsCritical[0]);
  if (!options.model && !globalThis.THREE.GLTFLoader) await loadClassicScript(vendorScriptsCritical[3]);
  if (!globalThis.THREE.OrbitControls) await loadClassicScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
  if (signal.aborted) return null;
  const T = globalThis.THREE;
  let model = options.model || (await new Promise((resolve, reject) => new T.GLTFLoader().parse(bytes, '', resolve, reject))).scene;
  if(options.homeLayout){const {buildAuthoredInterior}=await import('../interiors/authored-geometry.js');const home=buildAuthoredInterior(T,options.homeLayout);home.group.add(model);home.group.traverse(o=>{if(o.userData.kind==='ceiling')o.visible=false;});model=home.group;}
  if(model.name==='authored-home')options={...options,interiorLighting:true};
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
  const placementReview = options.alignment !== undefined;
  if (placementReview) applyCaptureAlignment(model, options.alignment);
  else if(!options.preserveCoordinates) model.position.sub(center);
  scene.add(model, new T.HemisphereLight(0xffffff, 0x4b6970, options.interiorLighting ? .55 : 1.4));
  const reference = new T.Group();
  const footprint = options.spatialContext?.footprint || [];
  if (placementReview && footprint.length >= 3) {
    const height = options.spatialContext?.height?.meters;
    const levels = Number.isFinite(height) && height > 0 ? [0, height] : [0];
    for (const y of levels) {
      const points = [...footprint, footprint[0]].map(p => new T.Vector3(p.x, y, p.z));
      reference.add(new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0x5ad0ff, depthTest: false, transparent: true, opacity: 0.85 })));
    }
    const entrance = options.spatialContext?.entrance;
    if (entrance) reference.add(new T.Line(new T.BufferGeometry().setFromPoints([
      new T.Vector3(entrance.x, 0, entrance.z), new T.Vector3(entrance.x, 2, entrance.z)
    ]), new T.LineBasicMaterial({ color: 0xffcc55, depthTest: false })));
    scene.add(reference);
  }
  const light = new T.DirectionalLight(0xffffff, options.interiorLighting ? .45 : .8);
  light.position.set(1, 2, 3); scene.add(light);
  const camera = new T.PerspectiveCamera(50, 1, radius / 1000, radius * 100);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  if(options.interiorLighting){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.8;}
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', options.label || 'Your reconstructed model. Drag to rotate, pinch or scroll to zoom. Use the buttons below for keyboard control.');
  canvas.style.cssText = 'display:block;width:100%;height:280px;touch-action:none';
  host.replaceChildren(canvas);
  const controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = radius * 0.04;
  controls.maxDistance = radius * 10;
  let disposed = false;
  const events = new AbortController();
  // A tap selects; an orbit/pinch never selects a surface accidentally.
  let press = null;
  const pointers = new Set();
  canvas.addEventListener('pointerdown', e => {
    pointers.add(e.pointerId);
    if (pointers.size !== 1) { press = null; return; }
    press = {id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  }, {signal:events.signal});
  canvas.addEventListener('pointermove', e => {
    if (press && Math.hypot(e.clientX-press.x,e.clientY-press.y)>8) press.moved=true;
  }, {signal:events.signal});
  canvas.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId);
    const tap=press;press=null;
    if (!options.onPick || !tap || tap.moved || tap.id!==e.pointerId || disposed) return;
    const rect=canvas.getBoundingClientRect(), ray=new T.Raycaster();
    ray.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera);
    const hit=ray.intersectObject(model,true).find(h=>h.object.isMesh);
    if(hit)options.onPick({point:model.worldToLocal(hit.point.clone()),object:hit.object});
  }, {signal:events.signal});
  canvas.addEventListener('pointercancel', e=>{pointers.delete(e.pointerId);press=null;}, {signal:events.signal});
  const draw = () => { if (!disposed && !document.hidden) renderer.render(scene, camera); };
  const reset = () => {
    const box = new T.Box3().setFromObject(model);
    if (reference.children.length) box.union(new T.Box3().setFromObject(reference));
    const target = box.getCenter(new T.Vector3());
    const distance = Math.max(...box.getSize(new T.Vector3()).toArray(), 1);
    const fitScale=Number.isFinite(options.fitScale)?Math.max(.5,Math.min(2,options.fitScale)):1;
    camera.position.copy(target).add(new T.Vector3(distance, distance * 0.6, distance * 1.5).multiplyScalar(fitScale));
    camera.near = Math.max(0.001, distance / 1000); camera.far = distance * 100;
    camera.updateProjectionMatrix(); controls.minDistance = distance * 0.04; controls.maxDistance = distance * 10;
    controls.target.copy(target); controls.update(); draw();
  };
  const resize = () => { const w = Math.max(1, host.clientWidth); renderer.setSize(w, 280, false); camera.aspect = w / 280; camera.updateProjectionMatrix(); draw(); };
  controls.addEventListener('change', draw);
  const observer = new ResizeObserver(resize); observer.observe(host);
  document.addEventListener('visibilitychange', draw, { signal });
  reset(); resize();
  if(options.view){camera.position.fromArray(options.view.position);controls.target.fromArray(options.view.target);controls.update();draw();}
  const dispose = () => {
    if (disposed) return;
    disposed = true; events.abort(); signal.removeEventListener('abort',dispose); document.removeEventListener('visibilitychange',draw); observer.disconnect(); controls.dispose(); disposeModel();
    reference.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    renderer.dispose(); renderer.forceContextLoss(); host.replaceChildren();
  };
  signal.addEventListener('abort', dispose, { once: true });
  return { dispose, reset,
    faceDirection: normal => {
      if(disposed)return;
      const box=new T.Box3().setFromObject(model),target=box.getCenter(new T.Vector3());
      const distance=Math.max(...box.getSize(new T.Vector3()).toArray(),1)*1.6;
      controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(normal.x,0,normal.z).multiplyScalar(distance));
      controls.update();draw();
    },
    setInside: position => {
      if(disposed)return;
      camera.position.set(position.x,position.y,position.z);
      camera.near=.03;camera.updateProjectionMatrix();
      controls.target.set(position.x,position.y,position.z-.01);
      controls.minDistance=.01;controls.maxDistance=.01;controls.enableZoom=false;controls.enablePan=false;
      controls.update();draw();
    },
    redraw: draw,
    getView: () => ({position:camera.position.toArray(),target:controls.target.toArray()}),
    updateAlignment: alignment => { if (!placementReview || disposed) return; applyCaptureAlignment(model, alignment); draw(); },
    getPlacement: () => ({ position: model.position.toArray(), scale: model.scale.toArray(), rotationY: model.rotation.y }),
    rotate: () => {
      camera.position.sub(controls.target).applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 8).add(controls.target);
      controls.update(); draw();
    }, zoom: factor => {
      camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); draw();
    } };
}
