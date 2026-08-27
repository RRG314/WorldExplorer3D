import { animateAnimalModel, createAnimalModel } from '../discovery/animal-models.js?v=1';
import { COMPANION_CATALOG } from '../discovery/catalog.js?v=2';
import { createNaturalHistoryModel } from '../discovery/natural-history-models.js?v=1';

const ANIMAL_RECORD_SPECIES = Object.freeze({
  'wetland-waterbird-clue': 'mallard',
  'woodland-track-clue': 'white-tailed-deer',
  'urban-nature-photo': 'rock-pigeon'
});

function disposeObject(root) {
  root?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material?.dispose?.());
  });
  root?.parent?.remove?.(root);
}

function createContent(THREE, request, plan) {
  const root = new THREE.Group();
  root.name = `AR ${request.type || 'content'}`;
  const animated = [];
  let retriever = null;
  if (request.type === 'companion') {
    const model = createAnimalModel(THREE, request.companion.catalogId);
    const size = Number(request.companion.visualVariation?.size || 1);
    const catalog = COMPANION_CATALOG.find((entry) => entry.id === request.companion.catalogId);
    model.scale.setScalar(size * Number(catalog?.arScale || .66));
    root.add(model);
    animated.push(model);
  } else if (request.type === 'specimen') {
    const catalogId = request.record.catalogId;
    const animalSpecies = ANIMAL_RECORD_SPECIES[catalogId];
    const model = animalSpecies ? createAnimalModel(THREE, animalSpecies) : createNaturalHistoryModel(THREE, catalogId);
    model.scale.setScalar(animalSpecies ? .78 : 1.08);
    root.add(model);
    if (animalSpecies) animated.push(model);
  } else if (request.type === 'field-challenge') {
    plan.actors.forEach((actor, index) => {
      const model = createAnimalModel(THREE, actor.speciesId);
      model.scale.setScalar(.55);
      model.userData.arActorId = actor.id;
      model.traverse((child) => { child.userData.arActorId = actor.id; });
      root.add(model);
      animated.push(model);
      model.position.set((index - 1.5) * .7, actor.height, -index * .12);
    });
    if (request.companion?.catalogId === 'trail-hound') {
      retriever = createAnimalModel(THREE, 'trail-hound');
      retriever.name = `AR Field Helper ${request.companion.instanceId}`;
      retriever.scale.setScalar(.48 * Number(request.companion.visualVariation?.size || 1));
      retriever.position.set(0, 0, .85);
      retriever.rotation.y = Math.PI;
      retriever.visible = false;
      root.add(retriever);
    }
  }
  return { root, animated, retriever };
}

