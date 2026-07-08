import { postProtectedFunction } from './function-api.js?v=1';

function sanitizeText(value, max = 180) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function saveOverlayFeatureDraft(input = {}) {
  const payload = await postProtectedFunction(
    '/saveOverlayFeatureDraft',
    input,
    { label: 'Overlay API' }
  );
  return payload || {};
}

export async function submitOverlayFeature(featureId) {
  const payload = await postProtectedFunction(
    '/submitOverlayFeature',
    { featureId: sanitizeText(featureId || '', 180) },
    { label: 'Overlay API' }
  );
  return payload || {};
}

export async function moderateOverlayFeature(featureId, action, note = '') {
  const payload = await postProtectedFunction(
    '/moderateOverlayFeature',
    {
      featureId: sanitizeText(featureId || '', 180),
      action: sanitizeText(action || '', 40).toLowerCase(),
      note: String(note || '').slice(0, 320)
    },
    { label: 'Overlay API' }
  );
  return payload || {};
}

export async function deleteOverlayFeatureDraft(featureId) {
  const payload = await postProtectedFunction(
    '/deleteOverlayFeatureDraft',
    { featureId: sanitizeText(featureId || '', 180) },
    { label: 'Overlay API' }
  );
  return payload || {};
}
