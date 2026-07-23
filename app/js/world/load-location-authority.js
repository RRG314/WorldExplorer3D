function commitWorldLocationAuthority(appCtx, selection) {
  const lat = Number(selection?.lat);
  const lon = Number(selection?.lon);
  if (!appCtx || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  appCtx.LOC = { lat, lon };
  if (selection?.key === 'custom') {
    const committed = appCtx.setCustomLocation?.({
      lat,
      lon,
      name: String(selection?.name || 'Custom Location'),
      arrivalMode: selection?.arrivalMode
    }, { transient: false, syncInputs: false }) !== false;
    const place = appCtx.livePlaceState;
    if (
      committed &&
      place?.resolutionSource === 'selection-fallback' &&
      Math.abs(Number(place.lat) - lat) < 1e-6 &&
      Math.abs(Number(place.lon) - lon) < 1e-6
    ) {
      const label = String(selection?.name || 'Custom Location');
      appCtx.livePlaceState = {
        ...place,
        display: label,
        shortLabel: label
      };
    }
    return committed;
  }
  const key = String(selection?.key || '').trim();
  if (key && typeof appCtx.selectPresetLocation === 'function') {
    return appCtx.selectPresetLocation(key) !== false;
  }
  return true;
}

export { commitWorldLocationAuthority };
