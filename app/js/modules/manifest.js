const CACHE_BUST = 'v=742';

export const vendorScriptsCritical = [
  '/app/vendor/three/build/three.min.js',
  '/app/vendor/three/examples/js/loaders/RGBELoader.js',
  '/app/vendor/three/examples/js/loaders/DRACOLoader.js',
  '/app/vendor/three/examples/js/loaders/GLTFLoader.js'
];

export const vendorScriptsOptional = [
  '/app/vendor/three/examples/js/shaders/CopyShader.js',
  '/app/vendor/three/examples/js/shaders/LuminosityHighPassShader.js',
  '/app/vendor/three/examples/js/shaders/SSAOShader.js',
  '/app/vendor/three/examples/js/shaders/DepthLimitedBlurShader.js',
  '/app/vendor/three/examples/js/shaders/SMAAShader.js',
  '/app/vendor/three/examples/js/math/SimplexNoise.js',
  '/app/vendor/three/examples/js/postprocessing/EffectComposer.js',
  '/app/vendor/three/examples/js/postprocessing/RenderPass.js',
  '/app/vendor/three/examples/js/postprocessing/SSAOPass.js',
  '/app/vendor/three/examples/js/postprocessing/ShaderPass.js',
  '/app/vendor/three/examples/js/postprocessing/SMAAPass.js',
  '/app/vendor/three/examples/js/postprocessing/UnrealBloomPass.js'
];

export const moduleEntrypoint = `./app-entry.js?${CACHE_BUST}`;

export const classicScripts = [];
