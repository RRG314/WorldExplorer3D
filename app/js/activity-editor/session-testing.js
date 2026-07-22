export function createActivityCreatorTestingApi(context = {}) {
  const {
    appCtx,
    state,
    selectedTemplate,
    activityIssues,
    routeSequenceForTesting,
    markCreatorGuideProgress,
    refreshScenePreview,
    renderUi,
    setStatus,
    finiteNumber
  } = context;

  function captureRuntimeState() {
    const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
    if (mode === 'boat') {
      return {
        mode,
        x: finiteNumber(appCtx.boat?.x, 0),
        y: finiteNumber(appCtx.boat?.y, 0),
        z: finiteNumber(appCtx.boat?.z, 0),
        angle: finiteNumber(appCtx.boat?.angle, 0)
      };
    }
    if (mode === 'drone') {
      return {
        mode,
        x: finiteNumber(appCtx.drone?.x, 0),
        y: finiteNumber(appCtx.drone?.y, 12),
        z: finiteNumber(appCtx.drone?.z, 0),
        angle: finiteNumber(appCtx.drone?.yaw, 0)
      };
    }
    if (mode === 'plane') {
      return {
        mode,
        x: finiteNumber(appCtx.planeMode?.x, 0),
        y: finiteNumber(appCtx.planeMode?.y, 2),
        z: finiteNumber(appCtx.planeMode?.z, 0),
        angle: finiteNumber(appCtx.planeMode?.yaw, 0)
      };
    }
    if (mode === 'walk' && appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      return {
        mode,
        x: finiteNumber(walker.x, 0),
        y: finiteNumber(walker.y, 1.7),
        z: finiteNumber(walker.z, 0),
        angle: finiteNumber(walker.angle || walker.yaw, 0)
      };
    }
    return {
      mode: 'drive',
      x: finiteNumber(appCtx.car?.x, 0),
      y: finiteNumber(appCtx.car?.y, 1.2),
      z: finiteNumber(appCtx.car?.z, 0),
      angle: finiteNumber(appCtx.car?.angle, 0)
    };
  }

  function applyDirectWalkPose(anchor) {
    if (!appCtx.Walk) return false;
    appCtx.Walk.setModeWalk();
    const walker = appCtx.Walk.state?.walker;
    if (!walker) return false;
    walker.x = anchor.x;
    walker.z = anchor.z;
    walker.y = anchor.y + 1.7;
    walker.vy = 0;
    walker.angle = anchor.yaw || 0;
    walker.yaw = anchor.yaw || 0;
    if (appCtx.Walk.state.characterMesh) {
      appCtx.Walk.state.characterMesh.position.set(anchor.x, anchor.y, anchor.z);
      appCtx.Walk.state.characterMesh.rotation.y = anchor.yaw || 0;
      appCtx.Walk.state.characterMesh.visible = appCtx.Walk.state.view !== 'first';
    }
    return true;
  }

  function applyDirectDrivePose(anchor) {
    if (typeof appCtx.setTravelMode === 'function') appCtx.setTravelMode('drive', { source: 'activity_creator_test', force: true });
    const resolved = typeof appCtx.resolveSafeWorldSpawn === 'function'
      ? appCtx.resolveSafeWorldSpawn(anchor.x, anchor.z, { mode: 'drive', angle: anchor.yaw || 0, source: 'activity_creator_test' })
      : null;
    if (resolved && typeof appCtx.applyResolvedWorldSpawn === 'function') {
      appCtx.applyResolvedWorldSpawn(resolved, { mode: 'drive' });
      appCtx.car.angle = anchor.yaw || appCtx.car.angle;
      if (appCtx.carMesh) appCtx.carMesh.rotation.y = appCtx.car.angle;
      return true;
    }
    appCtx.car.x = anchor.x;
    appCtx.car.z = anchor.z;
    appCtx.car.y = anchor.y + 1.1;
    appCtx.car.angle = anchor.yaw || 0;
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.visible = true;
    }
    return true;
  }

  function applyDirectDronePose(anchor) {
    if (typeof appCtx.setTravelMode === 'function') appCtx.setTravelMode('drone', { source: 'activity_creator_test', force: true });
    if (!appCtx.drone) return false;
    appCtx.drone.x = anchor.x;
    appCtx.drone.z = anchor.z;
    appCtx.drone.y = anchor.y + Math.max(8, state.placementHeightOffset || 10);
    appCtx.drone.yaw = anchor.yaw || 0;
    appCtx.drone.roll = 0;
    return true;
  }

  function applyDirectPlanePose(anchor) {
    if (typeof appCtx.setTravelMode !== 'function') return false;
    appCtx.setTravelMode('plane', {
      source: 'activity_creator_test',
      force: true,
      x: anchor.x,
      y: Math.max(anchor.y, finiteNumber(anchor.baseY, anchor.y) + 3),
      z: anchor.z,
      yaw: anchor.yaw || 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      throttle: 0,
      airborne: anchor.y > finiteNumber(anchor.baseY, anchor.y) + 2
    });
    return appCtx.planeMode?.active === true;
  }

  function applyDirectSubmarinePose(anchor) {
    if (typeof appCtx.startOceanMode !== 'function') return false;
    return appCtx.startOceanMode({
      submarinePose: { x: anchor.x, y: anchor.y, z: anchor.z, yaw: anchor.yaw || 0 }
    }) === true;
  }

  function applyDirectBoatPose(anchor) {
    if (typeof appCtx.setTravelMode !== 'function') return false;
    const candidate = typeof appCtx.inspectBoatCandidate === 'function'
      ? appCtx.inspectBoatCandidate(anchor.x, anchor.z, 260, { allowSynthetic: true, waterKind: 'coastal' })
      : null;
    appCtx.setTravelMode('boat', {
      source: 'activity_creator_test',
      force: true,
      spawnX: anchor.x,
      spawnZ: anchor.z,
      yaw: anchor.yaw || 0,
      candidate: candidate || undefined
    });
    return true;
  }

  function applyRuntimeState(snapshot) {
    if (!snapshot) return false;
    const anchor = {
      x: finiteNumber(snapshot.x, 0),
      y: finiteNumber(snapshot.y, 0),
      z: finiteNumber(snapshot.z, 0),
      yaw: finiteNumber(snapshot.angle, 0)
    };
    if (snapshot.mode === 'boat') return applyDirectBoatPose(anchor);
    if (snapshot.mode === 'drone') return applyDirectDronePose(anchor);
    if (snapshot.mode === 'plane') return applyDirectPlanePose(anchor);
    if (snapshot.mode === 'submarine') return applyDirectSubmarinePose(anchor);
    if (snapshot.mode === 'walk') return applyDirectWalkPose(anchor);
    return applyDirectDrivePose(anchor);
  }

  function applyTestSpawn(anchor) {
    const traversal = selectedTemplate().traversalMode;
    if (traversal === 'boat') return applyDirectBoatPose(anchor);
    if (traversal === 'drone') return applyDirectDronePose(anchor);
    if (traversal === 'plane') return applyDirectPlanePose(anchor);
    if (traversal === 'submarine') return applyDirectSubmarinePose(anchor);
    if (traversal === 'walk') return applyDirectWalkPose(anchor);
    return applyDirectDrivePose(anchor);
  }

  function currentReferencePose() {
    const mode = typeof appCtx.getCurrentTravelMode === 'function' ? appCtx.getCurrentTravelMode() : 'drive';
    if (mode === 'boat') return { x: finiteNumber(appCtx.boat?.x, 0), y: finiteNumber(appCtx.boat?.y, 0), z: finiteNumber(appCtx.boat?.z, 0) };
    if (mode === 'drone') return { x: finiteNumber(appCtx.drone?.x, 0), y: finiteNumber(appCtx.drone?.y, 0), z: finiteNumber(appCtx.drone?.z, 0) };
    if (mode === 'plane') return { x: finiteNumber(appCtx.planeMode?.x, 0), y: finiteNumber(appCtx.planeMode?.y, 0), z: finiteNumber(appCtx.planeMode?.z, 0) };
    if (appCtx.oceanMode?.active) {
      const position = appCtx.oceanMode.submarine?.position || {};
      return { x: finiteNumber(position.x, 0), y: finiteNumber(position.y, 0), z: finiteNumber(position.z, 0) };
    }
    if (mode === 'walk' && appCtx.Walk?.state?.walker) {
      const walker = appCtx.Walk.state.walker;
      return { x: finiteNumber(walker.x, 0), y: finiteNumber(walker.y, 0) - 1.7, z: finiteNumber(walker.z, 0) };
    }
    return { x: finiteNumber(appCtx.car?.x, 0), y: finiteNumber(appCtx.car?.y, 0), z: finiteNumber(appCtx.car?.z, 0) };
  }

  function anchorCaptureDistance(anchor) {
    if (!anchor) return 8;
    if (anchor.typeId === 'trigger_zone') return Math.max(3, Math.max(finiteNumber(anchor.sizeX, 12), finiteNumber(anchor.sizeZ, 12)) * 0.45);
    if (anchor.typeId === 'hazard_zone') return Math.max(4, Math.max(finiteNumber(anchor.sizeX, 16), finiteNumber(anchor.sizeZ, 16)) * 0.42);
    if (anchor.typeId === 'boost_ring') return Math.max(4, finiteNumber(anchor.radius, 6) * 0.72);
    if (anchor.typeId === 'buoy_gate') return Math.max(5, finiteNumber(anchor.radius, 10) * 0.7);
    if (anchor.typeId === 'fishing_zone') return Math.max(5, finiteNumber(anchor.radius, 18));
    if (anchor.typeId === 'dock_point' || anchor.typeId === 'finish') return 10;
    return 8;
  }

  function updateTestingState() {
    if (!state.testing.active) return;
    const sequence = Array.isArray(state.testing.sequence) ? state.testing.sequence : [];
    const target = sequence[state.testing.currentIndex] || null;
    if (!target) {
      state.testing.message = 'Activity complete. Return to creator when you are ready to refine it.';
      state.testing.currentTargetId = '';
      renderUi();
      return;
    }
    state.testing.currentTargetId = target.id;
    const pose = currentReferencePose();
    const distance = Math.hypot(target.x - pose.x, target.z - pose.z, target.y - pose.y);
    state.testing.message = `Target ${state.testing.currentIndex + 1}/${sequence.length}: ${target.label} • ${Math.round(distance)}m`;
    if (performance.now() - finiteNumber(state.testing.lastUiAt, 0) > 180) {
      state.testing.lastUiAt = performance.now();
      renderUi();
    }
    if (distance <= anchorCaptureDistance(target)) {
      state.testing.completed.push(target.id);
      state.testing.currentIndex += 1;
      const next = sequence[state.testing.currentIndex] || null;
      state.testing.currentTargetId = next?.id || '';
      state.testing.message = next
        ? `Checkpoint reached. Next target: ${next.label}`
        : 'Activity complete. Return to creator when you are ready to refine it.';
      refreshScenePreview();
      renderUi();
    }
  }

  function startTestMode() {
    if (state.testing.active) return true;
    const validation = activityIssues();
    if (!validation.valid) {
      setStatus('Fix validation issues before entering test mode.', 'error');
      return false;
    }
    const sequence = routeSequenceForTesting();
    const startAnchor = sequence[0] || state.anchors.find((anchor) => anchor.typeId === 'start') || state.anchors[0] || null;
    if (!startAnchor) {
      setStatus('Add at least a start anchor before testing.', 'warning');
      return false;
    }
    state.testing.restore = captureRuntimeState();
    state.testing.active = true;
    state.testing.sequence = sequence.slice(1);
    state.testing.currentIndex = 0;
    state.testing.completed = startAnchor ? [startAnchor.id] : [];
    state.testing.startedAt = performance.now();
    state.testing.lastUiAt = 0;
    state.testing.currentTargetId = state.testing.sequence[0]?.id || '';
    const applied = applyTestSpawn(startAnchor);
    if (!applied) {
      state.testing.active = false;
      setStatus('Could not enter test mode for this template in the current runtime.', 'error');
      return false;
    }
    state.testing.message = state.testing.sequence[0]
      ? `Testing ${selectedTemplate().label}. First target: ${state.testing.sequence[0].label}`
      : `Testing ${selectedTemplate().label}. No follow-up anchors were placed yet.`;
    if (!state.guide.tested || state.guide.saved) {
      markCreatorGuideProgress({
        tested: true,
        completed: state.guide.saved === true
      });
    }
    state.guideOpen = true;
    refreshScenePreview();
    renderUi();
    setStatus('Test mode active. Play the route, then return to the creator.', 'ok');
    return true;
  }

  function stopTestMode(options = {}) {
    if (!state.testing.active) return false;
    const restore = state.testing.restore;
    state.testing.active = false;
    state.testing.sequence = [];
    state.testing.currentIndex = 0;
    state.testing.currentTargetId = '';
    state.testing.completed = [];
    state.testing.message = '';
    state.testing.lastUiAt = 0;
    state.testing.restore = null;
    if (options.restoreRuntime !== false) applyRuntimeState(restore);
    refreshScenePreview();
    renderUi();
    setStatus('Returned from test mode to the activity creator.', 'ok');
    return true;
  }

  return {
    applyRuntimeState,
    startTestMode,
    stopTestMode,
    updateTestingState
  };
}
