const CACHE_BUST = 'v=442';
const threeRuntime = (relativePath) => (
  new URL(`../../vendor/three-r128/${relativePath}`, import.meta.url).toString()
);

export const vendorScriptsCritical = [
  threeRuntime('three.min.js'),
  threeRuntime('loaders/GLTFLoader.js')
];

export const vendorScriptsOptional = [
  threeRuntime('shaders/CopyShader.js'),
  threeRuntime('shaders/LuminosityHighPassShader.js'),
  threeRuntime('shaders/SSAOShader.js'),
  threeRuntime('shaders/DepthLimitedBlurShader.js'),
  threeRuntime('shaders/SMAAShader.js'),
  threeRuntime('math/SimplexNoise.js'),
  threeRuntime('postprocessing/EffectComposer.js'),
  threeRuntime('postprocessing/RenderPass.js'),
  threeRuntime('postprocessing/ShaderPass.js'),
  threeRuntime('postprocessing/SSAOPass.js'),
  threeRuntime('postprocessing/SMAAPass.js'),
  threeRuntime('postprocessing/UnrealBloomPass.js')
];

export const moduleEntrypoint = `./app-entry.js?${CACHE_BUST}`;

export const classicScripts = [];
