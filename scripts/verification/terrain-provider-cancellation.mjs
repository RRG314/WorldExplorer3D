// These application-owned requests have bounded timeouts or are canceled when
// their last terrain consumer is released. This classification applies only to
// browser cancellation, never HTTP failures, failed decoding, or GPU errors.
export function isExpectedTerrainProviderCancellation(url, reason) {
  if (reason !== 'net::ERR_ABORTED') return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.origin === 'https://vector.openstreetmap.org') {
    return /^\/shortbread_v1\/\d+\/\d+\/\d+\.mvt$/.test(parsed.pathname);
  }
  if (parsed.origin === 'https://marine-api.open-meteo.com') return parsed.pathname === '/v1/marine';
  return parsed.origin === 'https://planetarycomputer.microsoft.com' &&
    /^\/api\/data\/v1\/item\/bbox\/[\d.,-]+\/\d{1,3}x\d{1,3}\.npy$/.test(parsed.pathname) &&
    parsed.searchParams.get('collection') === 'esa-worldcover' &&
    /^ESA_WorldCover_10m_2021_v200_[NS]\d{2}[EW]\d{3}$/.test(parsed.searchParams.get('item') || '') &&
    parsed.searchParams.get('assets') === 'map';
}
