import {createGraphicsCallEvidence} from './graphics-call-evidence.js';
import { updateStreetPavementFocus, updateStreetOverviewFrame } from '../world/street-pavement-runtime.js';
function createCoreFrameSystems(appCtx, hooks = {}) {
  appCtx.presentationPose = null;
  let hudTimer = 0;
  let mapTimer = 0;
  let lodTimer = 0;
  let weatherTimer = 0;
  let weatherUiTimer = 0;
  let boatTimer = 0;
  let liveEarthTimer = 0;
  return [
    {
      id: 'core.frame-metrics',
      owner: 'engine',
      phase: 'input',
      priority: -100,
      update(frame) {
        appCtx.lastTime = frame.timestamp;
        appCtx.recordPerfFrame?.(frame.rawDelta ?? frame.dt);
        appCtx.tutorialUpdate?.(frame.dt);
        if (appCtx.renderer?.info?.autoReset === false) appCtx.renderer.info.reset?.();
      }
    },
    {
      id: 'core.input',
      owner: 'engine',
      phase: 'input',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update() {
        appCtx.updateControlInput?.();
      }
    },
    {
      id: 'core.simulation',
      owner: 'engine',
      phase: 'simulation',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update(frame) {
        appCtx.update(frame.dt);
      }
    },
    {
      id: 'core.world',
      owner: 'world',
      phase: 'world',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update(frame) {
        // Ship interiors are a bounded activity nested inside Space Flight.
        // Earth weather, astronomical-sky refresh, boat availability, and
        // planetary field layers must not mutate this scene while it owns the
        // shared world renderer.
        if (appCtx.activeShipInterior === true) {
          appCtx.updateExpeditionShipInterior?.(frame.dt);
          return;
        }
        appCtx.updatePlanetaryTracks?.();
        appCtx.updatePlanetaryFieldMap?.(frame.dt);
        if (!appCtx.onMars && !appCtx.activePlanetaryBodyId) appCtx.refreshAstronomicalSky?.(false);
        appCtx.updateWaterWaveVisuals?.();

        weatherTimer += frame.dt;
        if (weatherTimer > 5) {
          weatherTimer = 0;
          if (!appCtx.onMoon && !appCtx.onMars && !appCtx.activePlanetaryBodyId) void appCtx.refreshLiveWeather?.(false);
        }

        boatTimer += frame.dt;
        const interval = appCtx.boatMode?.active ? 0.85 : appCtx.planeMode?.active ? 1.2 : appCtx.droneMode ? 0.65 : 0.25;
        if (boatTimer > interval) {
          boatTimer = 0;
          appCtx.refreshBoatAvailability?.(false);
        }
      }
    },
    {
      id: 'core.camera',
      owner: 'camera',
      phase: 'camera',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update(frame) {
        appCtx.updateCamera(frame.dt);
        appCtx.updatePlanetarySky?.();
      }
    },
    {
      id: 'platform.activities',
      owner: 'platform',
      phase: 'camera',
      priority: 20,
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update(frame) {
        appCtx.updateActivityCreator?.(frame.dt, frame.timestamp);
        appCtx.updateActivityDiscovery?.(frame.dt, frame.timestamp);
        appCtx.liveEarth?.updateFrame?.(frame.dt);

        liveEarthTimer += frame.dt;
        if (liveEarthTimer > 4) {
          liveEarthTimer = 0;
          appCtx.liveEarth?.updateSelectorFrame?.();
        }
      }
    },
    {
      id: 'core.presentation',
      owner: 'presentation',
      phase: 'presentation',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading,
      update(frame) {
        weatherUiTimer += frame.dt;
        if (weatherUiTimer >= 1) {
          weatherUiTimer %= 1;
          appCtx.updateWeatherUi?.();
        }
        hudTimer += frame.dt;
        if (hudTimer > 0.066) {
          hudTimer = 0;
          frame.flags.hudRefreshed = true;
          appCtx.updateHUD();
          hooks.positionTopOverlays?.();
        }

        mapTimer += frame.dt;
        // Five updates per second keeps the navigation display responsive
        // without rebuilding every vector layer ten times per second.
        const interval = appCtx.planeMode?.active ? 0.25 : 0.2;
        if (mapTimer > interval) {
          mapTimer = 0;
          appCtx.drawMinimap();
          if (appCtx.showLargeMap) appCtx.drawLargeMap();
        }

        lodTimer += frame.dt;
        updateStreetOverviewFrame(appCtx);
        if (lodTimer > 0.2) {
          lodTimer = 0;
          appCtx.updateStreetFurnitureVisibility?.();
          appCtx.updateVegetationFocus?.();
          updateStreetPavementFocus(appCtx);
          appCtx.updateStructureVisualVisibility?.();
          appCtx.enforceEnvironmentSceneOwnership?.();
        }
      }
    }
  ];
}

function createCoreRenderSystem(appCtx, shouldUseComposer) {
  const graphicsEvidence=typeof location!=='undefined' && new URLSearchParams(location.search).get('graphicsDiagnostics')==='1'
    ? createGraphicsCallEvidence(appCtx.renderer.getContext()) : null;
  appCtx.graphicsCallEvidence=graphicsEvidence;
  const draw = () => {
    graphicsEvidence?.begin();
    try {
      if (shouldUseComposer()) appCtx.composer.render();
      else appCtx.renderer.render(appCtx.scene, appCtx.camera);
      appCtx.recordPerfRendererInfo?.(appCtx.renderer);
    } finally {graphicsEvidence?.end();}
  };
  // The completed world must have produced its first frame before the loading
  // cover is dismissed. Use the real render path, including postprocessing.
  appCtx.prepareFirstWorldRender = () => {
    if (!appCtx.gameStarted || appCtx.worldLoading) throw new Error('World is not ready for its first render');
    const started=performance.now();
    appCtx.updateCamera?.(0);
    draw();
    return {durationMs:performance.now()-started,programs:appCtx.renderer?.info?.programs?.length || 0};
  };
  return {
    id: 'core.renderer',
    dispose(){graphicsEvidence?.dispose();if(appCtx.graphicsCallEvidence===graphicsEvidence)appCtx.graphicsCallEvidence=null;},
    owner: 'renderer',
    phase: 'render',
    priority: 0,
    // The title globe owns its own renderer. Keeping the regional city
    // rendering behind it doubles graphics work during location selection.
    // During construction, only the DOM loading UI should update: rendering
    // partial city batches competes with compilation and uploads them early.
    // Manual pause retains the last frame beneath its dimmed dialog. Network
    // listeners and lease heartbeats remain alive without redrawing the city.
    enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.hasPauseReason?.('manual_pause'),
    update() {
      draw();
    }
  };
}

export { createCoreFrameSystems, createCoreRenderSystem };
