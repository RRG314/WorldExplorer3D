import {
  attachCuratedEquipmentVisual,
  curatedEquipmentAssetForId,
  disposeCuratedEquipmentVisual
} from './curated-equipment-visual.js?v=2';
import {
  attachCuratedParachuteVisual,
  disposeCuratedParachuteVisual
} from './curated-parachute-visual.js?v=1';

function createEquipmentVisuals(THREE, characterMesh) {
  const hand = characterMesh?.userData?.limbs?.arm2;
  const offHand = characterMesh?.userData?.limbs?.arm1;
  if (!hand) return null;
  const root = new THREE.Group();
  root.name = 'Urban equipped item';
  root.position.set(0, -.52, .08);
  root.rotation.set(-Math.PI * .48, 0, 0);
  hand.add(root);

  const dark = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: .72, metalness: .24, flatShading: true });
  const metal = new THREE.MeshStandardMaterial({ color: 0x71808a, roughness: .42, metalness: .62, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({ color: 0x4c9ed1, emissive: 0x174b6b, emissiveIntensity: .38, roughness: .4, metalness: .18, flatShading: true });
  const safety = new THREE.MeshStandardMaterial({ color: 0xd59236, roughness: .66, metalness: .08, flatShading: true });
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x2d7dff, roughness: .64, metalness: .02, side: THREE.DoubleSide, flatShading: true });
  const canopyAccent = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: .7, metalness: .01, side: THREE.DoubleSide, flatShading: true });
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd7e0e5, transparent: true, opacity: .9 });
  const materials = [dark, metal, accent, safety, canopyMaterial, canopyAccent, lineMaterial];
  const geometries = new Set();
  const items = new Map();
  let useAction = null;
  let parachuteReady = false;
  let aimPitch = 0;
  let aiming = false;
  const makeItem = (id) => {
    const group = new THREE.Group();
    group.name = `${id} equipped visual`;
    group.visible = false;
    root.add(group);
    items.set(id, group);
    return group;
  };
  const add = (parent, geometry, material, name, position, rotation = null) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.userData.defaultEquipmentFallback = true;
    parent.add(mesh);
    return mesh;
  };

  const flashlight = makeItem('flashlight');
  add(flashlight, new THREE.CylinderGeometry(.045, .055, .34, 10), dark, 'Field light grip', [0, 0, .13], [Math.PI * .5, 0, 0]);
  add(flashlight, new THREE.CylinderGeometry(.09, .055, .12, 10), metal, 'Field light head', [0, 0, .36], [Math.PI * .5, 0, 0]);
  add(flashlight, new THREE.CircleGeometry(.068, 10), accent, 'Field light lens', [0, 0, .425]);

  const baton = makeItem('baton');
  add(baton, new THREE.CylinderGeometry(.033, .04, .72, 10), dark, 'Explorer staff shaft', [0, 0, .33], [Math.PI * .5, 0, 0]);
  add(baton, new THREE.CylinderGeometry(.055, .055, .18, 10), safety, 'Explorer staff grip', [0, 0, -.12], [Math.PI * .5, 0, 0]);

  const sidearm = makeItem('pulse-sidearm');
  add(sidearm, new THREE.BoxGeometry(.14, .16, .36), dark, 'Pulse sidearm body', [0, .02, .2]);
  add(sidearm, new THREE.BoxGeometry(.105, .25, .12), metal, 'Pulse sidearm grip', [0, -.16, .08], [-.2, 0, 0]);
  add(sidearm, new THREE.CylinderGeometry(.052, .052, .22, 10), accent, 'Pulse sidearm emitter', [0, .02, .46], [Math.PI * .5, 0, 0]);
  add(sidearm, new THREE.BoxGeometry(.06, .045, .12), safety, 'Pulse sidearm sight', [0, .12, .18]);

  const grenade = makeItem('concussion-charge');
  const grenadeBody = add(grenade, new THREE.SphereGeometry(.13, 12, 8), dark, 'Explorer grenade body', [0, 0, .18]);
  grenadeBody.scale.set(.82, .76, 1.28);
  add(grenade, new THREE.CylinderGeometry(.065, .08, .09, 10), metal, 'Explorer grenade fuse housing', [0, 0, .34], [Math.PI * .5, 0, 0]);
  add(grenade, new THREE.BoxGeometry(.075, .035, .16), safety, 'Explorer grenade safety lever', [.085, .025, .31], [0, 0, -.16]);
  add(grenade, new THREE.TorusGeometry(.065, .009, 6, 16), metal, 'Explorer grenade pull ring', [-.07, .01, .385], [0, Math.PI * .5, 0]);

  const laser = makeItem('laser-gun');
  add(laser, new THREE.BoxGeometry(.15, .16, .43), dark, 'Laser gun body', [0, .02, .22]);
  add(laser, new THREE.BoxGeometry(.11, .27, .13), metal, 'Laser gun grip', [0, -.17, .08], [-.2, 0, 0]);
  add(laser, new THREE.CylinderGeometry(.045, .062, .32, 10), accent, 'Laser gun emitter', [0, .02, .54], [Math.PI * .5, 0, 0]);
  add(laser, new THREE.BoxGeometry(.08, .055, .17), safety, 'Laser gun sight', [0, .13, .2]);

  const paintball = makeItem('paintball-gun');
  add(paintball, new THREE.CylinderGeometry(.045, .052, .5, 10), dark, 'Paintball barrel', [0, .02, .3], [Math.PI * .5, 0, 0]);
  add(paintball, new THREE.BoxGeometry(.15, .18, .27), metal, 'Paintball receiver', [0, .01, .08]);
  add(paintball, new THREE.BoxGeometry(.11, .28, .12), dark, 'Paintball grip', [0, -.18, .04], [-.18, 0, 0]);
  add(paintball, new THREE.SphereGeometry(.13, 10, 7), safety, 'Paintball hopper', [0, .2, .03]);

  const parachutePack = new THREE.Group();
  parachutePack.name = 'Explorer parachute pack';
  parachutePack.visible = false;
  characterMesh.add(parachutePack);
  const packBody = add(parachutePack, new THREE.SphereGeometry(.3, 16, 10), dark, 'Parachute pack body', [0, 1.08, -.29]);
  packBody.scale.set(.68, 1, .34);
  const packFlap = add(parachutePack, new THREE.SphereGeometry(.16, 14, 8), accent, 'Parachute pack deployment flap', [0, 1.18, -.385]);
  packFlap.scale.set(1.02, .7, .22);
  add(parachutePack, new THREE.TorusGeometry(.045, .009, 6, 14, Math.PI * 1.55), safety, 'Parachute deployment handle', [.22, 1.03, -.27], [Math.PI * .5, 0, Math.PI * .18]);
  [-1, 1].forEach((side) => add(
    parachutePack,
    new THREE.CylinderGeometry(.018, .018, .64, 6),
    metal,
    'Parachute harness strap',
    [side * .17, 1.08, -.13],
    [0, 0, side * .1]
  ));

  const parachuteCanopy = new THREE.Group();
  parachuteCanopy.name = 'Deployed explorer parachute';
  parachuteCanopy.position.set(0, 3.15, 0);
  parachuteCanopy.visible = false;
  characterMesh.add(parachuteCanopy);
  const canopy = add(
    parachuteCanopy,
    new THREE.SphereGeometry(1.75, 20, 8, 0, Math.PI * 2, 0, Math.PI * .5),
    canopyMaterial,
    'Parachute canopy',
    [0, 0, 0]
  );
  canopy.scale.set(1, .48, .78);
  [-.72, 0, .72].forEach((x) => add(
    parachuteCanopy,
    new THREE.BoxGeometry(.34, .025, 1.18),
    canopyAccent,
    'Parachute canopy identity panel',
    [x, .03, 0]
  ));
  const linePoints = [];
  [[-1.35, -.2, -.72], [-1.35, -.2, .72], [1.35, -.2, -.72], [1.35, -.2, .72]].forEach((point) => {
    linePoints.push(...point, point[0] * .12, -2.08, point[2] * .12);
  });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePoints, 3));
  geometries.add(lineGeometry);
  const suspensionLines = new THREE.LineSegments(lineGeometry, lineMaterial);
  suspensionLines.name = 'Parachute suspension lines';
  suspensionLines.userData.defaultEquipmentFallback = true;
  parachuteCanopy.add(suspensionLines);
  void attachCuratedParachuteVisual(THREE, parachuteCanopy);

  const visualIdFor = (id) => ['compact-sidearm', 'responder-sidearm'].includes(String(id || '')) ? 'pulse-sidearm' : String(id || 'hands');
  const curatedRightWrist = () => {
    const visual = characterMesh?.userData?.curatedCharacterAttachment?.visual;
    if (!visual) return null;
    let match = null;
    visual.traverse?.((object) => {
      if (match) return;
      const normalizedName = String(object?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedName === 'wristr' || normalizedName === 'rightwrist') match = object;
    });
    return match;
  };
  const syncCuratedHandAnchor = () => {
    // GLTFLoader sanitizes punctuation in imported node names in some Three.js
    // releases, so match the stable semantic name instead of one spelling.
    const wrist = curatedRightWrist();
    if (!wrist || !characterMesh?.parent) return false;
    if (root.parent !== characterMesh) characterMesh.attach(root);
    const wristWorld = wrist.getWorldPosition(new THREE.Vector3());
    root.position.copy(characterMesh.worldToLocal(wristWorld));
    root.position.add(new THREE.Vector3(.015, -.025, .035));
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    root.userData.attachment = 'curated-right-wrist';
    return true;
  };
  const resetRootPose = () => {
    if (syncCuratedHandAnchor()) return true;
    if (root.parent !== hand) hand.attach(root);
    root.position.set(0, -.52, .08);
    root.rotation.set(-Math.PI * .48, 0, 0);
    root.scale.setScalar(1);
    root.userData.attachment = 'fallback-right-arm';
    return false;
  };
  const setEquipped = (id) => {
    const visualId = visualIdFor(id);
    items.forEach((group, itemId) => { group.visible = itemId === visualId; });
    if (curatedEquipmentAssetForId(id)) void attachCuratedEquipmentVisual(THREE, items.get(visualId), id);
    parachutePack.visible = parachuteReady || parachuteCanopy.visible;
    root.userData.equippedId = String(id || 'hands');
    resetRootPose();
  };
  setEquipped('hands');
  return Object.freeze({
    root,
    setEquipped,
    setAimDirection(direction, active = true) {
      aiming = active === true && direction && [direction.x, direction.y, direction.z].every(Number.isFinite);
      const horizontal = aiming ? Math.hypot(direction.x, direction.z) : 0;
      aimPitch = aiming ? Math.max(-.72, Math.min(.72, -Math.atan2(direction.y, Math.max(.001, horizontal)))) : 0;
      return aiming;
    },
    setParachuteReady(ready = false) {
      parachuteReady = ready === true;
      parachutePack.visible = parachuteReady || parachuteCanopy.visible;
    },
    setParachuteDeployed(deployed = false) {
      parachuteCanopy.visible = deployed === true;
      parachutePack.visible = deployed === true || parachuteReady;
    },
    playUse(definition = {}) {
      const category = String(definition.category || 'utility');
      useAction = {
        id: String(definition.id || root.userData.equippedId || 'hands'),
        category,
        elapsed: 0,
        duration: category === 'melee' || category === 'unarmed' ? .42 : category === 'explosive' ? .58 : .3
      };
      return true;
    },
    update(dt = 0) {
      const curatedGrip = resetRootPose();
      if (aiming) root.rotation.x += aimPitch;
      if (!useAction) return;
      useAction.elapsed += Math.max(0, Number(dt) || 0);
      const progress = Math.min(1, useAction.elapsed / useAction.duration);
      const motion = Math.sin(progress * Math.PI);
      if (useAction.category === 'unarmed') {
        if (!curatedGrip) {
          hand.rotation.x = -1.35 * motion;
          hand.rotation.z = -.12 * motion;
        }
        if (offHand && !curatedGrip) {
          offHand.rotation.x = -1.12 * motion;
          offHand.rotation.z = .12 * motion;
        }
      } else if (useAction.category === 'melee') {
        if (!curatedGrip) {
          hand.rotation.x = -.55 - motion * 1.15;
          hand.rotation.z = -.18 - motion * .46;
        }
        root.rotation.z = -motion * 1.15;
        root.rotation.y = motion * .28;
      } else if (useAction.category === 'sidearm') {
        if (!curatedGrip) {
          hand.rotation.x = -1.12;
          hand.rotation.z = -.12;
        }
        root.position.z -= motion * .11;
        root.position.y += motion * .035;
        root.rotation.x -= motion * .16;
      } else if (useAction.category === 'explosive') {
        if (!curatedGrip) {
          hand.rotation.x = -motion * 2.05;
          hand.rotation.z = -motion * .32;
        }
        root.rotation.x -= motion * .8;
        root.rotation.z -= motion * .3;
      } else {
        if (!curatedGrip) {
          hand.rotation.x = -motion * 1.05;
          hand.rotation.z = -motion * .14;
        }
        root.position.y += motion * .06;
      }
      root.scale.setScalar(1 + motion * .06);
      if (progress >= 1) {
        useAction = null;
        resetRootPose();
      }
    },
    actionSnapshot() {
      return useAction ? Object.freeze({ id: useAction.id, category: useAction.category, progress: Math.min(1, useAction.elapsed / useAction.duration) }) : null;
    },
    equipmentSnapshot() {
      const equippedId = String(root.userData.equippedId || 'hands');
      const visualId = visualIdFor(equippedId);
      const group = items.get(visualId);
      return Object.freeze({
        equippedId,
        attachment: String(root.userData.attachment || ''),
        curatedAssetId: String(group?.userData?.curatedEquipmentAssetId || ''),
        fallbackVisible: group?.children?.some?.((child) => child?.userData?.defaultEquipmentFallback === true && child.visible !== false) === true
        ,aiming
        ,aimPitch: Number(aimPitch.toFixed(4))
      });
    },
    parachuteSnapshot() {
      return Object.freeze({
        ready: parachuteReady,
        packVisible: parachutePack.visible === true,
        canopyVisible: parachuteCanopy.visible === true,
        curatedAssetId: String(parachuteCanopy.userData.curatedParachuteAssetId || '')
      });
    },
    dispose() {
      root.userData.disposed = true;
      items.forEach((group) => disposeCuratedEquipmentVisual(group));
      root.removeFromParent?.();
      parachutePack.removeFromParent?.();
      disposeCuratedParachuteVisual(parachuteCanopy);
      parachuteCanopy.removeFromParent?.();
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createEquipmentVisuals };
