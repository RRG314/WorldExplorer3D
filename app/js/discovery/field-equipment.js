import { createNaturalHistoryModel } from './natural-history-models.js?v=1';
import { animateAnimalModel } from './animal-models.js?v=2';
import { sampleDiscoverySurfaceY } from './surface.js?v=1';

const ACTIVITY_TOOL = Object.freeze({
  'metal-detect': 'metal-detector', 'geology-inspect': 'rock-hammer', 'pan-sediment': 'sediment-pan',
  photograph: 'field-camera', 'fossil-document': 'specimen-brush', forage: 'field-lens',
  'nature-observe': 'field-binoculars', 'insect-macro': 'field-camera',
  'habitat-survey': 'field-lens', 'community-survey': 'field-lens',
  'sonar-survey': 'portable-sonar',
  'wildlife-track': 'field-binoculars', 'trail-camera-survey': 'field-camera', survey: 'field-lens',
  inspect: 'field-lens', beachcomb: 'hand-trowel', 'virtual-archaeology': 'hand-trowel',
  'treasure-hunt': 'field-shovel', 'forest-survey': 'field-lens', 'weather-observe': 'field-lens'
});

function disposeObject(object) {
  object?.parent?.remove?.(object);
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function createFieldEquipmentPresentation(appCtx) {
  const THREE = globalThis.THREE;
  if (!THREE) return { update() {}, setRevealed() {}, setFieldRevealed() {}, setExcavation() {}, dispose() {}, diagnostics: { meshes: 0, triangles: 0, drawCalls: 0 } };
  const holder = new THREE.Group();
  holder.name = 'World Discovery Held Field Equipment';
  const materials = {
    dark: new THREE.MeshStandardMaterial({ color: 0x141b21, roughness: .68, metalness: .35, flatShading: true }),
    steel: new THREE.MeshStandardMaterial({ color: 0x86939b, roughness: .38, metalness: .78, flatShading: true }),
    blue: new THREE.MeshStandardMaterial({ color: 0x286ad1, emissive: 0x071a3d, roughness: .48, metalness: .25, flatShading: true }),
    screen: new THREE.MeshStandardMaterial({ color: 0x72d7ff, emissive: 0x0c5775, emissiveIntensity: .8, roughness: .2, metalness: .08 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x74502f, roughness: .84, metalness: .02, flatShading: true }),
    brush: new THREE.MeshStandardMaterial({ color: 0xd1b07a, roughness: .95, metalness: 0, flatShading: true })
  };
  const tools = new Map();
  let screen = null;
  let attachedCharacter = null;
  let attachmentTarget = null;
  let firstPersonAttachment = false;
  let fieldReveal = null;
  let fieldRevealSlotId = null;
  let revealCatalogId = null;
  let elapsed = 0;

  const mesh = (parent, geometry, material, name, position, rotation) => {
    const item = new THREE.Mesh(geometry, material);
    item.name = name;
    item.position.set(...position);
    if (rotation) item.rotation.set(...rotation);
    item.castShadow = true;
    parent.add(item);
    return item;
  };
  const toolGroup = (id) => {
    const group = new THREE.Group();
    group.name = `Held ${id}`;
    group.visible = false;
    holder.add(group);
    tools.set(id, group);
    return group;
  };

  {
    const tool = toolGroup('metal-detector');
    tool.position.x = .32;
    mesh(tool, new THREE.TorusGeometry(.29, .032, 8, 24), materials.dark, 'Detector search coil', [.05, .08, .28], [Math.PI / 2, 0, 0]);
    mesh(tool, new THREE.TorusGeometry(.20, .018, 6, 18), materials.blue, 'Detector inner coil', [.05, .08, .28], [Math.PI / 2, 0, 0]);
    mesh(tool, new THREE.BoxGeometry(.38, .025, .035), materials.dark, 'Coil brace', [.05, .08, .28], [0, .35, 0]);
    mesh(tool, new THREE.CylinderGeometry(.025, .033, .72, 8), materials.steel, 'Lower detector shaft', [.05, .43, .20], [-.17, 0, 0]);
    mesh(tool, new THREE.CylinderGeometry(.035, .035, .30, 8), materials.dark, 'Upper detector shaft', [.05, .88, .11], [-.17, 0, 0]);
    mesh(tool, new THREE.CylinderGeometry(.05, .05, .24, 8), materials.dark, 'Detector grip', [.05, 1.03, .08], [Math.PI / 2 - .17, 0, 0]);
    mesh(tool, new THREE.BoxGeometry(.28, .19, .10), materials.blue, 'Detector control box', [.05, .77, .24], [-.17, 0, 0]);
    screen = mesh(tool, new THREE.BoxGeometry(.20, .10, .018), materials.screen, 'Detector illuminated display', [.05, .80, .296], [-.17, 0, 0]);
    [-.06, 0, .06].forEach((x) => mesh(tool, new THREE.CylinderGeometry(.011, .011, .012, 8), materials.dark, 'Detector input button', [.05 + x, .71, .296], [Math.PI / 2, 0, 0]));
    mesh(tool, new THREE.TorusGeometry(.10, .012, 5, 18, Math.PI * 1.4), materials.dark, 'Detector arm cuff', [.05, 1.07, .01], [0, 0, Math.PI / 2]);
  }
  {
    const tool = toolGroup('field-shovel');
    mesh(tool, new THREE.CylinderGeometry(.026, .031, 1.35, 8), materials.wood, 'Shovel shaft', [.02, .76, .16], [-.36, 0, 0]);
    mesh(tool, new THREE.BoxGeometry(.34, .4, .055), materials.steel, 'Shovel blade', [.02, .11, .42], [-.36, 0, 0]);
    mesh(tool, new THREE.TorusGeometry(.12, .025, 7, 16, Math.PI), materials.dark, 'Shovel D grip', [.02, 1.43, -.11], [0, 0, Math.PI]);
  }
  {
    const tool = toolGroup('hand-trowel');
    mesh(tool, new THREE.CylinderGeometry(.035, .042, .38, 8), materials.dark, 'Trowel grip', [.39, .85, .31], [Math.PI / 2.7, 0, 0]);
    mesh(tool, new THREE.ConeGeometry(.13, .38, 5), materials.steel, 'Trowel blade', [.39, .55, .52], [Math.PI, 0, 0]);
  }
  {
    const tool = toolGroup('rock-hammer');
    mesh(tool, new THREE.CylinderGeometry(.026, .034, .55, 8), materials.wood, 'Rock hammer handle', [.39, .84, .28], [.6, 0, 0]);
    mesh(tool, new THREE.BoxGeometry(.38, .12, .12), materials.steel, 'Rock hammer head', [.39, 1.08, .12], [0, 0, 0]);
    mesh(tool, new THREE.ConeGeometry(.07, .26, 6), materials.steel, 'Rock hammer pick', [.59, 1.08, .12], [0, 0, -Math.PI / 2]);
  }
  {
    const tool = toolGroup('specimen-brush');
    mesh(tool, new THREE.CylinderGeometry(.025, .032, .56, 8), materials.wood, 'Brush handle', [.4, .86, .3], [.62, 0, 0]);
    mesh(tool, new THREE.CylinderGeometry(.065, .035, .2, 10), materials.brush, 'Brush bristles', [.4, .62, .47], [.62, 0, 0]);
  }
  {
    const tool = toolGroup('field-camera');
    mesh(tool, new THREE.BoxGeometry(.32, .22, .15), materials.dark, 'Camera body', [.36, 1.09, .37]);
    mesh(tool, new THREE.CylinderGeometry(.085, .105, .16, 12), materials.steel, 'Camera lens', [.36, 1.09, .49], [Math.PI / 2, 0, 0]);
    mesh(tool, new THREE.CylinderGeometry(.067, .067, .01, 16), materials.screen, 'Camera lens glass', [.36, 1.09, .576], [Math.PI / 2, 0, 0]);
    mesh(tool, new THREE.BoxGeometry(.1, .045, .07), materials.dark, 'Camera viewfinder', [.36, 1.225, .35]);
  }
  {
    const tool = toolGroup('field-binoculars');
    [-.08, .08].forEach((x) => {
      mesh(tool, new THREE.CylinderGeometry(.072, .09, .32, 12), materials.dark, 'Binocular barrel', [.34 + x, 1.28, .34], [Math.PI / 2, 0, 0]);
      mesh(tool, new THREE.CylinderGeometry(.058, .058, .012, 12), materials.screen, 'Binocular glass', [.34 + x, 1.28, .507], [Math.PI / 2, 0, 0]);
    });
    mesh(tool, new THREE.BoxGeometry(.17, .08, .13), materials.blue, 'Binocular bridge', [.34, 1.28, .34]);
  }
  {
    const tool = toolGroup('field-lens');
    mesh(tool, new THREE.TorusGeometry(.12, .022, 8, 20), materials.steel, 'Field lens rim', [.4, 1.04, .43], [0, 0, 0]);
    mesh(tool, new THREE.CylinderGeometry(.022, .03, .32, 8), materials.dark, 'Field lens handle', [.4, .82, .43]);
  }
  {
    const tool = toolGroup('sediment-pan');
    mesh(tool, new THREE.CylinderGeometry(.28, .18, .10, 20, 1, true), materials.dark, 'Sediment pan', [.36, .72, .43], [0, 0, .16]);
    mesh(tool, new THREE.TorusGeometry(.28, .025, 8, 24), materials.blue, 'Sediment pan rim', [.36, .77, .43], [Math.PI / 2, 0, 0]);
  }
  {
    const tool = toolGroup('portable-sonar');
    mesh(tool, new THREE.BoxGeometry(.32, .22, .14), materials.dark, 'Portable sonar body', [.36, 1.02, .36]);
    mesh(tool, new THREE.BoxGeometry(.23, .13, .018), materials.screen, 'Portable sonar display', [.36, 1.04, .44]);
    mesh(tool, new THREE.CylinderGeometry(.045, .045, .18, 10), materials.blue, 'Portable sonar transducer', [.53, .88, .38], [Math.PI / 2, 0, 0]);
  }

  holder.userData.worldDiscoveryEquipment = true;

  const reveal = new THREE.Group();
  reveal.name = 'World Discovery Reveal';
  reveal.visible = false;
  const findMaterial = new THREE.MeshStandardMaterial({ color: 0xc99035, emissive: 0x6f2f0b, emissiveIntensity: .8, roughness: .28, metalness: .76, depthTest: false });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x2d7dff, depthTest: false });
  const findMesh = mesh(reveal, new THREE.CylinderGeometry(.28, .28, .07, 24), findMaterial, 'Revealed find', [0, 0, 0], [Math.PI / 2, 0, 0]);
  findMesh.renderOrder = 30;
  const glow = mesh(reveal, new THREE.TorusGeometry(.48, .03, 8, 28), glowMaterial, 'Reveal locator ring', [0, 0, 0], [Math.PI / 2, 0, 0]);
  glow.renderOrder = 29;
  reveal.userData.worldDiscovery = true;
  appCtx.addEarthWorldObject?.(reveal);

  const excavation = new THREE.Group();
  excavation.name = 'World Discovery Excavation';
  excavation.visible = false;
  const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2b1c, roughness: 1, metalness: 0, flatShading: true });
  const cutMaterial = new THREE.MeshStandardMaterial({ color: 0x17110c, roughness: 1, metalness: 0, flatShading: true });
  mesh(excavation, new THREE.CylinderGeometry(.46, .58, .05, 18), cutMaterial, 'Excavation opening', [0, .01, 0]);
  const soilRing = mesh(excavation, new THREE.TorusGeometry(.62, .11, 6, 18), soilMaterial, 'Excavated soil ring', [0, .08, 0], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2;
    const radius = .58 + (index % 3) * .08;
    mesh(excavation, new THREE.DodecahedronGeometry(.06 + (index % 2) * .025, 0), soilMaterial, 'Excavated soil clod', [Math.cos(angle) * radius, .1, Math.sin(angle) * radius]);
  }
  excavation.userData.worldDiscovery = true;
  appCtx.addEarthWorldObject?.(excavation);

  function attachToCharacter() {
    const character = appCtx.Walk?.state?.characterMesh;
    const firstPerson = appCtx.Walk?.state?.view === 'first' && !!appCtx.camera;
    const target = firstPerson ? appCtx.camera : character;
    if (!target) return;
    attachedCharacter = character;
    if (attachmentTarget === target && firstPersonAttachment === firstPerson) return;
    holder.parent?.remove?.(holder);
    target.add(holder);
    if (firstPerson) {
      holder.position.set(-.18, -1.02, -1.5);
      holder.rotation.set(-.08, Math.PI, 0);
      holder.scale.setScalar(.72);
    } else {
      holder.position.set(0, 0, 0);
      holder.rotation.set(0, 0, 0);
      holder.scale.setScalar(1);
    }
    attachmentTarget = target;
    firstPersonAttachment = firstPerson;
  }

  function update(actor, sessionSnapshot, dt, activityId = 'metal-detect') {
    elapsed += Math.max(0, Number(dt) || 0);
    attachToCharacter();
    const isWalking = appCtx.Walk?.state?.mode === 'walk' && !!attachmentTarget;
    const phase = sessionSnapshot?.phase || 'idle';
    const equipmentActive = !!sessionSnapshot?.active && !['recorded', 'collected', 'left', 'complete'].includes(phase);
    const toolId = sessionSnapshot?.activeToolId || ACTIVITY_TOOL[activityId] || 'field-lens';
    tools.forEach((tool, id) => { tool.visible = equipmentActive && isWalking && id === toolId; });
    holder.visible = equipmentActive && isWalking;
    const excavating = phase === 'excavating';
    const observing = phase === 'observing';
    const deliberateSwing = observing && (toolId === 'rock-hammer' || toolId === 'specimen-brush');
    holder.rotation.z = toolId === 'metal-detector'
      ? Math.sin(elapsed * 3.2) * .18
      : toolId === 'sediment-pan' && observing
        ? Math.sin(elapsed * 4.4) * .2
        : deliberateSwing
          ? Math.sin(elapsed * (toolId === 'rock-hammer' ? 6.4 : 8.2)) * (toolId === 'rock-hammer' ? .32 : .13)
          : excavating ? Math.sin(elapsed * 8) * .12 : 0;
    holder.rotation.x = excavating
      ? -.12 + Math.max(0, Math.sin(elapsed * 8)) * .28
      : toolId === 'sediment-pan' && observing
        ? -.18 + Math.sin(elapsed * 3.1) * .08
        : toolId === 'field-camera' && observing
          ? -.22 + Math.sin(elapsed * 2.2) * .015
          : 0;
    if (screen) screen.material.emissiveIntensity = .55 + Number(sessionSnapshot?.signalStrength || 0) * 2.1;
    const arm = firstPersonAttachment ? null : attachedCharacter?.userData?.limbs?.arm2;
    if (arm && equipmentActive) {
      arm.rotation.x = toolId === 'field-binoculars' || toolId === 'field-camera'
        ? -1.25
        : toolId === 'rock-hammer' && observing
          ? -.65 + Math.sin(elapsed * 6.4) * .55
          : toolId === 'specimen-brush' && observing
            ? -.55 + Math.sin(elapsed * 8.2) * .18
            : excavating ? -.72 + Math.sin(elapsed * 8) * .34 : -.34;
      arm.rotation.z = -.2;
    }
    if (reveal.visible) {
      reveal.rotation.y += Math.max(0, Number(dt) || 0) * .8;
      glow.scale.setScalar(1 + Math.sin(elapsed * 4) * .08);
    }
    if (excavation.visible) {
      soilRing.rotation.z += Math.max(0, Number(dt) || 0) * .05;
      excavation.scale.setScalar(.96 + Math.sin(elapsed * 5) * .015);
    }
    if (fieldReveal?.visible && fieldReveal.userData?.worldDiscoveryAnimal) animateAnimalModel(fieldReveal, elapsed, .42);
  }

  function setRevealed(slot, visible) {
    reveal.visible = !!(visible && slot);
    if (!reveal.visible) return;
    const y = sampleDiscoverySurfaceY(appCtx, slot.position.x, slot.position.z);
    const actor = appCtx.Walk?.state?.walker;
    const actorY = Number(actor?.y);
    const surfaceY = Number.isFinite(y) ? y : Number.isFinite(actorY) ? actorY - 1.7 : 0;
    let nextGeometry = null;
    if (revealCatalogId !== slot.catalogId) {
      if (slot.catalogId === 'brass-transit-token') nextGeometry = new THREE.CylinderGeometry(.26, .26, .055, 28);
      else if (slot.catalogId === 'iron-trade-buckle') nextGeometry = new THREE.TorusGeometry(.25, .055, 7, 16);
      else if (slot.catalogId === 'copper-keepsake') nextGeometry = new THREE.BoxGeometry(.34, .08, .25, 2, 1, 2);
      else if (slot.catalogId === 'aluminum-trail-tag') nextGeometry = new THREE.BoxGeometry(.36, .045, .22);
      else if (slot.catalogId === 'weathered-can-tab') nextGeometry = new THREE.TorusGeometry(.18, .045, 7, 16);
      else if (slot.catalogId === 'sea-smoothed-disc') nextGeometry = new THREE.CylinderGeometry(.23, .25, .06, 18);
    }
    if (nextGeometry) {
      findMesh.geometry?.dispose?.();
      findMesh.geometry = nextGeometry;
      revealCatalogId = slot.catalogId;
    }
    reveal.position.set(slot.position.x, surfaceY + .2, slot.position.z);
  }

  function setExcavation(slot, phase) {
    const visible = !!slot && ['excavating', 'revealed'].includes(String(phase));
    excavation.visible = visible;
    if (!visible) return;
    const y = sampleDiscoverySurfaceY(appCtx, slot.position.x, slot.position.z);
    const actorY = Number(appCtx.Walk?.state?.walker?.y);
    const surfaceY = Number.isFinite(y) ? y : Number.isFinite(actorY) ? actorY - 1.7 : 0;
    excavation.position.set(slot.position.x, surfaceY + .02, slot.position.z);
  }

  function setFieldRevealed(slot, visible) {
    if (!visible || !slot) {
      if (fieldReveal) fieldReveal.visible = false;
      fieldRevealSlotId = null;
      return;
    }
    const wasVisible = fieldReveal?.visible === true;
    if (!fieldReveal || fieldReveal.userData?.worldDiscoveryNaturalHistory?.catalogId !== slot.catalogId) {
      disposeObject(fieldReveal);
      fieldReveal = createNaturalHistoryModel(THREE, slot.catalogId);
      appCtx.addEarthWorldObject?.(fieldReveal);
    }
    fieldReveal.visible = true;
    const isAnimal = !!fieldReveal.userData?.worldDiscoveryAnimal;
    if (wasVisible && fieldRevealSlotId === slot.id) return;
    const actor = appCtx.Walk?.state?.walker;
    let targetX = Number(slot.position.x);
    let targetZ = Number(slot.position.z);
    if (isAnimal && actor) {
      const viewDirection = new THREE.Vector3();
      appCtx.camera?.getWorldDirection?.(viewDirection);
      viewDirection.y = 0;
      if (viewDirection.lengthSq() < .001) {
        const angle = Number(actor.angle || actor.yaw || 0);
        viewDirection.set(-Math.sin(angle), 0, -Math.cos(angle));
      } else viewDirection.normalize();
      const actorSurfaceY = sampleDiscoverySurfaceY(appCtx, Number(actor.x || 0), Number(actor.z || 0));
      const candidates = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI].flatMap((rotation) =>
        [4.2, 5.4].map((distance) => {
          const direction = viewDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
          const x = Number(actor.x || 0) + direction.x * distance;
          const z = Number(actor.z || 0) + direction.z * distance;
          const surfaceY = sampleDiscoverySurfaceY(appCtx, x, z);
          const collision = Number.isFinite(surfaceY) ? appCtx.checkBuildingCollision?.(x, z, 1.6, {
            actorBaseY: surfaceY,
            actorHeight: 1.6
          }) : null;
          const stableGround = Number.isFinite(surfaceY) && (!Number.isFinite(actorSurfaceY) || Math.abs(surfaceY - actorSurfaceY) < 2.4);
          return { x, z, surfaceY, eligible: stableGround && collision?.collision !== true };
        })
      );
      const selected = candidates.find((candidate) => candidate.eligible);
      if (selected) {
        targetX = selected.x;
        targetZ = selected.z;
      }
    }
    const y = sampleDiscoverySurfaceY(appCtx, targetX, targetZ);
    const actorY = Number(actor?.y);
    const surfaceY = Number.isFinite(y) ? y : Number.isFinite(actorY) ? actorY - 1.7 : 0;
    fieldReveal.position.set(targetX, surfaceY + .03, targetZ);
    if (isAnimal && actor) fieldReveal.rotation.y = Math.atan2(Number(actor.x || 0) - targetX, Number(actor.z || 0) - targetZ);
    fieldRevealSlotId = slot.id;
  }

  let meshCount = 0;
  let triangleCount = 0;
  holder.traverse((child) => {
    if (!child.isMesh) return;
    meshCount++;
    triangleCount += child.geometry?.index ? child.geometry.index.count / 3 : (child.geometry?.attributes?.position?.count || 0) / 3;
  });
  return {
    holder, reveal, excavation, update, setRevealed, setFieldRevealed, setExcavation,
    get fieldReveal() { return fieldReveal; },
    dispose() { disposeObject(holder); disposeObject(reveal); disposeObject(excavation); disposeObject(fieldReveal); },
    diagnostics: Object.freeze({ meshes: meshCount + 12, triangles: Math.round(triangleCount + 600), drawCalls: meshCount + 12, heldAttachment: true, distinctTools: tools.size, excavationFeedback: true })
  };
}

export { ACTIVITY_TOOL, createFieldEquipmentPresentation };
