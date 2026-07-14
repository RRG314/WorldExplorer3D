import { ctx as appCtx } from "./shared-context.js?v=55";

function numberOrNull(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function vectorSnapshot(vector) {
  if (!vector) return null;
  return {
    x: numberOrNull(vector.x),
    y: numberOrNull(vector.y),
    z: numberOrNull(vector.z)
  };
}

function rendererSnapshot() {
  const renderer = appCtx.renderer;
  if (!renderer) return null;

  let contextLost = null;
  let glError = null;
  try {
    const gl = renderer.getContext?.();
    contextLost = gl?.isContextLost?.() ?? null;
    glError = gl?.getError?.() ?? null;
  } catch {
    contextLost = null;
  }

  return {
    contextLost,
    glError,
    pixelRatio: numberOrNull(renderer.getPixelRatio?.()),
    width: numberOrNull(renderer.domElement?.width),
    height: numberOrNull(renderer.domElement?.height),
    calls: numberOrNull(renderer.info?.render?.calls),
    triangles: numberOrNull(renderer.info?.render?.triangles),
    programs: Array.isArray(renderer.info?.programs) ? renderer.info.programs.length : null
  };
}

function composerSnapshot() {
  const composer = appCtx.composer;
  if (!composer) return null;
  return {
    readWidth: numberOrNull(composer.readBuffer?.width),
    readHeight: numberOrNull(composer.readBuffer?.height),
    writeWidth: numberOrNull(composer.writeBuffer?.width),
    writeHeight: numberOrNull(composer.writeBuffer?.height),
    passes: Array.isArray(composer.passes)
      ? composer.passes.map((pass) => ({
          name: pass?.constructor?.name || "unknown",
          enabled: pass?.enabled !== false,
          renderToScreen: !!pass?.renderToScreen
        }))
      : []
  };
}

function getWorldExplorerRuntimeDiagnostics() {
  return {
    environment: appCtx.getEnv?.() || null,
    gameStarted: !!appCtx.gameStarted,
    paused: !!appCtx.paused,
    worldLoading: !!appCtx.worldLoading,
    modes: {
      boat: !!appCtx.boatMode?.active,
      drone: !!appCtx.droneMode,
      ocean: !!appCtx.oceanMode?.active,
      space: !!appCtx.spaceFlight?.active,
      walking: appCtx.Walk?.state?.mode === "walk"
    },
    planetary: {
      flightDestination: appCtx.spaceFlight?.destination || null,
      flightMode: appCtx.spaceFlight?.mode || null,
      flightSessionId: numberOrNull(appCtx.spaceFlight?._sessionId),
      landingTarget: appCtx.spaceFlight?._landingTarget || null,
      manualLandingTarget: appCtx.spaceFlight?._manualLandingTarget || null,
      nearestBody: appCtx.spaceFlight?._nearestBody?.name || null,
      onMars: !!appCtx.onMars,
      onMoon: !!appCtx.onMoon,
      traveling: !!appCtx.travelingToMoon
    },
    titleVisible: !!document.getElementById("titleScreen") &&
      !document.getElementById("titleScreen").classList.contains("hidden"),
    camera: appCtx.camera
      ? {
          position: vectorSnapshot(appCtx.camera.position),
          rotation: vectorSnapshot(appCtx.camera.rotation),
          up: vectorSnapshot(appCtx.camera.up),
          near: numberOrNull(appCtx.camera.near),
          far: numberOrNull(appCtx.camera.far),
          aspect: numberOrNull(appCtx.camera.aspect)
        }
      : null,
    drone: appCtx.drone
      ? {
          position: {
            x: numberOrNull(appCtx.drone.x),
            y: numberOrNull(appCtx.drone.y),
            z: numberOrNull(appCtx.drone.z)
          },
          yaw: numberOrNull(appCtx.drone.yaw),
          pitch: numberOrNull(appCtx.drone.pitch),
          roll: numberOrNull(appCtx.drone.roll)
        }
      : null,
    scene: appCtx.scene
      ? {
          children: appCtx.scene.children.length,
          background: appCtx.scene.background?.getHexString?.() || null,
          fogColor: appCtx.scene.fog?.color?.getHexString?.() || null,
          fogDensity: numberOrNull(appCtx.scene.fog?.density)
        }
      : null,
    renderer: rendererSnapshot(),
    composer: composerSnapshot(),
    quality: appCtx.renderQualityLevel || null,
    worldCounts: {
      buildings: appCtx.buildings?.length ?? null,
      buildingMeshes: appCtx.buildingMeshes?.length ?? null,
      landuseMeshes: appCtx.landuseMeshes?.length ?? null,
      roadMeshes: appCtx.roadMeshes?.length ?? null,
      roads: appCtx.roads?.length ?? null,
      terrainTiles: appCtx.terrainTiles?.size ?? null
    }
  };
}

globalThis.getWorldExplorerRuntimeDiagnostics = getWorldExplorerRuntimeDiagnostics;

function publishRuntimeDiagnostics() {
  if (!document?.documentElement) return;
  let output = document.getElementById("we3dRuntimeDiagnostics");
  if (!output) {
    output = document.createElement("script");
    output.id = "we3dRuntimeDiagnostics";
    output.type = "application/json";
    document.documentElement.appendChild(output);
  }
  output.textContent = JSON.stringify(getWorldExplorerRuntimeDiagnostics());
}

publishRuntimeDiagnostics();
globalThis.setInterval(publishRuntimeDiagnostics, 1000);

export { getWorldExplorerRuntimeDiagnostics };
