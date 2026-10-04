import {updateBuildingExteriorFocus} from '../world/building-exterior-details.js?v=2';
import {beginSwimmingRender} from '../walking/water/presentation.js';
import {createGraphicsCallEvidence} from './graphics-call-evidence.js';
import {activePresentationOwner} from './renderer-owners.js';
import { updateStreetPavementFocus, updateStreetOverviewFrame, prepareStreetOverviewMaterials } from '../world/street-pavement-runtime.js';
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
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
      update() {
        appCtx.updateControlInput?.();
      }
    },
    {
      id: 'core.readiness',
      owner: 'engine',
      phase: 'input',
      priority: 10,
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
      update(frame) {
        const earthActive=!appCtx.onMoon&&!appCtx.onMars&&!appCtx.activePlanetaryBodyId&&
          (!appCtx.isEnv||!appCtx.ENV||appCtx.isEnv(appCtx.ENV.EARTH));
        const detail=earthActive?appCtx.transportDetail:null;
        if(detail){
          const point=appCtx.activeEarthActorPosition?.()||{x:0,z:0};
          detail.step(point);
          const terrainY=['plane','drone'].includes(point.source)?appCtx.terrainMeshHeightAt?.(point.x,point.z):NaN;
          if(!detail.readyForActor(point,terrainY))frame.flags.simulationBlocked=true;
        }
      }
    },
    {
      id:'core.simulation',owner:'engine',phase:'simulation',
      enabled:()=>!!appCtx.gameStarted&&!appCtx.worldLoading&&!appCtx.titleLaunchPending,
      update(frame){
        if(frame.flags?.simulationBlocked)return;
        appCtx.update(frame.dt);
      }
    },
    {
      id: 'core.world',
      owner: 'world',
      phase: 'world',
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
      update(frame) {
        // Ship interiors are a bounded activity nested inside Space Flight.
        // Earth weather, astronomical-sky refresh, boat availability, and
        // planetary field layers must not mutate this scene while it owns the
        // shared world renderer.
        if (appCtx.activeShipInterior === true) {
          appCtx.updateExpeditionShipInterior?.(frame.dt);
          return;
        }
        appCtx.updateBoatSwimming?.(frame.dt);
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
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
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
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
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
      enabled: () => !!appCtx.gameStarted && !appCtx.worldLoading && !appCtx.titleLaunchPending,
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
          updateBuildingExteriorFocus(appCtx);
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
    const restoreWaterPresentation=beginSwimmingRender(appCtx);
    try {
      if (shouldUseComposer()) appCtx.composer.render();
      else appCtx.renderer.render(appCtx.scene, appCtx.camera);
      appCtx.recordPerfRendererInfo?.(appCtx.renderer);
    } finally {restoreWaterPresentation?.();graphicsEvidence?.end();}
  };
  // The completed world must have produced its first frame before the loading
  // cover is dismissed. Use the real render path, including postprocessing.
  appCtx.prepareFirstWorldRender = () => {
    if (!appCtx.gameStarted || appCtx.worldLoading) throw new Error('World is not ready for its first render');
    const started=performance.now();
    appCtx.updateCamera?.(0);
    prepareStreetOverviewMaterials(appCtx);
    // Prepare resident materials outside the initial camera's frustum too.
    // Otherwise turning or moving first encounters their synchronous link work.
    // Match RenderPass's target: compiling for the screen would warm a different
    // output-encoding variant when postprocessing renders into its read buffer.
    if (typeof appCtx.renderer.compile === 'function') {
      const previousTarget = appCtx.renderer.getRenderTarget();
      try {
        appCtx.renderer.setRenderTarget(shouldUseComposer() ? appCtx.composer.readBuffer : null);
        appCtx.renderer.compile(appCtx.scene, appCtx.camera);
      } finally {
        appCtx.renderer.setRenderTarget(previousTarget);
      }
    }
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
    enabled: (frame) => frame?.manualRender !== false && activePresentationOwner(appCtx)==='main' && !appCtx.worldLoading && !appCtx.titleLaunchPending && !appCtx.hasPauseReason?.('manual_pause'),
    update() {
      draw();
    }
  };
}

export { createCoreFrameSystems, createCoreRenderSystem };
