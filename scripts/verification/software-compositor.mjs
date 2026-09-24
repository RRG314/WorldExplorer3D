// Explicit SwANGLE keeps remote WebGL and compositing on the same software
// driver. The old fallback stalled on per-frame GLES2 readbacks. This does not
// represent physical-device performance and never changes a local GPU run.
// https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md
export function softwareCompositorArgs() {
  return process.env.CI && process.platform === 'linux'
    ? ['--use-gl=angle', '--use-angle=swiftshader']
    : [];
}
