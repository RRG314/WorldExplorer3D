// Conservative first-run presentation for known shared-memory GPUs. This is
// an input to the existing engine owner, not an adaptive loop or saved setting.
export function classifyGraphicsTier(rendererName = '', viewportPixels = Infinity) {
  const name = String(rendererName).toLowerCase();
  if (viewportPixels < 500000 || /mobile|mali|adreno|powervr|apple gpu|sgx|tegra|swiftshader|llvmpipe/.test(name)) return 'low';
  // ANGLE reports the base desktop chip as "Apple M1", rather than the
  // "Apple GPU" mobile label. Pro/Max/Ultra are different hardware profiles.
  if (/intel|uhd|iris|hd graphics|mesa/.test(name) || /\bapple m1\b(?!\s+(?:pro|max|ultra)\b)/.test(name)) return 'mid';
  return 'high';
}

export function initialRenderQuality({savedQuality, mobile = false, gpuTier = 'high'} = {}) {
  if (['low', 'med', 'high'].includes(savedQuality)) return savedQuality;
  return mobile || gpuTier === 'low' || gpuTier === 'mid' ? 'low' : 'med';
}
