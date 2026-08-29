let modulePromise = null;

function emptySummary() {
  return {
    activeLayerId: 'overview',
    activeCategoryId: '',
    satellites: 0,
    earthquakes: 0,
    weatherSamples: 0,
    ships: 0,
    aircraft: 0,
    aircraftSourceMode: 'not-loaded',
    streetImagery: 0,
    localEventId: '',
    selectedSatelliteId: '',
    selectedEarthquakeId: '',
    selectedShipId: '',
    selectedAircraftId: '',
    aircraftMarkers: [],
    selectedStreetImageId: '',
    streetImageryProviderId: 'panoramax'
  };
}

function installOnDemandLiveEarth(appCtx) {
  let selectorApi = null;
  let selectorOpen = false;
  let requestedPanelMode = 'explore';

  async function ensureLiveEarthReady() {
    if (!modulePromise) {
      modulePromise = import('../live-earth/controller.js?v=31').then((controller) => {
        const liveEarth = controller.initLiveEarth();
        if (selectorApi) liveEarth.bindGlobeSelector(selectorApi);
        liveEarth.setPanelMode(requestedPanelMode);
        if (selectorOpen && selectorApi?.isOpen?.()) liveEarth.onSelectorOpen();
        return liveEarth;
      }).catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  }

  const facade = {
    ready: false,
    state: null,
    categories: [],
    layers: {},
    bindGlobeSelector(api) {
      selectorApi = api || null;
    },
    handleGlobePick() {
      return false;
    },
    onSelectorOpen() {
      selectorOpen = true;
    },
    onSelectorClose() {
      selectorOpen = false;
    },
    onSelectorSelectionChanged() {},
    setPanelMode(mode) {
      requestedPanelMode = mode === 'live-earth' ? 'live-earth' : 'explore';
      if (requestedPanelMode !== 'live-earth') return false;
      void ensureLiveEarthReady().catch((error) => {
        console.warn('[live-earth] On-demand initialization failed.', error);
      });
      return true;
    },
    getPanelMode() {
      return requestedPanelMode;
    },
    async setActiveLayer(layerId) {
      const liveEarth = await ensureLiveEarthReady();
      return liveEarth.setActiveLayer(layerId);
    },
    updateFrame() {},
    updateSelectorFrame() {},
    async openLiveEarth(layerId = 'overview') {
      requestedPanelMode = 'live-earth';
      const liveEarth = await ensureLiveEarthReady();
      return liveEarth.openLiveEarth(layerId);
    },
    getSummary: emptySummary,
    inspectState() {
      return { ...emptySummary(), panelMode: requestedPanelMode };
    }
  };

  appCtx.liveEarth = facade;
  appCtx.ensureLiveEarthReady = ensureLiveEarthReady;
  appCtx.openLiveEarthSelector = (layerId = 'overview') => facade.openLiveEarth(layerId);
  appCtx.getLiveEarthSummary = emptySummary;
  appCtx.inspectLiveEarthState = () => facade.inspectState();
  return { ensureLiveEarthReady };
}

export { installOnDemandLiveEarth };
