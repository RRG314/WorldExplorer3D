import { ctx as appCtx } from '../shared-context.js?v=55';
import { applyConditionImpact, blastTargets } from './impact-model.js?v=1';
import { applyTransportDamage } from '../transport/damage-model.js?v=1';
import { sampleSweptContact } from '../physics/swept-contact.js?v=1';
import { evaluateParachuteDeployment } from './parachute-model.js?v=6';
import { getScreenLayoutService } from '../ui/screen-layout.js?v=2';
import { NPC_COMBAT_STATES, beginNpcResponse, npcFireDecision } from './npc-combat-policy.js?v=2';
import { reticlePresentation } from './weapon-reticle-authority.js?v=1';
import { resolvePlayerProjectileLaunch } from './projectile-ballistics.js?v=1';
import { readExplorerAppearanceId } from '../characters/explorer-appearance.js?v=1';

const ITEM_ICON_PATHS = Object.freeze({
  hands: '<path d="M18 31v-9a4 4 0 0 1 8 0v6-12a4 4 0 0 1 8 0v12-10a4 4 0 0 1 8 0v12-6a4 4 0 0 1 8 0v13c0 12-7 20-18 20-8 0-13-4-17-10l-7-11a4 4 0 0 1 7-4l3 4Z"/>',
  flashlight: '<path d="M16 10h32l-5 15v27a6 6 0 0 1-6 6H27a6 6 0 0 1-6-6V25L16 10Zm8 9h16l2-6H22l2 6Zm3 9v23h10V28H27Z"/>',
  baton: '<path d="m19 49 7 7 30-38-10-10-8 10 4 4-23 27Zm-7 7 7 0-7-7v7Z"/>',
  'pulse-sidearm': '<path d="M9 22h37l9 8-9 9H31l-3 17H16l5-17H9V22Zm35 6H16v5h30l3-3-5-2Z"/>',
  'compact-sidearm': '<path d="M10 24h34l8 7-8 8H31l-3 16H17l4-16H10V24Zm7 6v4h26l3-3-3-1H17Z"/>',
  'responder-sidearm': '<path d="M8 21h39l9 8-9 10H32l-4 18H16l5-18H8V21Zm10 7v5h28l3-4-4-1H18Zm18-12h9v5h-9v-5Z"/>',
  'laser-gun': '<path d="M7 23h39l11 8-11 8H31l-4 18H15l6-18H7V23Zm10 6v4h28l4-2-4-2H17Zm20-12h8v5h-8v-5Z"/>',
  'paintball-gun': '<path d="M8 25h38l10 7-10 8H31l-4 17H16l5-17H8V25Zm12-14h19l5 12H16l4-12Zm4 5-2 4h15l-2-4H24Z"/>',
  'concussion-charge': '<path d="M25 6h14v8h5l9 13-5 27H16l-5-27 9-13h5V6Zm6 6h2V8h-2v4Zm-9 9-5 8 3 19h24l3-19-5-8H22Z"/><path d="M29 26h6v16h-6zM24 31h16v6H24z"/>',
  parachute: '<path d="M6 28C8 13 18 5 32 5s24 8 26 23H6Zm5-5h42c-4-8-11-12-21-12S15 15 11 23Z"/><path d="m10 27 18 24h8l18-24h-7L34 45h-4L17 27h-7Zm17 24h10v7H27z"/>',
  'field-camera': '<path d="M8 19h13l4-7h14l4 7h13v34H8V19Zm6 6v22h36V25H14Zm18 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>',
  'field-lens': '<path d="M27 7a20 20 0 1 1-12 36l-9 9 6 6 9-9A20 20 0 0 1 27 7Zm0 6a14 14 0 1 0 0 28 14 14 0 0 0 0-28Z"/>',
  'fishing-rod': '<path d="M12 54 47 8l5 4-35 46-5-4Zm32-35 5-6c8 8 11 18 8 28-2 8-8 13-14 11-5-2-7-8-4-12l5 3c-1 2 0 4 2 4 3 1 6-2 7-7 2-7-1-14-9-21Z"/>',
  'hand-trowel': '<path d="m35 7 9 5-14 24-9-5L35 7Zm-17 25 13 8c-2 10-8 17-17 20-5-8-3-18 4-28Z"/>',
  'metal-detector': '<path d="m24 7 7 2-12 37-7-2L24 7Zm4 6h24v7H28v-7ZM20 43c12 0 22 4 22 9s-10 8-22 8S0 57 0 52s8-9 20-9Zm0 6c-8 0-13 2-14 3 1 1 6 2 14 2 9 0 14-1 16-2-2-1-7-3-16-3Z"/>',
  'found-personal-item': '<path d="M9 13h31l15 15-25 25L9 32V13Zm7 7v9l14 15 16-16-9-8H16Zm8 2a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"/>'
});

