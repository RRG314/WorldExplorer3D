function createMarineState() {
  return {
    marineSnapshot: null,
    marineLoadedAt: 0,
    marineQueryKey: '',
    marineLoading: false,
    marineError: '',
    marineRequestToken: 0
  };
}

async function ensureSelectedMarineData(ctx, state, force = false) {
  const selected = ctx.selectorSelection(state);
  if (!Number.isFinite(selected?.lat) || !Number.isFinite(selected?.lon)) {
    state.marineSnapshot = null;
    state.marineError = 'Choose a point on the globe before checking marine conditions.';
    return null;
  }
  const queryKey = `${selected.lat.toFixed(4)}:${selected.lon.toFixed(4)}`;
  if (!force && queryKey === state.marineQueryKey && state.marineLoadedAt) return state.marineSnapshot;
  const token = ++state.marineRequestToken;
  state.marineLoading = true;
  state.marineError = '';
  try {
    const snapshot = await ctx.marineService.selected({ lat: selected.lat, lon: selected.lon }, { force });
    if (token !== state.marineRequestToken) return state.marineSnapshot;
    state.marineSnapshot = snapshot;
    state.marineQueryKey = queryKey;
    state.marineLoadedAt = Date.now();
    if (!snapshot.model && !snapshot.station) {
      state.marineError = snapshot.warnings[0] || 'Marine data is unavailable for this selection.';
    }
  } catch (error) {
    if (token !== state.marineRequestToken) return state.marineSnapshot;
    state.marineSnapshot = null;
    state.marineQueryKey = queryKey;
    state.marineLoadedAt = Date.now();
    state.marineError = error?.message || 'Marine data is unavailable right now.';
  } finally {
    if (token === state.marineRequestToken) state.marineLoading = false;
  }
  return state.marineSnapshot;
}

export { createMarineState, ensureSelectedMarineData };
