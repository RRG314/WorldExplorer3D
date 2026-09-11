const AR_CAPABILITY_LEVELS = Object.freeze({
  SPATIAL: 'spatial-ar',
  CAMERA: 'camera-overlay',
  VIEWER: 'interactive-3d'
});

function isLocalHostname(hostname = '') {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname).toLowerCase());
}

function isTrustedArContext(scope = globalThis) {
  return scope?.isSecureContext === true || isLocalHostname(scope?.location?.hostname);
}

async function detectArCapabilities(options = {}) {
  const scope = options.scope || globalThis;
  const navigatorObject = options.navigatorObject || scope?.navigator || {};
  const secureContext = options.secureContext ?? isTrustedArContext(scope);
  const camera = !!(secureContext && navigatorObject.mediaDevices?.getUserMedia);
  const orientation = !!(secureContext && scope?.DeviceOrientationEvent);
  const xrApi = !!(secureContext && navigatorObject.xr?.isSessionSupported);
  let immersiveAr = false;
  let xrProbeError = '';
  if (xrApi) {
    try {
      immersiveAr = await navigatorObject.xr.isSessionSupported('immersive-ar') === true;
    } catch (error) {
      xrProbeError = String(error?.name || error?.message || error || 'xr-probe-failed');
    }
  }
  const level = immersiveAr ? AR_CAPABILITY_LEVELS.SPATIAL : camera ? AR_CAPABILITY_LEVELS.CAMERA : AR_CAPABILITY_LEVELS.VIEWER;
  const reason = !secureContext ? 'secure-context-required'
    : immersiveAr ? 'immersive-ar-supported'
      : camera ? 'camera-overlay-supported'
        : 'camera-unavailable';
  return Object.freeze({
    type: 'ArCapabilitySnapshot',
    checkedAt: Date.now(),
    secureContext,
    camera,
    orientation,
    xrApi,
    immersiveAr,
    level,
    reason,
    xrProbeError,
    supportsSurfacePlacement: immersiveAr,
    supportsPersistentAnchors: false,
    cameraFramesLeaveDevice: false
  });
}

function describeArCapability(snapshot = {}) {
  if (snapshot.level === AR_CAPABILITY_LEVELS.SPATIAL) return 'Spatial AR';
  if (snapshot.level === AR_CAPABILITY_LEVELS.CAMERA) return 'Camera view';
  return 'Interactive 3D';
}

export { AR_CAPABILITY_LEVELS, describeArCapability, detectArCapabilities, isTrustedArContext };