function itemIconMarkup(item) {
  const id = String(item?.catalogId || item?.id || '');
  const path = ITEM_ICON_PATHS[id] || '<path d="M9 18 32 5l23 13v28L32 59 9 46V18Zm7 4v20l13 7V30l-13-8Zm19 8v19l13-7V22l-13 8ZM20 18l12 7 12-7-12-7-12 7Z"/>';
  return `<svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">${path}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function createUrbanEquipmentRuntime(options = {}) {
  const state = options.state;
  const THREE = options.THREE;
  const isActive = options.isActive;
  const npcPose = options.npcPose;
  const vehiclePose = options.vehiclePose;
  const promoteNpc = options.promoteNpc;
  const promoteVehicle = options.promoteVehicle;
  const reportCivicEvent = options.reportCivicEvent;
  const onNpcShot = options.onNpcShot;
  const onNpcDowned = options.onNpcDowned;
  const setStatus = options.setStatus;
  const clock = options.now || (() => performance.now());
  const effects = [];
  const projectiles = [];
  const reticleFeedback = { firedAt: -Infinity, hitAt: -Infinity };

  function updateReticlePresentation(equipped = state.equipment?.equipped?.()) {
    const reticle = state.equipmentUi?.reticle;
    if (!reticle || !equipped?.projectileKind) return;
    const current = clock();
    const presentation = reticlePresentation({
      kind: equipped.projectileKind,
      speedMph: appCtx.Walk?.state?.walker?.speedMph || 0,
      firedAgoMs: current - reticleFeedback.firedAt,
      hitAgoMs: current - reticleFeedback.hitAt
    });
    reticle.style.setProperty('--reticle-gap', `${presentation.gapPx}px`);
    reticle.dataset.kind = presentation.profile;
    reticle.dataset.recoil = presentation.recoilActive ? 'true' : 'false';
    reticle.dataset.hit = presentation.hitConfirmed ? 'true' : 'false';
  }

  function backpackCategory(item) {
    if (item.category === 'field-tool') return 'field-tool';
    if (item.category === 'specimen') return 'specimen';
    return 'gear';
  }

  function renderDetail(inventory) {
    const ui = state.equipmentUi;
    if (!ui?.detail) return;
    const item = inventory.items.find((entry) => entry.instanceId === state.backpackSelectedId) || null;
    if (!item) {
      ui.detail.innerHTML = '<span>Select an item to see its story and available actions.</span>';
      return;
    }
    const sourceLabels = {
      'starter-loadout': 'Starter gear',
      'starter-field-kit': 'Starter field kit',
      'starter-grant': 'Starter gear',
      'explorer-progression': 'Explorer field kit',
      'field-discovery': 'Found while exploring',
      'fishing-catch': 'Caught while fishing',
      'world-creation': 'Made in the world',
      'recovered-equipment': 'Recovered equipment',
      'Backpack item': 'Backpack item'
    };
    const source = sourceLabels[item.provenance] || 'Found while exploring';
    const acquired = item.acquiredAt ? new Date(item.acquiredAt).toLocaleDateString() : '';
    const actions = [];
    if (item.verbs?.includes('equip')) actions.push(`<button data-backpack-action="equip" data-equipment-id="${escapeHtml(item.instanceId)}" type="button">Equip</button>`);
    if (item.hotbarSlot != null) actions.push(`<button data-backpack-action="clear-slot" data-equipment-id="${escapeHtml(item.instanceId)}" type="button">Remove from slot ${item.hotbarSlot}</button>`);
    if (item.verbs?.includes('use-context')) actions.push(`<button data-backpack-action="field" data-equipment-id="${escapeHtml(item.instanceId)}" type="button">Use for fieldwork</button>`);
    if (item.verbs?.includes('inspect')) actions.push(`<button data-backpack-action="inspect" data-equipment-id="${escapeHtml(item.instanceId)}" type="button">Inspect</button>`);
    const slots = item.verbs?.includes('equip')
      ? Array.from({ length: 6 }, (_, index) => `<button data-backpack-slot="${index + 1}" data-equipment-id="${escapeHtml(item.instanceId)}" type="button">Slot ${index + 1}</button>`).join('')
      : '';
    const description = item.metadata?.description || item.description || `${source}${acquired ? ` · added ${acquired}` : ''}`;
    const capabilities = Array.isArray(item.capabilities) && item.capabilities.length
      ? `<span class="urbanBackpackUse"><b>Useful for</b>${escapeHtml(item.capabilities.map((value) => String(value).replaceAll('-', ' ')).join(' · '))}</span>`
      : '';
    ui.detail.innerHTML = `<strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(description)}</small>${capabilities}${item.metadata?.regionLabel ? `<small>${escapeHtml(item.metadata.regionLabel)}</small>` : ''}<div class="urbanBackpackDetailActions">${actions.join('')}${slots}</div>`;
  }

  function render() {
    const ui = state.equipmentUi;
    if (!ui?.root) return;
    const inventory = state.equipment.snapshot();
    const visible = state.equipmentOpen && isActive();
    ui.root.classList.toggle('show', visible);
    ui.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    ui.toggle.hidden = !state.mobile;
    ui.filters?.querySelectorAll?.('[data-backpack-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.backpackFilter === (state.backpackFilter || 'all'));
    });
    ui.appearance?.querySelectorAll?.('[data-explorer-appearance]').forEach((button) => {
      const selected = button.dataset.explorerAppearance === readExplorerAppearanceId();
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const hotbarItems = new Map(inventory.items.filter((item) => item.hotbarSlot != null).map((item) => [item.hotbarSlot, item]));
    ui.slots.innerHTML = Array.from({ length: 6 }, (_, index) => {
      const slot = index + 1;
      const item = hotbarItems.get(slot);
      if (!item) return `<button class="urbanEquipmentSlot empty" type="button" disabled aria-label="Quick slot ${slot} is empty"><b class="urbanItemSlot">${slot}</b><span class="urbanItemVisual">+</span><strong class="urbanItemName">Empty slot</strong><span class="urbanItemCount">Choose an item below</span></button>`;
      const count = item.magazine !== null ? `${item.magazine}/${item.reserve}` : Number(item.quantity || 0) > 1 ? `×${item.quantity}` : '';
      const selected = item.instanceId === state.backpackSelectedId;
      return `<button class="urbanEquipmentSlot${item.equipped ? ' equipped' : ''}${selected ? ' selected' : ''}" type="button" data-equipment-id="${escapeHtml(item.instanceId)}" aria-pressed="${item.equipped}"${selected ? ' aria-current="true"' : ''} title="${escapeHtml(`${item.hotbarSlot}. ${item.label} · ${count}`)}"><b class="urbanItemSlot">${item.hotbarSlot}</b><span class="urbanItemVisual">${itemIconMarkup(item)}</span><strong class="urbanItemName">${escapeHtml(item.label)}</strong><span class="urbanItemCount">${escapeHtml(count)}</span></button>`;
    }).join('');
    if (ui.contents) {
      const carried = inventory.items.filter((item) => item.hotbarSlot == null && (
        (state.backpackFilter || 'all') === 'all' || backpackCategory(item) === state.backpackFilter
      ));
      ui.contents.innerHTML = carried.length ? carried.map((item) => {
        const verbs = item.verbs?.length ? item.verbs.join(' · ') : 'No available action';
        const selected = item.instanceId === state.backpackSelectedId;
        return `<button class="urbanBackpackItem${item.equipped ? ' equipped' : ''}${selected ? ' selected' : ''}" type="button" data-backpack-inspect="true" data-equipment-id="${escapeHtml(item.instanceId)}" aria-pressed="${item.equipped}"${selected ? ' aria-current="true"' : ''} title="${escapeHtml(`${item.label} · ${verbs}`)}"><span class="urbanItemVisual">${itemIconMarkup(item)}</span><strong class="urbanItemName">${escapeHtml(item.label)}</strong>${Number(item.quantity || 0) > 1 ? `<b class="urbanItemQuantity">${Number(item.quantity)}</b>` : ''}</button>`;
      }).join('') : '<div class="urbanBackpackEmpty">No items in this category</div>';
    }
    renderDetail(inventory);
    const equipped = inventory.items.find((item) => item.equipped);
    const reticleVisible = !!(
      equipped?.projectileKind &&
      appCtx.Walk?.state?.mode === 'walk' &&
      !state.equipmentOpen &&
      isActive()
    );
    ui.reticle?.classList.toggle('show', reticleVisible);
    if (ui.reticle) {
      ui.reticle.dataset.kind = String(equipped?.projectileKind || '');
      if (reticleVisible) updateReticlePresentation(equipped);
    }
    state.equipmentVisual?.setEquipped?.(equipped?.id || 'hands');
    const parachuteState = equipped?.id === 'parachute'
      ? state.parachute?.deployed ? ' · canopy deployed' : ' · deploy after jumping'
      : '';
    ui.status.textContent = `${equipped?.label || 'Hands'} equipped${parachuteState} · ${inventory.items.length} carried`;
  }

  function toggle(force) {
    if (!isActive()) return false;
    state.equipmentOpen = typeof force === 'boolean' ? force : !state.equipmentOpen;
    appCtx.screenLayout ||= getScreenLayoutService();
    appCtx.screenLayout.setPanelLayer('backpack', state.equipmentOpen);
    render();
    return true;
  }

  function inspectItem(instanceId) {
    const item = state.equipment.snapshot().items.find((entry) => entry.instanceId === String(instanceId));
    if (!item) return false;
    state.backpackSelectedId = item.instanceId;
    render();
    return true;
  }

  function setFilter(filter = 'all') {
    state.backpackFilter = ['all', 'field-tool', 'specimen', 'gear'].includes(filter) ? filter : 'all';
    render();
    return true;
  }

  function handleBackpackAction(action, instanceId, slot = null) {
    const item = state.equipment.snapshot().items.find((entry) => entry.instanceId === String(instanceId));
    if (!item) return false;
    if (action === 'clear-slot' && item.hotbarSlot != null) {
      const changed = state.equipment.assignHotbar(item.hotbarSlot, null);
      if (changed) setStatus(`${item.label} removed from quick access.`, 1400);
      render();
      return changed;
    }
    if (slot != null) {
      const changed = state.equipment.assignHotbar(Number(slot), item.instanceId);
      if (changed) setStatus(`${item.label} assigned to slot ${slot}.`, 1400);
      render();
      return changed;
    }
    if (action === 'equip') {
      const changed = state.equipment.equip(item.instanceId);
      if (changed) setStatus(`${item.label} equipped.`, 1200);
      render();
      return changed;
    }
    if (action === 'field') {
      const result = appCtx.worldDiscoveryRuntime?.equipTool?.(item.catalogId);
      Promise.resolve(result).then(() => appCtx.toggleWorldDiscoveryJournal?.(true));
      toggle(false);
      return true;
    }
    if (action === 'inspect') {
      setStatus(`${item.label} · ready in your Backpack`, 2200);
      return inspectItem(item.instanceId);
    }
    return false;
  }

  function equipSlot(slot) {
    if (!isActive() || appCtx.Walk?.state?.mode !== 'walk') return false;
    const changed = state.equipment.equipSlot(slot);
    if (changed) {
      setStatus(`${state.equipment.equipped().label} equipped.`, 1200);
      render();
    }
    return changed;
  }

  function worldTargets(range) {
    const actor = appCtx.Walk?.state?.walker;
    const promotedNpcIds = new Set(state.npcs.map((npc) => npc.sourceAgentId));
    const promotedVehicleIds = new Set(state.vehicles.map((vehicle) => vehicle.trafficAgentId).filter(Boolean));
    return [
      ...state.npcs.filter((npc) => npc.condition > 0).map((npc) => ({ kind: 'npc', ref: npc, ...npcPose(npc) })),
      ...(state.population?.nearbyPedestrians?.(actor, range) || []).filter((entry) => !promotedNpcIds.has(entry.id)).map((entry) => ({ kind: 'ambient_npc', ref: entry, ...entry })),
      ...state.vehicles.filter((vehicle) => !vehicle.attachedToPlayer && vehicle.condition > 0).map((vehicle) => ({ kind: 'vehicle', ref: vehicle, ...vehiclePose(vehicle) })),
      ...(state.population?.nearbyVehicles?.(actor, range) || []).filter((entry) => !promotedVehicleIds.has(entry.id)).map((entry) => ({ kind: 'ambient_vehicle', ref: entry, ...entry })),
      ...(state.responders?.targets?.() || []),
      ...(appCtx.streetFurnitureMeshes || []).filter((object) => object?.userData?.interactiveWorldObject && Number(object.userData.condition ?? 1) > 0).map((object) => ({
        kind: 'furniture', ref: object, x: object.position.x, y: object.position.y, z: object.position.z
      }))
    ].filter((target) => Math.hypot(target.x - actor.x, target.z - actor.z) <= range + 1);
  }

  function aimedTarget(equipment, targets) {
    const actor = appCtx.Walk?.state?.walker;
    if (!actor) return null;
    const direction = new THREE.Vector3();
    appCtx.camera?.getWorldDirection?.(direction);
    direction.y = 0;
    if (direction.lengthSq() < .01) direction.set(Math.sin(actor.angle), 0, Math.cos(actor.angle));
    direction.normalize();
    const melee = equipment.category === 'unarmed' || equipment.category === 'melee';
    return targets.map((target) => {
      const dx = target.x - actor.x;
      const dz = target.z - actor.z;
      const distance = Math.hypot(dx, dz);
      const forward = dx * direction.x + dz * direction.z;
      const lateral = Math.abs(dx * direction.z - dz * direction.x);
      const tolerance = melee ? 1.45 : Math.max(1.3, distance * .075);
      if (distance > equipment.range || forward < (melee ? -.25 : .4) || lateral > tolerance) return null;
      return { target, distance, score: lateral * 4 + distance };
    }).filter(Boolean).sort((a, b) => a.score - b.score)[0] || null;
  }

  function detailedTarget(target) {
    if (target.kind === 'ambient_npc') {
      const npc = promoteNpc(target.ref);
      return npc ? { kind: 'npc', ref: npc, ...npcPose(npc) } : null;
    }
    if (target.kind === 'ambient_vehicle') {
      const vehicle = promoteVehicle(target.ref.id);
      return vehicle ? { kind: 'vehicle', ref: vehicle, ...vehiclePose(vehicle) } : null;
    }
    return target;
  }

  function prepareNpcResponse(npc, destroyed) {
    const response = beginNpcResponse(npc, clock(), destroyed);
    Object.assign(npc, response);
    npc.reactionUntil = response.combatStateUntil;
    npc.visual.setReaction(response.reaction);
    if (response.combatState === NPC_COMBAT_STATES.DOWN) onNpcDowned?.(npc);
    return true;
  }

  function applyImpact(target, force) {
    const detailed = detailedTarget(target);
    if (!detailed) return null;
    if (detailed.kind === 'npc') {
      const npc = detailed.ref;
      const result = applyConditionImpact(npc, force);
      npc.condition = result.after;
      npc.reaction = result.destroyed ? 'downed' : 'hit';
      npc.reactionUntil = result.destroyed ? Infinity : clock() + 1300;
      npc.visual.setReaction(npc.reaction);
      prepareNpcResponse(npc, result.destroyed);
      return { kind: 'npc', id: npc.id, ...result };
    }
    if (detailed.kind === 'vehicle') {
      const vehicle = detailed.ref;
      const result = applyTransportDamage(vehicle, force);
      vehicle.condition = result.after;
      vehicle.visual.setCondition(result.after);
      return { kind: 'vehicle', id: vehicle.id, ...result };
    }
    if (detailed.kind === 'responder_officer' || detailed.kind === 'responder_vehicle') {
      return state.responders?.applyImpact?.(detailed.ref?.id, force) || null;
    }
    const object = detailed.ref;
    const result = applyConditionImpact({ condition: object.userData.condition, resistance: 72 }, force);
    object.userData.condition = result.after;
    object.rotation.z = result.destroyed ? .72 : Math.min(.18, (1 - result.after) * .2);
    return { kind: 'furniture', id: object.uuid, furnitureKind: object.userData.furnitureKind, ...result };
  }

  function sharedTarget(detailed) {
    if (!detailed) return null;
    const ref = detailed.ref;
    const entityId = detailed.kind === 'furniture'
      ? String(ref?.userData?.urbanEntityId || '')
      : String(ref?.id || '');
    if (!entityId) return null;
    return {
      entityId,
      kind: detailed.kind,
      pose: { x: detailed.x, y: detailed.y, z: detailed.z, yaw: detailed.yaw || 0 },
      label: detailed.kind === 'vehicle' ? ref.variant?.label : '',
      style: detailed.kind === 'vehicle' ? ref.variant?.bodyStyle : '',
      color: detailed.kind === 'vehicle' ? ref.color : 0
    };
  }

  function applyAuthoritativeImpact(detailed, result) {
    if (!detailed || !result?.state) return null;
    const after = Number(result.state.condition ?? result.after ?? 1);
    const destroyed = after <= .001;
    if (detailed.kind === 'npc') {
      const npc = detailed.ref;
      npc.condition = after;
      npc.reaction = destroyed ? 'downed' : 'hit';
      npc.reactionUntil = destroyed ? Infinity : clock() + 1300;
      npc.visual.setReaction(npc.reaction);
      prepareNpcResponse(npc, destroyed);
      return { kind: 'npc', id: npc.id, before: result.before, after, destroyed };
    }
    if (detailed.kind === 'vehicle') {
      detailed.ref.condition = after;
      detailed.ref.visual.setCondition(after);
      return { kind: 'vehicle', id: detailed.ref.id, before: result.before, after, destroyed };
    }
    const object = detailed.ref;
    object.userData.condition = after;
    object.rotation.z = destroyed ? .72 : Math.min(.18, (1 - after) * .2);
    return { kind: 'furniture', id: object.userData.urbanEntityId, before: result.before, after, destroyed };
  }

  function terrainHeight(x, z) {
    return typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt(x, z) : appCtx.elevationWorldYAtWorldXZ?.(x, z) || 0;
  }

  function projectileSupportHeight(x, z, currentY) {
    const surfaceY = appCtx.SurfaceQuery?.walkAt?.(x, z, {
      currentY,
      sampleRenderedMesh: false
    })?.position?.y;
    return Number.isFinite(surfaceY) ? Number(surfaceY) : terrainHeight(x, z);
  }

  function impactPulse(position, radius = 1, style = 'pulse') {
    const blast = radius > 1.2;
    const color = style === 'paintball' ? 0xff4f9a : style === 'laser' ? 0x64fff4 : 0xbbe8ff;
    const root = new THREE.Group();
    root.name = blast ? 'Concussion impact ring' : `${style} impact mark`;
    const geometries = [];
    const materials = [];
    if (blast) {
      const ringGeometry = new THREE.RingGeometry(.62, 1, 24);
      const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x74b9e8, transparent: true, opacity: .58, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI * .5;
      root.add(ring);
      geometries.push(ringGeometry);
      materials.push(ringMaterial);
      const shardGeometry = new THREE.IcosahedronGeometry(.055, 0);
      const shardMaterial = new THREE.MeshBasicMaterial({ color: 0xd3efff, transparent: true, opacity: .78, depthWrite: false });
      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * Math.PI * 2;
        const shard = new THREE.Mesh(shardGeometry, shardMaterial);
        shard.position.set(Math.cos(angle) * .58, .05 + (index % 2) * .06, Math.sin(angle) * .58);
        root.add(shard);
      }
      geometries.push(shardGeometry);
      materials.push(shardMaterial);
    } else {
      const geometry = new THREE.IcosahedronGeometry(.14, 1);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72, depthWrite: false });
      root.add(new THREE.Mesh(geometry, material));
      geometries.push(geometry);
      materials.push(material);
    }
    root.position.set(position.x, Number(position.y ?? terrainHeight(position.x, position.z)) + (blast ? .08 : .8), position.z);
    root.scale.setScalar(blast ? .2 : 1);
    state.group.add(root);
    effects.push({ root, geometries, materials, opacities: materials.map((material) => material.opacity), elapsed: 0, duration: blast ? .48 : .24, radius: Math.max(1, radius), blast });
  }

  function commitImpacts(equipment, impactPosition, selected, roomActive) {
    let results = [];
    if (roomActive && selected.length) {
      const shared = selected.map((entry) => sharedTarget(entry.detailed));
      if (shared.some((entry) => !entry)) {
        setStatus('That target is not available in this room.', 2200);
        return;
      }
      state.authorityImpactPending = true;
      setStatus('Checking room action…', 2600);
      state.authority.commitImpacts(equipment, impactPosition, shared).then((response) => {
        if (!isActive()) return;
        state.authorityImpactPending = false;
        if (!response?.accepted) {
          setStatus(response?.reason === 'cooldown' ? 'That room action is not ready yet.' : 'That action could not be used in this room.', 2200);
          return;
        }
        const byId = new Map((response.results || []).map((entry) => [entry.entityId, entry]));
        results = selected.map((entry) => applyAuthoritativeImpact(entry.detailed, byId.get(sharedTarget(entry.detailed)?.entityId))).filter(Boolean);
        state.lastImpactAction = Object.freeze({ equipmentId: equipment.id, resultCount: results.length, authority: 'room', at: clock() });
        if (results.length) setStatus(`${equipment.label} affected ${results.length} room target${results.length === 1 ? '' : 's'}.`);
      }).catch((error) => {
        if (!isActive()) return;
        state.authorityImpactPending = false;
        setStatus('That room action is unavailable right now.', 2800);
      });
      return;
    }
    results = selected.map((entry) => applyImpact(entry.detailed, entry.force)).filter(Boolean);
    state.lastImpactAction = Object.freeze({ equipmentId: equipment.id, resultCount: results.length, authority: 'local', at: clock() });
    if (results.length) setStatus(`${equipment.label} affected ${results.length} target${results.length === 1 ? '' : 's'}.`);
  }

  function projectileMaterial(kind) {
    const colors = {
      pulse: [0xa9e7ff, 0x1b7aa7],
      laser: [0x73fff4, 0x1fb9ad],
      paintball: [0xff4f9a, 0x8c174f],
      'thrown-charge': [0x31434c, 0x14394a]
    };
    const [color] = colors[kind] || colors.pulse;
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .96, depthWrite: kind === 'thrown-charge' });
  }

  function createProjectileVisual(kind) {
    const geometry = kind === 'thrown-charge'
      ? new THREE.IcosahedronGeometry(.16, 1)
      : kind === 'paintball'
        ? new THREE.SphereGeometry(.075, 8, 6)
        : kind === 'laser'
          ? new THREE.CylinderGeometry(.022, .022, .34, 7)
          : new THREE.SphereGeometry(.055, 7, 5);
    const material = projectileMaterial(kind);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${kind} world projectile`;
    mesh.castShadow = kind === 'thrown-charge' || kind === 'paintball';
    state.group.add(mesh);
    return { root: mesh, geometries: [geometry], materials: [material] };
  }

  function disposeProjectile(projectile) {
    if (!projectile || projectile.resolved === true) return false;
    projectile.resolved = true;
    projectile.visual.root.visible = false;
    projectile.visual.root.removeFromParent?.();
    projectile.visual.geometries.forEach((geometry) => geometry.dispose?.());
    projectile.visual.materials.forEach((material) => material.dispose?.());
    return true;
  }

  function segmentTarget(projectile, from, to) {
    const segment = to.clone().sub(from);
    const lengthSq = segment.lengthSq();
    let nearest = null;
    for (const target of worldTargets(projectile.equipment.range + (projectile.equipment.blastRadius || 0))) {
      const baseTargetY = Number(target.y);
      const targetY = (Number.isFinite(baseTargetY) ? baseTargetY : terrainHeight(target.x, target.z)) + (
        target.kind.includes('vehicle') ? .65 :
          target.kind === 'furniture' ? .45 : .95
      );
      const toward = new THREE.Vector3(
        Number(target.x) - from.x,
        targetY - from.y,
        Number(target.z) - from.z
      );
      const t = lengthSq > .0001
        ? Math.max(0, Math.min(1, toward.dot(segment) / lengthSq))
        : 0;
      const point = from.clone().addScaledVector(segment, t);
      const radius = target.kind.includes('vehicle') ? 1.45 : target.kind === 'furniture' ? .62 : .78;
      const distance = point.distanceTo(new THREE.Vector3(Number(target.x), targetY, Number(target.z)));
      if (distance > radius || nearest && t >= nearest.t) continue;
      nearest = { target, t, x: point.x, y: point.y, z: point.z };
    }
    return nearest;
  }

  function segmentWorldContact(from, to) {
    const swept = sampleSweptContact(from, to, .28, (point) => {
      const supportY = projectileSupportHeight(point.x, point.z, point.y);
      const building = appCtx.checkBuildingCollision?.(point.x, point.z, .08, {
        actorBaseY: point.y - .1,
        actorHeight: .2
      })?.collision === true;
      if (!building && point.y > supportY + .12) return null;
      return {
        kind: building ? 'building' : 'terrain',
        position: {
          x: point.x,
          y: building ? point.y : Math.max(supportY, point.y),
          z: point.z
        }
      };
    });
    return swept ? { ...swept.contact, t: swept.t } : null;
  }

  function reticleAimPoint(equipment, actor, direction) {
    const range = Math.max(1, Number(equipment.range || 40));
    const cameraOrigin = new THREE.Vector3(
      Number(appCtx.camera?.position?.x ?? actor.x),
      Number(appCtx.camera?.position?.y ?? actor.y),
      Number(appCtx.camera?.position?.z ?? actor.z)
    );
    const rayEnd = cameraOrigin.clone().addScaledVector(direction, range);
    const targetContact = segmentTarget({ equipment }, cameraOrigin, rayEnd);
    const worldContact = segmentWorldContact(cameraOrigin, rayEnd);
    if (targetContact && (!worldContact || targetContact.t < worldContact.t)) {
      return new THREE.Vector3(targetContact.x, targetContact.y, targetContact.z);
    }
    if (worldContact) {
      return new THREE.Vector3(worldContact.position.x, worldContact.position.y, worldContact.position.z);
    }
    if (equipment.projectileKind === 'thrown-charge') {
      const flat = direction.clone();
      flat.y = 0;
      if (flat.lengthSq() < .001) flat.set(Math.sin(actor.angle), 0, Math.cos(actor.angle));
      flat.normalize();
      const landingX = actor.x + flat.x * range;
      const landingZ = actor.z + flat.z * range;
      return new THREE.Vector3(landingX, projectileSupportHeight(landingX, landingZ, actor.y) + .04, landingZ);
    }
    return rayEnd;
  }

  function alignActorToAim(actor, direction) {
    const horizontal = Math.hypot(direction.x, direction.z);
    if (horizontal <= .001) return;
    actor.angle = Math.atan2(direction.x, direction.z);
    if (appCtx.Walk?.state?.characterMesh?.visible) {
      appCtx.Walk.state.characterMesh.rotation.y = actor.angle;
    }
  }

  function resolveProjectile(projectile, position, directTarget = null) {
    const index = projectiles.indexOf(projectile);
    if (index >= 0) projectiles.splice(index, 1);
    disposeProjectile(projectile);
    const equipment = projectile.equipment;
    const targets = worldTargets(equipment.range + (equipment.blastRadius || 0));
    const selected = equipment.blastRadius
      ? blastTargets(position, targets, equipment).map((entry) => ({ detailed: detailedTarget(entry.target), force: entry.force })).filter((entry) => entry.detailed)
      : directTarget ? [{ detailed: detailedTarget(directTarget), force: equipment.force }] : [];
    impactPulse(position, equipment.blastRadius || .8, equipment.projectileKind);
    if (equipment.category === 'explosive') {
      reportCivicEvent({
        kind: 'explosive_use', position, severity: 3, radius: 52, audibleRadius: 52, maximumWitnesses: 4
      });
    }
    commitImpacts(equipment, position, selected, projectile.roomActive);
    if (directTarget && projectile.owner !== 'npc') reticleFeedback.hitAt = clock();
    const action = Object.freeze({
      equipmentId: equipment.id,
      phase: 'impact',
      targetKind: directTarget?.kind || '',
      x: Number(position.x.toFixed(2)),
      y: Number(position.y.toFixed(2)),
      z: Number(position.z.toFixed(2)),
      at: clock()
    });
    state.lastProjectileAction = action;
    if (projectile.owner !== 'npc') state.lastPlayerProjectileAction = action;
  }

  function spawnProjectile(equipment, actor, direction, roomActive) {
    const kind = equipment.projectileKind || 'pulse';
    const speed = Number(equipment.projectileSpeed || 48);
    const aimPoint = reticleAimPoint(equipment, actor, direction);
    const launch = resolvePlayerProjectileLaunch({
      actor,
      aimDirection: direction,
      aimPoint,
      kind,
      speed,
      range: Number(equipment.range || 40),
      gravity: kind === 'thrown-charge' ? 9.81 : Number(equipment.projectileGravity || 0),
      fuseSeconds: Number(equipment.fuseSeconds || 2.2)
    });
    const origin = new THREE.Vector3(launch.origin.x, launch.origin.y, launch.origin.z);
    const visual = createProjectileVisual(kind);
    visual.root.position.copy(origin);
    const projectile = {
      equipment,
      kind,
      owner: 'player',
      roomActive,
      visual,
      position: origin,
      launchOrigin: launch.origin,
      velocity: new THREE.Vector3(launch.velocity.x, launch.velocity.y, launch.velocity.z),
      distance: 0,
      elapsed: 0,
      maxDistance: launch.maxDistance,
      maxLife: Math.max(.08, Math.min(kind === 'thrown-charge' ? 3.6 : 1.6, Number(launch.maxLife) || .8)),
      createdAt: clock(),
      hardExpiresAt: clock() + Math.max(120, Math.min(kind === 'thrown-charge' ? 3800 : 1700, (Number(launch.maxLife) || .8) * 1000 + 140)),
      aimPoint: launch.target,
      landed: false
    };
    projectiles.push(projectile);
    reticleFeedback.firedAt = clock();
    const action = Object.freeze({
      equipmentId: equipment.id,
      phase: 'travel',
      targetKind: '',
      aimX: Number(launch.target.x.toFixed(2)),
      aimY: Number(launch.target.y.toFixed(2)),
      aimZ: Number(launch.target.z.toFixed(2)),
      originX: Number(launch.origin.x.toFixed(2)),
      originY: Number(launch.origin.y.toFixed(2)),
      originZ: Number(launch.origin.z.toFixed(2)),
      maxDistance: Number(launch.maxDistance.toFixed(2)),
      expectedFlightSeconds: Number(launch.expectedFlightSeconds.toFixed(2)),
      at: clock()
    });
    state.lastProjectileAction = action;
    state.lastPlayerProjectileAction = action;
    state.lastPlayerProjectileLaunch = action;
    if (equipment.category === 'sidearm') {
      reportCivicEvent({
        kind: 'weapon_discharge', position: { x: actor.x, y: actor.y, z: actor.z }, severity: 2,
        radius: 38, audibleRadius: kind === 'paintball' ? 18 : 34, maximumWitnesses: 4
      });
    }
    setStatus(kind === 'thrown-charge' ? 'Charge thrown.' : `${equipment.label} fired.`);
  }

  function fireNpcProjectile(options = {}) {
    if (!isActive()) return false;
    const origin = new THREE.Vector3(Number(options.origin?.x), Number(options.origin?.y), Number(options.origin?.z));
    const target = new THREE.Vector3(Number(options.target?.x), Number(options.target?.y), Number(options.target?.z));
    if (![origin.x, origin.y, origin.z, target.x, target.y, target.z].every(Number.isFinite)) return false;
    const direction = target.sub(origin).normalize();
    const equipment = Object.freeze({
      id: String(options.equipmentId || 'responder-sidearm'),
      label: String(options.label || 'Responder sidearm'),
      category: 'sidearm',
      projectileKind: String(options.projectileKind || 'pulse'),
      projectileSpeed: Number(options.projectileSpeed || 64),
      range: Number(options.range || 44),
      force: Number(options.force || 18)
    });
    const visual = createProjectileVisual(equipment.projectileKind);
    visual.root.position.copy(origin);
    projectiles.push({
      equipment,
      kind: equipment.projectileKind,
      owner: 'npc',
      sourceId: String(options.sourceId || ''),
      onPlayerImpact: typeof options.onPlayerImpact === 'function' ? options.onPlayerImpact : null,
      visual,
      position: origin,
      velocity: direction.multiplyScalar(equipment.projectileSpeed),
      distance: 0,
      elapsed: 0,
      maxLife: Math.min(.9, equipment.range / equipment.projectileSpeed + .12)
      ,createdAt: clock()
      ,hardExpiresAt: clock() + Math.min(1100, equipment.range / equipment.projectileSpeed * 1000 + 180)
    });
    return true;
  }

  function segmentHitsPlayer(from, to) {
    const actor = appCtx.Walk?.state?.walker;
    if (!actor) return null;
    const targetX = Number(actor.x);
    const targetY = Number(actor.y) - .55;
    const targetZ = Number(actor.z);
    const segment = to.clone().sub(from);
    const lengthSq = segment.lengthSq();
    const toward = new THREE.Vector3(targetX - from.x, targetY - from.y, targetZ - from.z);
    const t = lengthSq > .0001 ? Math.max(0, Math.min(1, toward.dot(segment) / lengthSq)) : 0;
    const point = from.clone().addScaledVector(segment, t);
    return point.distanceTo(new THREE.Vector3(targetX, targetY, targetZ)) <= .72
      ? { point, t }
      : null;
  }

  function updateProjectiles(dt) {
    const step = Math.max(0, Math.min(.12, Number(dt) || 0));
    for (const projectile of projectiles.slice()) {
      const finiteState = [
        projectile.position?.x, projectile.position?.y, projectile.position?.z,
        projectile.velocity?.x, projectile.velocity?.y, projectile.velocity?.z,
        projectile.maxLife
      ].every(Number.isFinite);
      const hardExpired = Number(projectile.hardExpiresAt) > 0 && clock() >= projectile.hardExpiresAt;
      const stalledBallistic = projectile.kind !== 'thrown-charge' && projectile.velocity?.lengthSq?.() < .04;
      if (!finiteState || hardExpired || stalledBallistic) {
        const index = projectiles.indexOf(projectile);
        if (index >= 0) projectiles.splice(index, 1);
        disposeProjectile(projectile);
        continue;
      }
      projectile.elapsed += step;
      if (projectile.landed) {
        if (projectile.elapsed >= projectile.maxLife) resolveProjectile(projectile, projectile.position);
        continue;
      }
      const from = projectile.position.clone();
      if (projectile.kind === 'thrown-charge') projectile.velocity.y -= 9.81 * step;
      else if (Number(projectile.equipment.projectileGravity) > 0) projectile.velocity.y -= Number(projectile.equipment.projectileGravity) * step;
      const to = from.clone().addScaledVector(projectile.velocity, step);
      projectile.distance += from.distanceTo(to);
      const playerHit = projectile.owner === 'npc' ? segmentHitsPlayer(from, to) : null;
      const collision = projectile.owner === 'npc' ? null : segmentTarget(projectile, from, to);
      const worldContact = segmentWorldContact(from, to);
      const directContact = projectile.owner === 'npc' ? playerHit : collision;
      if (directContact && (!worldContact || directContact.t < worldContact.t)) {
        const index = projectiles.indexOf(projectile);
        if (projectile.owner === 'npc') {
          if (index >= 0) projectiles.splice(index, 1);
          disposeProjectile(projectile);
          impactPulse(playerHit.point, .8, projectile.kind);
          projectile.onPlayerImpact?.({ force: projectile.equipment.force, sourceId: projectile.sourceId, position: playerHit.point });
          const action = Object.freeze({
            equipmentId: projectile.equipment.id,
            phase: 'player-impact',
            targetKind: 'player',
            at: clock()
          });
          state.lastProjectileAction = action;
          state.lastPlayerProjectileAction = action;
        } else {
          resolveProjectile(projectile, { x: collision.x, y: collision.y, z: collision.z }, collision.target);
        }
        continue;
      }
      if (worldContact) {
        const impactPosition = worldContact.position;
        if (projectile.kind === 'thrown-charge' && worldContact.kind === 'terrain') {
          projectile.position.set(impactPosition.x, impactPosition.y, impactPosition.z);
          projectile.velocity.set(0, 0, 0);
          projectile.landed = true;
          projectile.visual.root.position.set(impactPosition.x, impactPosition.y + .16, impactPosition.z);
          const action = Object.freeze({
            equipmentId: projectile.equipment.id,
            phase: 'landed',
            targetKind: '',
            x: Number(impactPosition.x.toFixed(2)),
            y: Number(impactPosition.y.toFixed(2)),
            z: Number(impactPosition.z.toFixed(2)),
            at: clock()
          });
          state.lastProjectileAction = action;
          if (projectile.owner !== 'npc') state.lastPlayerProjectileAction = action;
          continue;
        }
        if (projectile.owner === 'npc') {
          const index = projectiles.indexOf(projectile);
          if (index >= 0) projectiles.splice(index, 1);
          disposeProjectile(projectile);
          impactPulse(impactPosition, .8, projectile.kind);
        } else {
          resolveProjectile(projectile, impactPosition);
        }
        continue;
      }
      if (projectile.elapsed >= projectile.maxLife || projectile.distance >= Number(projectile.maxDistance || projectile.equipment.range || 30)) {
        if (projectile.kind === 'thrown-charge') {
          resolveProjectile(projectile, { x: to.x, y: to.y, z: to.z });
        } else {
          const index = projectiles.indexOf(projectile);
          if (index >= 0) projectiles.splice(index, 1);
          disposeProjectile(projectile);
          const action = Object.freeze({
            equipmentId: projectile.equipment.id,
            phase: 'expired',
            targetKind: '',
            x: Number(to.x.toFixed(2)),
            y: Number(to.y.toFixed(2)),
            z: Number(to.z.toFixed(2)),
            at: clock()
          });
          state.lastProjectileAction = action;
          if (projectile.owner !== 'npc') state.lastPlayerProjectileAction = action;
        }
        continue;
      }
      projectile.position.copy(to);
      projectile.visual.root.position.copy(to);
      if (projectile.kind === 'thrown-charge') {
        projectile.visual.root.rotation.x += step * 8;
        projectile.visual.root.rotation.z += step * 5;
      } else if (projectile.kind !== 'paintball') {
        projectile.visual.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), projectile.velocity.clone().normalize());
      }
    }
  }

  function updateArmedNpcResponse() {
    const actor = appCtx.Walk?.state?.walker;
    if (!actor) return;
    const current = clock();
    state.npcs.forEach((npc) => {
      const pose = npcPose(npc);
      const decision = npcFireDecision({ ...npc, x: pose.x, z: pose.z }, actor, current, {
        multiplayer: !!appCtx.getCurrentMultiplayerRoom?.(),
        walking: appCtx.Walk?.state?.mode === 'walk'
      });
      if (!decision) return;
      npc.reaction = 'defending';
      npc.reactionUntil = npc.hostileUntil;
      npc.combatState = Number(npc.shotsFired || 0) > 0 ? NPC_COMBAT_STATES.COMBAT : NPC_COMBAT_STATES.DEFEND;
      npc.visual.setReaction('defending');
      npc.visual.root.rotation.y = decision.yaw;
      if (!decision.ready) return;
      const fired = fireNpcProjectile({
        sourceId: npc.id,
        equipmentId: npc.heldEquipment,
        ...decision.profile,
        origin: { x: pose.x, y: pose.y + 1.34, z: pose.z },
        target: { x: Number(actor.x), y: Number(actor.y) - .5, z: Number(actor.z) },
        onPlayerImpact: onNpcShot
      });
      if (!fired) return;
      npc.shotsFired = Number(npc.shotsFired || 0) + 1;
      npc.combatState = NPC_COMBAT_STATES.COMBAT;
      npc.nextShotAt = decision.nextShotAt;
    });
  }

  function use() {
    if (!isActive() || appCtx.Walk?.state?.mode !== 'walk') return false;
    const currentEquipment = state.equipment.equipped();
    const roomActive = !!appCtx.getCurrentMultiplayerRoom?.();
    if (currentEquipment?.id === 'parachute') {
      const actor = appCtx.Walk?.state?.walker;
      if (state.parachute?.deployed) {
        setStatus('Parachute is already deployed.', 1400);
        return true;
      }
      const groundY = Number(actor?._resolvedGroundState?.effectiveGroundY ??
        appCtx.SurfaceQuery?.walkAt?.(actor?.x, actor?.z)?.position?.y ??
        appCtx.elevationWorldYAtWorldXZ?.(actor?.x, actor?.z) ?? 0);
      const feetY = Number(appCtx.Walk?.state?.characterMesh?.position?.y ?? groundY);
      const deployment = evaluateParachuteDeployment({
        environment: appCtx.onMoon || appCtx.onMars ? 'SPACE' : 'EARTH',
        travelMode: appCtx.Walk?.state?.mode,
        onGround: state.parachute?.skydiving === true ? false : actor?.onGround,
        feetY,
        groundY,
        verticalVelocity: actor?.vy
      });
      if (!deployment.allowed) {
        const messages = {
          'earth-only': 'The parachute is only available in Earth exploration.',
          'walking-only': 'Exit the vehicle before using the parachute.',
          'on-ground': 'Jump from a high place before deploying the parachute.',
          'not-descending': 'Deploy after you begin falling.',
          'too-low': 'Too close to the ground to deploy safely.'
        };
        setStatus(messages[deployment.reason] || 'The parachute cannot deploy here.', 1900);
        return true;
      }
      const prepared = state.equipment.prepareUse(Date.now());
      if (!prepared.ok) {
        setStatus('Parachute release is resetting.', 1200);
        return true;
      }
      state.parachute.deployed = true;
      state.parachute.deployedAt = clock();
      state.equipmentVisual?.setParachuteDeployed?.(true);
      setStatus(`Parachute deployed · ${deployment.clearance.toFixed(1)} m clearance`, 2200);
      render();
      return true;
    }
    if (roomActive && currentEquipment?.category !== 'utility' && currentEquipment?.category !== 'mobility' && !state.authority) {
      setStatus('Room actions are still connecting. Damage stays disabled.', 2600);
      return true;
    }
    if (roomActive && state.authorityImpactPending && currentEquipment?.category !== 'utility' && currentEquipment?.category !== 'mobility') {
      setStatus('The previous room action is still being saved.', 1800);
      return true;
    }
    const prepared = state.equipment.prepareUse(Date.now());
    if (!prepared.ok) {
      if (prepared.reason === 'reload' && state.equipment.reload()) setStatus('Reloaded.');
      else if (prepared.reason === 'no_direct_use') {
        state.equipmentVisual?.playUse?.(currentEquipment);
        const fieldUse = appCtx.handleWorldDiscoveryToolUse?.(currentEquipment.id);
        Promise.resolve(fieldUse).then((used) => {
          if (used !== true) setStatus(`${currentEquipment.label} has no suitable activity at this spot.`, 1900);
        });
      }
      else setStatus(prepared.reason === 'cooldown' ? 'Equipment is not ready yet.' : 'No charges or ammunition remaining.');
      render();
      return true;
    }
    const equipment = prepared.definition;
    state.equipmentVisual?.playUse?.(equipment);
    if (prepared.utility === 'flashlight') {
      state.flashlight.visible = prepared.enabled;
      setStatus(prepared.enabled ? 'Field light on.' : 'Field light off.');
      render();
      return true;
    }
    const actor = appCtx.Walk.state.walker;
    const direction = new THREE.Vector3();
    appCtx.camera?.getWorldDirection?.(direction);
    if (direction.lengthSq() < .01) direction.set(Math.sin(actor.angle), 0, Math.cos(actor.angle));
    direction.normalize();
    if (equipment.projectileKind) {
      alignActorToAim(actor, direction);
      spawnProjectile(equipment, actor, direction, roomActive);
      render();
      return true;
    }
    const targets = worldTargets(equipment.range + (equipment.blastRadius || 0));
    const flatDirection = direction.clone();
    flatDirection.y = 0;
    if (flatDirection.lengthSq() < .01) flatDirection.set(Math.sin(actor.angle), 0, Math.cos(actor.angle));
    flatDirection.normalize();
    const aimed = aimedTarget(equipment, targets);
    let impactPosition = aimed?.target || {
      x: actor.x + flatDirection.x * equipment.range * .68,
      y: terrainHeight(actor.x + flatDirection.x * equipment.range * .68, actor.z + flatDirection.z * equipment.range * .68),
      z: actor.z + flatDirection.z * equipment.range * .68
    };
    const selected = equipment.blastRadius
      ? blastTargets(impactPosition, targets, equipment).map((entry) => ({ detailed: detailedTarget(entry.target), force: entry.force })).filter((entry) => entry.detailed)
      : aimed ? [{ detailed: detailedTarget(aimed.target), force: equipment.force }] : [];
    if (aimed && !equipment.blastRadius) impactPosition = aimed.target;
    if (equipment.blastRadius) impactPulse(impactPosition, equipment.blastRadius);
    else if (equipment.category === 'sidearm' && aimed) impactPulse(impactPosition, .8);
    reportCivicEvent({
      kind: 'assault',
      position: impactPosition,
      severity: 1,
      radius: 22,
      audibleRadius: 6,
      maximumWitnesses: 4
    });
    commitImpacts(equipment, impactPosition, selected, roomActive);
    if (!selected.length) setStatus(`${equipment.label} swung.`);
    render();
    return true;
  }

  function update(dt) {
    state.equipmentVisual?.update?.(dt);
    updateProjectiles(dt);
    updateArmedNpcResponse();
    updateReticlePresentation();
    const actor = appCtx.Walk?.state?.walker;
    if (actor && state.flashlight.visible) {
      const direction = new THREE.Vector3();
      appCtx.camera?.getWorldDirection?.(direction);
      state.flashlight.position.set(actor.x, actor.y - .25, actor.z);
      state.flashlight.target.position.set(actor.x + direction.x * 12, actor.y + direction.y * 12, actor.z + direction.z * 12);
      state.flashlight.target.updateMatrixWorld();
    }
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.elapsed += dt;
      const t = Math.min(1, effect.elapsed / effect.duration);
      effect.root.scale.setScalar(effect.blast ? .2 + effect.radius * t : 1 + t * 1.8);
      effect.materials.forEach((material, materialIndex) => { material.opacity = effect.opacities[materialIndex] * Math.max(0, 1 - t); });
      if (t < 1) continue;
      effect.root.removeFromParent?.();
      effect.geometries.forEach((geometry) => geometry.dispose());
      effect.materials.forEach((material) => material.dispose());
      effects.splice(index, 1);
    }
    state.npcs.forEach((npc) => {
      if (npc.reactionUntil && npc.reactionUntil !== Infinity && npc.reactionUntil <= clock()) {
        npc.reactionUntil = 0;
        npc.reaction = '';
        npc.visual.setReaction('');
      }
    });
  }

  function dispose() {
    state.equipmentUi?.reticle?.classList.remove('show');
    projectiles.slice().forEach(disposeProjectile);
    projectiles.length = 0;
    effects.forEach((effect) => {
      effect.root.removeFromParent?.();
      effect.geometries.forEach((geometry) => geometry.dispose());
      effect.materials.forEach((material) => material.dispose());
    });
    effects.length = 0;
  }

  return Object.freeze({
    applyCollisionImpact: (target, force) => applyImpact(target, force),
    dispose,
    equipSlot,
    fireNpcProjectile,
    handleBackpackAction,
    inspectItem,
    render,
    setFilter,
    snapshot: () => Object.freeze({
      activeProjectiles: projectiles.length,
      lastProjectileAction: state.lastProjectileAction || null,
      lastPlayerProjectileAction: state.lastPlayerProjectileAction || null,
      lastPlayerProjectileLaunch: state.lastPlayerProjectileLaunch || null,
      lastImpactAction: state.lastImpactAction || null,
      useAnimation: state.equipmentVisual?.actionSnapshot?.() || null,
      projectiles: projectiles.map((projectile) => Object.freeze({
        equipmentId: projectile.equipment.id,
        kind: projectile.kind,
        owner: projectile.owner || 'player',
        elapsed: Number(projectile.elapsed.toFixed(3)),
        maxLife: Number(Number(projectile.maxLife || 0).toFixed(3)),
        position: Object.freeze({
          x: Number(projectile.position.x.toFixed(2)),
          y: Number(projectile.position.y.toFixed(2)),
          z: Number(projectile.position.z.toFixed(2))
        }),
        launchOrigin: projectile.launchOrigin ? Object.freeze({
          x: Number(projectile.launchOrigin.x.toFixed(2)),
          y: Number(projectile.launchOrigin.y.toFixed(2)),
          z: Number(projectile.launchOrigin.z.toFixed(2))
        }) : null,
        aimPoint: projectile.aimPoint ? Object.freeze({
          x: Number(projectile.aimPoint.x.toFixed(2)),
          y: Number(projectile.aimPoint.y.toFixed(2)),
          z: Number(projectile.aimPoint.z.toFixed(2))
        }) : null,
        distance: Number(projectile.distance.toFixed(2)),
        maxDistance: Number((projectile.maxDistance || projectile.equipment.range || 0).toFixed(2)),
        landed: projectile.landed === true
      })),
      reticleVisible: state.equipmentUi?.reticle?.classList.contains('show') === true,
      armedNpcCount: state.npcs.filter((npc) => npc.heldEquipment && Number(npc.condition ?? 1) > .05).length,
      defendingNpcCount: state.npcs.filter((npc) => Number(npc.hostileUntil || 0) > clock() && Number(npc.condition ?? 1) > .05).length
    }),
    toggle,
    update,
    use
  });
}

export { createUrbanEquipmentRuntime };
