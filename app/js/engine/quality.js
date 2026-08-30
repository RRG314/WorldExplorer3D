import {
  buildEarthAtmosphereProfile,
  createAtmosphereMaterial
} from '../sky/earth-atmosphere.js?v=1';

function buildProceduralEnvironmentTarget(ctx, profile) {
  const pmremGenerator = ctx.appCtx.pmremGenerator;
  if (!pmremGenerator || typeof THREE === 'undefined') return null;
  const envScene = new THREE.Scene();
  const envGeo = new THREE.BoxGeometry(20, 20, 20);
  const envMat = createAtmosphereMaterial(profile, { name: 'WorldExplorerEarthEnvironment' });
  if (!envMat) {
    envGeo.dispose?.();
    return null;
  }
  const envMesh = new THREE.Mesh(envGeo, envMat);
  envScene.add(envMesh);
  try {
    return pmremGenerator.fromScene(envScene, 0.025, 0.1, 100);
  } catch (err) {
    console.warn('Procedural environment map generation failed:', err);
    return null;
  } finally {
    envScene.remove(envMesh);
    envGeo.dispose?.();
    envMat.dispose?.();
  }
}

export function refreshProceduralEnvironment(ctx, profile = null, options = {}) {
  const nextProfile = profile || buildEarthAtmosphereProfile(null, null, {
    phase: 'day',
    backgroundHex: 0x87ceeb
  });
  if (
    options.force !== true &&
    ctx.state.fallbackEnvMap &&
    ctx.state.fallbackEnvSignature === nextProfile.signature
  ) {
    return ctx.state.fallbackEnvMap;
  }
  const nextTarget = buildProceduralEnvironmentTarget(ctx, nextProfile);
  if (!nextTarget?.texture) return ctx.state.fallbackEnvMap || null;

  const previousTarget = ctx.state.fallbackEnvTarget;
  const previousMap = ctx.state.fallbackEnvMap;
  ctx.state.fallbackEnvTarget = nextTarget;
  ctx.state.fallbackEnvMap = nextTarget.texture;
  ctx.state.fallbackEnvSignature = nextProfile.signature;
  if (!ctx.state.hdrEnvMap || ctx.state.renderQualityLevel === ctx.RENDER_QUALITY_LOW || ctx.appCtx.scene.environment === previousMap) {
    ctx.appCtx.scene.environment = ctx.state.fallbackEnvMap;
  }
  if (previousTarget && previousTarget !== nextTarget) previousTarget.dispose?.();
  return ctx.state.fallbackEnvMap;
}

export function createProceduralEnvironmentMap(ctx, pmremGenerator) {
  if (!pmremGenerator) return null;
  ctx.appCtx.pmremGenerator = pmremGenerator;
  return refreshProceduralEnvironment(ctx, ctx.appCtx.earthAtmosphereProfile || null, { force: true });
}

export function getShadowMapResolution(ctx, level) {
  const normalized = ctx.normalizeRenderQualityLevel(level);
  if (normalized === ctx.RENDER_QUALITY_LOW) return 0;
  if (ctx.state.currentGpuTier === 'low') return normalized === ctx.RENDER_QUALITY_HIGH ? 512 : 256;
  if (ctx.state.currentGpuTier === 'mid') return normalized === ctx.RENDER_QUALITY_HIGH ? 1024 : 512;
  return normalized === ctx.RENDER_QUALITY_HIGH ? 2048 : 1024;
}

