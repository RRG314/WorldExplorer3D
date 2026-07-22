function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createMmoRoomPanel({ appCtx, refs, state, escapeHtml, setStatus }) {
  let renderedKey = '';
  let busy = false;

  function snapshot() {
    return state.authoritativeSession?.getSnapshot?.() || null;
  }

  function selfPlayer() {
    const uid = String(state.mmoSelfUid || state.authUser?.uid || '');
    return state.players.find((player) => player.uid === uid) || null;
  }

  function selectedValue(ref, fallback = '') {
    return String(ref?.value || fallback);
  }

  function setOptions(ref, entries, selected, emptyLabel) {
    if (!ref) return;
    const current = selectedValue(ref, selected);
    ref.innerHTML = entries.length
      ? entries.join('')
      : `<option value="">${escapeHtml(emptyLabel)}</option>`;
    const available = Array.from(ref.options).some((option) => option.value === current);
    ref.value = available ? current : selected;
  }

  function nearestVehicle(player, vehicles) {
    if (!player) return null;
    return vehicles
      .filter((vehicle) => !vehicle.driverUid)
      .map((vehicle) => ({
        vehicle,
        distance: Math.hypot(
          finite(vehicle.position?.x) - finite(player.pose?.x),
          finite(vehicle.position?.y) - finite(player.pose?.y),
          finite(vehicle.position?.z) - finite(player.pose?.z)
        )
      }))
      .filter((entry) => entry.distance <= 12)
      .sort((a, b) => a.distance - b.distance || a.vehicle.id.localeCompare(b.vehicle.id))[0] || null;
  }

  function render(force = false) {
    const profile = state.mmoProgression;
    const catalog = state.mmoCatalog || {};
    const roomSnapshot = snapshot();
    const player = selfPlayer();
    const nearbyBuilding = typeof appCtx.inspectNearestRoomBuilding === 'function'
      ? appCtx.inspectNearestRoomBuilding(14)
      : null;
    const key = JSON.stringify([
      profile,
      state.mmoLeaderboard,
      catalog,
      state.players.map((entry) => [entry.uid, entry.displayName, entry.health, entry.connected]),
      player?.uid,
      player?.health,
      player?.vehicleId,
      roomSnapshot?.vehicles?.map((vehicle) => [vehicle.id, vehicle.driverUid, vehicle.position]),
      roomSnapshot?.suppressions?.map((entry) => [entry.sourceId, entry.revision]),
      nearbyBuilding ? [nearbyBuilding.sourceId, Math.round(nearbyBuilding.distance)] : null,
      busy
    ]);
    if (!force && key === renderedKey) return;
    renderedKey = key;

    const connected = Boolean(state.authoritativeSession && roomSnapshot?.connected);
    if (refs.mmoProgressSummary) {
      refs.mmoProgressSummary.textContent = profile
        ? `Level ${Math.max(1, finite(profile.level, 1))}  |  ${Math.max(0, finite(profile.xp))} XP  |  ${Math.max(0, finite(profile.credits))} credits  |  ${Math.max(0, finite(player?.health, 100))} health`
        : connected ? 'Loading server progression...' : 'Authoritative progression is unavailable.';
    }

    const missions = Array.isArray(catalog.missions) ? catalog.missions : [];
    const firstAvailableMission = missions.find((mission) => mission.eligibility?.available !== false);
    setOptions(refs.mmoMissionSelect, missions.map((mission) => (
      `<option value="${escapeHtml(mission.id)}"${mission.eligibility?.available === false ? ' disabled' : ''}>${escapeHtml(mission.label)} (${Math.max(1, finite(mission.target))}) - ${mission.cadence === 'daily' ? 'Daily' : 'One time'}${mission.eligibility?.available === false ? ' - Complete' : ''}</option>`
    )), String(profile?.activeMission?.id || firstAvailableMission?.id || missions[0]?.id || ''), 'No server missions');
    const activeMission = missions.find((mission) => mission.id === profile?.activeMission?.id);
    if (refs.mmoMissionStatus) {
      refs.mmoMissionStatus.textContent = activeMission
        ? `${activeMission.label}: ${Math.floor(finite(profile.activeMission?.progress))} / ${Math.floor(finite(activeMission.target))}`
        : 'No mission active.';
    }

    const unlocked = new Set(profile?.unlockedWeapons || []);
    const weapons = (Array.isArray(catalog.weapons) ? catalog.weapons : [])
      .filter((weapon) => unlocked.has(weapon.id));
    setOptions(refs.mmoWeaponSelect, weapons.map((weapon) => (
      `<option value="${escapeHtml(weapon.id)}">${escapeHtml(weapon.label)}</option>`
    )), String(profile?.equippedWeapon || weapons[0]?.id || ''), 'No unlocked weapons');

    const targets = state.players.filter((entry) => entry.uid !== player?.uid && entry.connected !== false);
    setOptions(refs.mmoTargetSelect, targets.map((entry) => (
      `<option value="${escapeHtml(entry.uid)}">${escapeHtml(entry.displayName || 'Explorer')} (${Math.max(0, finite(entry.health))} health)</option>`
    )), selectedValue(refs.mmoTargetSelect, targets[0]?.uid || ''), 'No active targets');

    const nearby = nearestVehicle(player, roomSnapshot?.vehicles || []);
    if (refs.mmoInteractBtn) {
      refs.mmoInteractBtn.textContent = player?.vehicleId
        ? 'Exit Vehicle'
        : nearby ? `Enter ${nearby.vehicle.assetId.replace('vehicle.', '')}` : 'Use Nearby Vehicle';
      refs.mmoInteractBtn.disabled = busy || !connected || (!player?.vehicleId && !nearby);
    }
    const selectedMission = missions.find((mission) => mission.id === selectedValue(refs.mmoMissionSelect));
    if (refs.mmoMissionAcceptBtn) {
      refs.mmoMissionAcceptBtn.disabled = busy || !connected || !selectedMission ||
        selectedMission.eligibility?.available === false || Boolean(profile?.activeMission);
    }
    if (refs.mmoWeaponEquipBtn) refs.mmoWeaponEquipBtn.disabled = busy || !connected || !weapons.length;
    if (refs.mmoAttackBtn) refs.mmoAttackBtn.disabled = busy || !connected || !targets.length || !weapons.length;
    if (refs.mmoWorldEditSummary) {
      refs.mmoWorldEditSummary.textContent = nearbyBuilding
        ? `${nearbyBuilding.label} - ${nearbyBuilding.distance.toFixed(1)}m away`
        : 'Walk near a mapped building to inspect it.';
    }
    if (refs.mmoDemolishBtn) refs.mmoDemolishBtn.disabled = busy || !connected || !nearbyBuilding;
    const suppressions = roomSnapshot?.suppressions || [];
    setOptions(refs.mmoRestoreSelect, suppressions.map((entry) => (
      `<option value="${escapeHtml(entry.sourceId)}">${escapeHtml(entry.sourceId)}</option>`
    )), selectedValue(refs.mmoRestoreSelect, suppressions[0]?.sourceId || ''), 'No demolished buildings');
    if (refs.mmoRestoreBtn) refs.mmoRestoreBtn.disabled = busy || !connected || !suppressions.length;

    if (refs.mmoLeaderboardList) {
      const rows = Array.isArray(state.mmoLeaderboard) ? state.mmoLeaderboard : [];
      refs.mmoLeaderboardList.innerHTML = rows.length
        ? rows.map((entry, index) => (
          `<li class="mpPlayerItem"><span class="mpPlayerName">#${index + 1} ${escapeHtml(entry.displayName || 'Explorer')}</span><span class="mpPlayerMeta">L${Math.max(1, finite(entry.level, 1))} | ${Math.max(0, finite(entry.xp))} XP | ${Math.max(0, finite(entry.eliminations))} wins</span></li>`
        )).join('')
        : '<li class="mpPlayerEmpty">Complete server missions to enter this room board.</li>';
    }
  }

  async function run(command, successMessage) {
    const client = state.authoritativeSession?.client;
    if (!client) {
      setStatus('Join an authoritative room first.', true);
      return;
    }
    busy = true;
    render(true);
    try {
      const result = await command(client);
      setStatus(successMessage(result));
    } catch (error) {
      setStatus(error?.message || 'The realtime action failed.', true);
    } finally {
      busy = false;
      render(true);
    }
  }

  function wire() {
    refs.mmoMissionSelect?.addEventListener('change', () => render(true));
    refs.mmoMissionAcceptBtn?.addEventListener('click', () => run(
      (client) => client.send('progression.mission.accept', { assetId: refs.mmoMissionSelect?.value }),
      () => 'Mission accepted.'
    ));
    refs.mmoWeaponEquipBtn?.addEventListener('click', () => run(
      (client) => client.send('combat.weapon.equip', { assetId: refs.mmoWeaponSelect?.value }),
      () => 'Weapon equipped.'
    ));
    refs.mmoAttackBtn?.addEventListener('click', () => run(
      (client) => client.send('combat.weapon.use', {
        assetId: refs.mmoWeaponSelect?.value,
        targetId: refs.mmoTargetSelect?.value
      }),
      (result) => result.combat?.eliminated ? 'Target eliminated.' : 'Attack resolved by the room server.'
    ));
    refs.mmoInteractBtn?.addEventListener('click', () => run(
      (client) => client.send('world.interact'),
      (result) => result.interaction?.action === 'entered' ? 'Vehicle entered.' : 'Vehicle exited.'
    ));
    refs.mmoDemolishBtn?.addEventListener('click', () => {
      const building = appCtx.inspectNearestRoomBuilding?.(14);
      if (!building?.sourceId) {
        setStatus('Walk closer to a mapped building first.', true);
        return;
      }
      void run(
        (client) => client.send('world.base.suppress', { targetId: building.sourceId }),
        () => `${building.label} was removed from this room only.`
      );
    });
    refs.mmoRestoreBtn?.addEventListener('click', () => {
      const sourceId = refs.mmoRestoreSelect?.value;
      if (!sourceId) return;
      void run(
        (client) => client.send('world.base.restore', { targetId: sourceId }),
        () => 'Mapped building restored to this room.'
      );
    });
  }

  return { render, wire };
}

export { createMmoRoomPanel };
