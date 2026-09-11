function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function freezeSelection(selection, latitude, longitude) {
  return Object.freeze({
    ...selection,
    key: String(selection.key || ''),
    name: String(selection.name || 'Unknown location'),
    lat: latitude,
    lon: longitude
  });
}

export function createWorldLoadRequest(selection, sequence) {
  if (!selection || typeof selection !== 'object') return null;
  const latitude = finiteCoordinate(selection.lat);
  const longitude = finiteCoordinate(selection.lon);
  const requestSequence = Number(sequence);
  if (
    latitude === null || latitude < -90 || latitude > 90 ||
    longitude === null ||
    !Number.isSafeInteger(requestSequence) || requestSequence < 1
  ) return null;

  const selectionSnapshot = freezeSelection(selection, latitude, longitude);
  return Object.freeze({
    id: [
      'world-load',
      requestSequence,
      latitude.toFixed(7),
      longitude.toFixed(7),
      selectionSnapshot.key || 'custom'
    ].join(':'),
    sequence: requestSequence,
    name: selectionSnapshot.name,
    location: Object.freeze({ lat: latitude, lon: longitude }),
    selection: selectionSnapshot
  });
}

export function createSelectionRestoreCommand(request) {
  if (!request?.selection) return null;
  if (request.selection.key === 'custom') {
    return Object.freeze({
      method: 'setCustomLocation',
      selection: request.selection,
      options: Object.freeze({ transient: false, syncInputs: false })
    });
  }
  return Object.freeze({
    method: 'selectPresetLocation',
    key: request.selection.key
  });
}

export function isWorldLoadRequestActive(request, state = {}) {
  if (!request) return false;
  if (Number(state.activeSequence) !== request.sequence) return false;
  if (state.suppressed === true) return false;
  const sameLocation = typeof state.sameLocation === 'function'
    ? state.sameLocation
    : (left, right) => left?.lat === right?.lat && left?.lon === right?.lon;
  return sameLocation(state.activeLocation, request.location);
}