export function applyRenderQuality(ctx, level, options = {}) {
  const normalized = ctx.normalizeRenderQualityLevel(level);
  ctx.state.renderQualityLevel = normalized;
  ctx.appCtx.renderQualityLevel = normalized;
  if (options.persist !== false) ctx.writeStorage(ctx.RENDER_QUALITY_STORAGE_KEY, normalized);

  if (ctx.appCtx.renderer) {
    ctx.appCtx.renderer.toneMappingExposure = normalized === ctx.RENDER_QUALITY_HIGH ? 0.95 : normalized === ctx.RENDER_QUALITY_MED ? 0.9 : 0.85;
  }
  if (ctx.appCtx.sun) {
    applyDirectionalShadowPolicy(ctx.appCtx, {
      gpuTier: ctx.state.currentGpuTier,
      quality: normalized
    });
  }
  if (normalized === ctx.RENDER_QUALITY_LOW) {
    ctx.appCtx.scene.environment = ctx.state.fallbackEnvMap || null;
  } else if (ctx.state.hdrEnvMap) {
    ctx.appCtx.scene.environment = ctx.state.hdrEnvMap;
  } else if (ctx.state.fallbackEnvMap) {
    ctx.appCtx.scene.environment = ctx.state.fallbackEnvMap;
  }

  if (ctx.state.carPaintMaterial) {
    const high = normalized === ctx.RENDER_QUALITY_HIGH;
    const utilityMatte = ctx.state.carPaintMaterial.userData?.vehiclePaintFinish === 'utility-matte';
    ctx.state.carPaintMaterial.envMapIntensity = utilityMatte
      ? (high ? 0.9 : normalized === ctx.RENDER_QUALITY_MED ? 0.7 : 0.4)
      : (high ? 1.5 : normalized === ctx.RENDER_QUALITY_MED ? 1.2 : 0.65);
    ctx.state.carPaintMaterial.roughness = utilityMatte
      ? (high ? 0.44 : normalized === ctx.RENDER_QUALITY_MED ? 0.52 : 0.6)
      : (high ? 0.14 : 0.2);
    ctx.state.carPaintMaterial.metalness = utilityMatte
      ? (high ? 0.3 : normalized === ctx.RENDER_QUALITY_MED ? 0.24 : 0.18)
      : (high ? 0.95 : 0.88);
    if ('clearcoat' in ctx.state.carPaintMaterial) {
      ctx.state.carPaintMaterial.clearcoat = 0.0;
      ctx.state.carPaintMaterial.clearcoatRoughness = 1.0;
    }
    ctx.state.carPaintMaterial.needsUpdate = true;
  }

  if (ctx.appCtx.ssaoPass) ctx.appCtx.ssaoPass.enabled = ctx.state.ssaoEnabled && normalized === ctx.RENDER_QUALITY_HIGH;
  if (ctx.appCtx.bloomPass) ctx.appCtx.bloomPass.enabled = normalized !== ctx.RENDER_QUALITY_LOW;
  if (ctx.appCtx.smaaPass) ctx.appCtx.smaaPass.enabled = normalized !== ctx.RENDER_QUALITY_LOW;
  if (typeof ctx.appCtx.updatePerfPanel === 'function') ctx.appCtx.updatePerfPanel(true);
  return normalized;
}

export function ensureHdrEnvironment(ctx) {
  ctx.state.hdrLoadRequested = true;
  if (ctx.state.fallbackEnvMap) {
    ctx.appCtx.scene.environment = ctx.state.fallbackEnvMap;
  }
  if (typeof ctx.appCtx.updatePerfPanel === 'function') ctx.appCtx.updatePerfPanel(true);
}

export function getEnvironmentLightingSnapshot(ctx) {
  return Object.freeze({
    authority: 'engine-quality-environment',
    targetCount: ctx.state.fallbackEnvTarget ? 1 : 0,
    signature: ctx.state.fallbackEnvSignature || null,
    hasEnvironmentMap: !!ctx.state.fallbackEnvMap,
    active: ctx.appCtx.scene?.environment === ctx.state.fallbackEnvMap,
    quality: ctx.state.renderQualityLevel
  });
}

export function setRenderQualityLevel(ctx, level, options = {}) {
  const next = applyRenderQuality(ctx, level, options);
  if (next !== ctx.RENDER_QUALITY_LOW) ensureHdrEnvironment(ctx);
  return next;
}

export function getHighQualityEnabled(ctx) {
  return ctx.state.renderQualityLevel === ctx.RENDER_QUALITY_HIGH;
}

export function setHighQualityEnabled(ctx, enabled, options = {}) {
  if (enabled) return setRenderQualityLevel(ctx, ctx.RENDER_QUALITY_HIGH, options);
  const fallbackLevel = ctx.normalizeRenderQualityLevel(options.fallbackLevel || ctx.RENDER_QUALITY_MED);
  return setRenderQualityLevel(ctx, fallbackLevel, options);
}

export function canUseSsao(ctx) {
  return !ctx.isLikelyMobileDevice() && ctx.state.currentGpuTier !== 'low';
}

export function getSsaoEnabled(ctx) {
  return !!ctx.state.ssaoEnabled;
}

