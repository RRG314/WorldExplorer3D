function getGlobeSelectorElements() {
  return {
    root: document.getElementById('globeSelectorScreen'),
    stage: document.querySelector('.globe-selector-stage'),
    canvas: document.getElementById('globeSelectorCanvas'),
    latLonReadout: document.getElementById('globeSelectorLatLon'),
    placeReadout: document.getElementById('globeSelectorPlace'),
    searchInput: document.getElementById('globeLocationSearch'),
    mobileSearchInput: document.getElementById('globeMobileLocationSearch'),
    mobileSearchBtn: document.getElementById('globeMobileLocationSearchBtn'),
    searchStatus: document.getElementById('globeLocationSearchStatus'),
    latInput: document.getElementById('globeCustomLat'),
    lonInput: document.getElementById('globeCustomLon'),
    startBtn: document.getElementById('globeSelectorStartBtn'),
    backBtn: document.getElementById('globeSelectorBackBtn'),
    moonBtn: document.getElementById('globeSelectorMoonBtn'),
    spaceBtn: document.getElementById('globeSelectorSpaceBtn'),
    searchBtn: document.getElementById('globeLocationSearchBtn'),
    locateBtn: document.getElementById('globeSelectorLocateBtn'),
    exploreModeBtn: document.getElementById('globeSelectorExploreModeBtn'),
    liveEarthModeBtn: document.getElementById('globeSelectorLiveEarthModeBtn'),
    explorePanel: document.getElementById('globeSelectorExplorePanel'),
    liveEarthPanel: document.getElementById('globeSelectorLiveEarthPanel'),
    liveEarthStatus: document.getElementById('globeLiveEarthStatus'),
    liveEarthCategoryChips: document.getElementById('globeLiveEarthCategoryChips'),
    liveEarthLayerList: document.getElementById('globeLiveEarthLayerList'),
    liveEarthDetails: document.getElementById('globeLiveEarthDetails'),
    liveEarthRefreshBtn: document.getElementById('globeLiveEarthRefreshBtn'),
    nearbyTabBtn: document.getElementById('globeNearbyTabBtn'),
    favoritesTabBtn: document.getElementById('globeFavoritesTabBtn'),
    cityListHint: document.getElementById('globeCityListHint'),
    cityList: document.getElementById('globeCityList')
  };
}

export { getGlobeSelectorElements };