function createArPresentation(options = {}) {
  const THREE = options.THREE || globalThis.THREE;
  if (!THREE) throw new Error('Three.js is unavailable.');
  const canvas = options.canvas;
  const request = options.request;
  const plan = options.challengePlan || null;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'default' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .01, 50);
  camera.position.set(0, .62, 3.4);
  camera.lookAt(0, .42, 0);
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x33402a, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(-2, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8bc8ff, .5);
  fill.position.set(3, 1, 1);
  scene.add(fill);
  const content = createContent(THREE, request, plan);
  scene.add(content.root);
  content.root.position.set(0, request.type === 'field-challenge' ? .05 : .08, 0);
  content.root.rotation.y = request.type === 'field-challenge' ? 0 : Math.PI;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(.78, 48),
    new THREE.MeshStandardMaterial({ color: 0x16313a, transparent: true, opacity: .28, roughness: .95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.03;
  floor.visible = request.type !== 'field-challenge';
  scene.add(floor);
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(.07, .09, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4c9cff, transparent: true, opacity: .9 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const diagnosticBounds = new THREE.Box3();
  const diagnosticCenter = new THREE.Vector3();
  let elapsed = 0;
  let placed = false;
  let disposed = false;
  let slowFrames = 0;
  let reduced = false;
  let lastTimestamp = 0;
  let spatialMode = false;
  const captured = new Set();

  function resize() {
    const width = Math.max(1, canvas.clientWidth || globalThis.innerWidth || 1);
    const height = Math.max(1, canvas.clientHeight || globalThis.innerHeight || 1);
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, reduced ? 1.15 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function update(timestamp = performance.now()) {
    if (disposed) return;
    const dt = lastTimestamp ? Math.min(.05, Math.max(.001, (timestamp - lastTimestamp) / 1000)) : 1 / 60;
    lastTimestamp = timestamp;
    elapsed += dt;
    if (dt > .034) slowFrames++; else slowFrames = Math.max(0, slowFrames - 2);
    if (!reduced && slowFrames > 90) { reduced = true; resize(); }
    if (request.type === 'field-challenge' && plan) {
      // Keep every survey target inside the usable horizontal field of view.
      // Portrait phones have far less horizontal room than desktop AR canvases.
      const travelSpan = Math.min(2.8, Math.max(.62, camera.aspect * 1.55));
      content.animated.forEach((model, index) => {
        const actor = plan.actors[index];
        const travel = ((elapsed * actor.speed * actor.direction + actor.phase / Math.PI) % 2 + 2) % 2;
        model.position.x = (travel - 1) * travelSpan;
        model.position.y = .28 + actor.height + Math.sin(elapsed * 1.8 + actor.phase) * .12;
        model.position.z = -.35 - index * .2;
        model.rotation.y = actor.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        model.visible = !captured.has(actor.id);
        animateAnimalModel(model, elapsed + actor.phase, 1.15);
      });
      if (content.retriever?.visible) {
        content.retriever.position.y = Math.abs(Math.sin(elapsed * 3.1)) * .035;
        animateAnimalModel(content.retriever, elapsed, .8);
      }
    } else {
      content.root.rotation.y += dt * .16;
      content.animated.forEach((model, index) => animateAnimalModel(model, elapsed + index * .2, .45));
    }
    renderer.render(scene, camera);
  }

  function hitChallenge(clientX, clientY) {
    if (request.type !== 'field-challenge') return null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(content.root, true).find((entry) => entry.object?.userData?.arActorId && !captured.has(entry.object.userData.arActorId));
    if (!hit) return null;
    const actorId = hit.object.userData.arActorId;
    captured.add(actorId);
    return actorId;
  }

  function rotate(deltaX, deltaY = 0) {
    if (request.type === 'field-challenge') return;
    content.root.rotation.y += Number(deltaX || 0) * .008;
    content.root.rotation.x = Math.max(-.35, Math.min(.35, content.root.rotation.x + Number(deltaY || 0) * .004));
  }

  function scaleBy(factor) {
    const next = Math.max(.55, Math.min(1.8, content.root.scale.x * Number(factor || 1)));
    content.root.scale.setScalar(next);
    return next;
  }

  function placeAtReticle() {
    if (spatialMode && !reticle.visible) return false;
    if (reticle.visible) {
      content.root.position.setFromMatrixPosition(reticle.matrix);
      floor.position.copy(content.root.position);
    }
    placed = true;
    content.root.visible = true;
    floor.visible = true;
    return placed;
  }

  function setSpatialMode(active = true) {
    spatialMode = active === true;
    if (spatialMode && !placed) {
      content.root.visible = false;
      floor.visible = false;
    }
  }

  function updateXr(frame, hitTestSource, referenceSpace) {
    if (!placed && frame && hitTestSource && referenceSpace) {
      const results = frame.getHitTestResults(hitTestSource);
      if (results.length) {
        const pose = results[0].getPose(referenceSpace);
        reticle.visible = !!pose;
        if (pose) reticle.matrix.fromArray(pose.transform.matrix);
      } else reticle.visible = false;
    } else reticle.visible = false;
    update(performance.now());
  }

  resize();
  return Object.freeze({
    renderer, scene, camera, content: content.root,
    hitChallenge,
    placeAtReticle,
    resize,
    rotate,
    scaleBy,
    setSpatialMode,
    update,
    updateXr,
    setChallengeComplete(complete = true) { if (content.retriever) content.retriever.visible = complete === true; },
    snapshot: () => {
      const rect = canvas.getBoundingClientRect();
      const targetHitPoints = request.type === 'field-challenge'
        ? Object.freeze(content.animated.map((model, index) => {
          diagnosticBounds.setFromObject(model).getCenter(diagnosticCenter);
          diagnosticCenter.project(camera);
          const visible = model.visible === true && Math.abs(diagnosticCenter.x) <= 1 && Math.abs(diagnosticCenter.y) <= 1 && diagnosticCenter.z >= -1 && diagnosticCenter.z <= 1;
          return Object.freeze({
            actorId: plan?.actors?.[index]?.id || null,
            captured: captured.has(plan?.actors?.[index]?.id),
            visible,
            clientX: rect.left + (diagnosticCenter.x + 1) * rect.width * .5,
            clientY: rect.top + (1 - diagnosticCenter.y) * rect.height * .5
          });
        }))
        : Object.freeze([]);
      return Object.freeze({
        placed,
        spatialMode,
        reticleVisible: reticle.visible,
        reduced,
        captured: captured.size,
        actorCount: plan?.actors?.length || 0,
        targetHitPoints,
        retrieverAvailable: !!content.retriever,
        retrieverVisible: content.retriever?.visible === true
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop?.(null);
      disposeObject(content.root);
      disposeObject(floor);
      disposeObject(reticle);
      renderer.renderLists?.dispose?.();
      renderer.dispose?.();
    }
  });
}

export { ANIMAL_RECORD_SPECIES, createArPresentation };
