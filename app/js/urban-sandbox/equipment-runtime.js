import { ctx as appCtx } from '../shared-context.js?v=55';
import { applyConditionImpact, blastTargets } from './impact-model.js?v=1';

function createUrbanEquipmentRuntime(options = {}) {
  const state = options.state;
  const THREE = options.THREE;
  const isActive = options.isActive;
  const npcPose = options.npcPose;
  const vehiclePose = options.vehiclePose;
  const promoteNpc = options.promoteNpc;
  const promoteVehicle = options.promoteVehicle;
  const reportCivicEvent = options.reportCivicEvent;
  const setStatus = options.setStatus;
  const clock = options.now || (() => performance.now());
  const effects = [];

  function render() {
    const ui = state.equipmentUi;
    if (!ui?.root) return;
    const inventory = state.equipment.snapshot();
    const visible = state.equipmentOpen && appCtx.Walk?.state?.mode === 'walk';
    ui.root.classList.toggle('show', visible);
    ui.root.setAttribute('aria-hidden', visible ? 'false' : 'true');
    ui.toggle.hidden = !(state.mobile && appCtx.Walk?.state?.mode === 'walk');
    ui.slots.innerHTML = inventory.items.map((item) => {
      const count = item.magazine !== null ? `${item.magazine}/${item.reserve}` : item.quantity !== null ? `${item.quantity} left` : item.category;
      return `<button class="urbanEquipmentSlot${item.equipped ? ' equipped' : ''}" type="button" data-equipment-id="${item.id}" aria-pressed="${item.equipped}"><strong>${item.slot} · ${item.icon}</strong><span>${item.label}</span><span>${count}</span></button>`;
    }).join('');
    const equipped = inventory.items.find((item) => item.equipped);
    state.equipmentVisual?.setEquipped?.(equipped?.id || 'hands');
    ui.status.textContent = `${equipped?.label || 'Hands'} equipped${inventory.sandboxItems ? ` · ${inventory.sandboxItems} sandbox item${inventory.sandboxItems === 1 ? '' : 's'}` : ''}`;
  }

  function toggle(force) {
    if (!isActive() || appCtx.Walk?.state?.mode !== 'walk') return false;
    state.equipmentOpen = typeof force === 'boolean' ? force : !state.equipmentOpen;
    render();
    return true;
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
      return { kind: 'npc', id: npc.id, ...result };
    }
    if (detailed.kind === 'vehicle') {
      const vehicle = detailed.ref;
      const result = applyConditionImpact({ condition: vehicle.condition, resistance: vehicle.resistance || 160 }, force);
      vehicle.condition = result.after;
      vehicle.visual.setCondition(result.after);
      return { kind: 'vehicle', id: vehicle.id, ...result };
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

  function impactPulse(position, radius = 1) {
    const blast = radius > 1.2;
    const root = new THREE.Group();
    root.name = blast ? 'Concussion impact ring' : 'Pulse impact spark';
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
      const material = new THREE.MeshBasicMaterial({ color: 0xbbe8ff, transparent: true, opacity: .72, depthWrite: false });
      root.add(new THREE.Mesh(geometry, material));
      geometries.push(geometry);
      materials.push(material);
    }
    root.position.set(position.x, Number(position.y ?? terrainHeight(position.x, position.z)) + (blast ? .08 : .8), position.z);
    root.scale.setScalar(blast ? .2 : 1);
    state.group.add(root);
    effects.push({ root, geometries, materials, opacities: materials.map((material) => material.opacity), elapsed: 0, duration: blast ? .48 : .24, radius: Math.max(1, radius), blast });
  }

  function use() {
    if (!isActive() || appCtx.Walk?.state?.mode !== 'walk') return false;
    const currentEquipment = state.equipment.equipped();
    const roomActive = !!appCtx.getCurrentMultiplayerRoom?.();
    if (roomActive && currentEquipment?.category !== 'utility' && !state.authority) {
      setStatus('Shared impact authority is connecting. Room damage remains locked.', 2600);
      return true;
    }
    if (roomActive && state.authorityImpactPending && currentEquipment?.category !== 'utility') {
      setStatus('The previous room interaction is still being verified.', 1800);
      return true;
    }
    const prepared = state.equipment.prepareUse(Date.now());
    if (!prepared.ok) {
      if (prepared.reason === 'reload' && state.equipment.reload()) setStatus('Reloaded.');
      else setStatus(prepared.reason === 'cooldown' ? 'Equipment is not ready yet.' : 'No charges or ammunition remaining.');
      render();
      return true;
    }
    const equipment = prepared.definition;
    state.equipmentVisual?.pulse?.();
    if (prepared.utility === 'flashlight') {
      state.flashlight.visible = prepared.enabled;
      setStatus(prepared.enabled ? 'Field light on.' : 'Field light off.');
      render();
      return true;
    }
    const targets = worldTargets(equipment.range + (equipment.blastRadius || 0));
    const aimed = aimedTarget(equipment, targets);
    const actor = appCtx.Walk.state.walker;
    const direction = new THREE.Vector3();
    appCtx.camera?.getWorldDirection?.(direction);
    direction.y = 0;
    if (direction.lengthSq() < .01) direction.set(Math.sin(actor.angle), 0, Math.cos(actor.angle));
    direction.normalize();
    let results = [];
    let impactPosition = aimed?.target || {
      x: actor.x + direction.x * equipment.range * .68,
      y: terrainHeight(actor.x + direction.x * equipment.range * .68, actor.z + direction.z * equipment.range * .68),
      z: actor.z + direction.z * equipment.range * .68
    };
    const selected = equipment.blastRadius
      ? blastTargets(impactPosition, targets, equipment).map((entry) => ({ detailed: detailedTarget(entry.target), force: entry.force })).filter((entry) => entry.detailed)
      : aimed ? [{ detailed: detailedTarget(aimed.target), force: equipment.force }] : [];
    if (aimed && !equipment.blastRadius) impactPosition = aimed.target;
    if (equipment.blastRadius) impactPulse(impactPosition, equipment.blastRadius);
    else if (equipment.category === 'sidearm' && aimed) impactPulse(impactPosition, .8);
    const eventKind = equipment.category === 'explosive' ? 'explosive_use'
      : equipment.category === 'sidearm' ? 'weapon_discharge' : 'assault';
    reportCivicEvent({
      kind: eventKind,
      position: impactPosition,
      severity: equipment.category === 'explosive' ? 3 : equipment.category === 'sidearm' ? 2 : 1,
      radius: equipment.category === 'explosive' ? 52 : equipment.category === 'sidearm' ? 38 : 22,
      audibleRadius: equipment.category === 'explosive' ? 52 : equipment.category === 'sidearm' ? 34 : 6,
      maximumWitnesses: 4
    });
    if (roomActive && selected.length) {
      const shared = selected.map((entry) => sharedTarget(entry.detailed));
      if (shared.some((entry) => !entry)) {
        setStatus('That object does not have a stable room identity.', 2200);
      } else {
        state.authorityImpactPending = true;
        setStatus('Verifying shared impact…', 2600);
        state.authority.commitImpacts(equipment, impactPosition, shared).then((response) => {
          if (!isActive()) return;
          state.authorityImpactPending = false;
          if (!response?.accepted) {
            setStatus(response?.reason === 'cooldown' ? 'Shared equipment is not ready yet.' : 'The room rejected that impact.', 2200);
            return;
          }
          const byId = new Map((response.results || []).map((entry) => [entry.entityId, entry]));
          results = selected.map((entry) => applyAuthoritativeImpact(entry.detailed, byId.get(sharedTarget(entry.detailed)?.entityId))).filter(Boolean);
          state.lastImpactAction = Object.freeze({ equipmentId: equipment.id, resultCount: results.length, authority: 'room', at: clock() });
          setStatus(results.length ? `${equipment.label} affected ${results.length} shared target${results.length === 1 ? '' : 's'}.` : `${equipment.label}: no authorized target.`);
        }).catch((error) => {
          if (!isActive()) return;
          state.authorityImpactPending = false;
          setStatus(String(error?.message || 'Shared impact authority is unavailable.'), 2800);
        });
      }
    } else {
      results = selected.map((entry) => applyImpact(entry.detailed, entry.force)).filter(Boolean);
      state.lastImpactAction = Object.freeze({ equipmentId: equipment.id, resultCount: results.length, authority: 'local', at: clock() });
      setStatus(results.length ? `${equipment.label} affected ${results.length} target${results.length === 1 ? '' : 's'}.` : `${equipment.label}: no target in view.`);
    }
    render();
    return true;
  }

  function update(dt) {
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
    effects.forEach((effect) => {
      effect.root.removeFromParent?.();
      effect.geometries.forEach((geometry) => geometry.dispose());
      effect.materials.forEach((material) => material.dispose());
    });
    effects.length = 0;
  }

  return Object.freeze({ dispose, equipSlot, render, toggle, update, use });
}

export { createUrbanEquipmentRuntime };