export function setSsaoEnabled(ctx, enabled, options = {}) {
  ctx.state.ssaoEnabled = !!enabled && canUseSsao(ctx);
  ctx.appCtx.ssaoEnabled = ctx.state.ssaoEnabled;
  if (options.persist !== false) ctx.writeStorage(ctx.SSAO_STORAGE_KEY, ctx.state.ssaoEnabled ? '1' : '0');
  if (ctx.appCtx.ssaoPass) {
    ctx.appCtx.ssaoPass.enabled = ctx.state.ssaoEnabled && ctx.state.renderQualityLevel === ctx.RENDER_QUALITY_HIGH;
  }
  if (typeof ctx.appCtx.updatePerfPanel === 'function') ctx.appCtx.updatePerfPanel(true);
  return ctx.state.ssaoEnabled;
}

export function setupPostProcessingPipeline(ctx) {
  if (!ctx.appCtx.renderer || !ctx.appCtx.scene || !ctx.appCtx.camera) return false;
  if (ctx.state.currentGpuTier === 'low') return false;
  if (typeof THREE.EffectComposer === 'undefined' || typeof THREE.RenderPass === 'undefined') return false;

  try {
    ctx.appCtx.composer = new THREE.EffectComposer(ctx.appCtx.renderer);
    ctx.appCtx.composer.setSize(innerWidth, innerHeight);

    const renderPass = new THREE.RenderPass(ctx.appCtx.scene, ctx.appCtx.camera);
    ctx.appCtx.composer.addPass(renderPass);

    ctx.appCtx.ssaoPass = null;
    if (typeof THREE.SSAOPass !== 'undefined' && canUseSsao(ctx)) {
      try {
        ctx.appCtx.ssaoPass = new THREE.SSAOPass(ctx.appCtx.scene, ctx.appCtx.camera, innerWidth, innerHeight);
        ctx.appCtx.ssaoPass.kernelRadius = 10;
        ctx.appCtx.ssaoPass.minDistance = 0.001;
        ctx.appCtx.ssaoPass.maxDistance = 0.06;
        ctx.appCtx.ssaoPass.enabled = ctx.state.ssaoEnabled && ctx.state.renderQualityLevel === ctx.RENDER_QUALITY_HIGH;
        ctx.appCtx.composer.addPass(ctx.appCtx.ssaoPass);
      } catch (e) {
        console.warn('SSAO not available:', e);
        ctx.appCtx.ssaoPass = null;
      }
    }

    ctx.appCtx.bloomPass = null;
    if (typeof THREE.UnrealBloomPass !== 'undefined') {
      try {
        ctx.appCtx.bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2)), 0.15, 0.4, 0.85);
        ctx.appCtx.bloomPass.enabled = ctx.state.renderQualityLevel !== ctx.RENDER_QUALITY_LOW;
        ctx.appCtx.composer.addPass(ctx.appCtx.bloomPass);
      } catch (e) {
        console.warn('Bloom not available:', e);
      }
    }

    ctx.appCtx.smaaPass = null;
    if (typeof THREE.SMAAPass !== 'undefined') {
      try {
        ctx.appCtx.smaaPass = new THREE.SMAAPass(innerWidth * ctx.appCtx.renderer.getPixelRatio(), innerHeight * ctx.appCtx.renderer.getPixelRatio());
        ctx.appCtx.smaaPass.enabled = ctx.state.renderQualityLevel !== ctx.RENDER_QUALITY_LOW;
        ctx.appCtx.composer.addPass(ctx.appCtx.smaaPass);
      } catch (e) {
        console.warn('SMAA not available:', e);
      }
    }
    return true;
  } catch (e) {
    console.warn('Post-processing not available:', e);
    ctx.appCtx.composer = null;
    ctx.appCtx.ssaoPass = null;
    ctx.appCtx.bloomPass = null;
    ctx.appCtx.smaaPass = null;
    return false;
  }
}

export function tryEnablePostProcessing(ctx) {
  if (ctx.appCtx.composer) return true;
  const enabled = setupPostProcessingPipeline(ctx);
  if (enabled) {
    console.log('[engine] Post-processing enabled after deferred script load.');
  }
  return enabled;
}
import { applyDirectionalShadowPolicy } from './shadow-policy.js?v=1';
