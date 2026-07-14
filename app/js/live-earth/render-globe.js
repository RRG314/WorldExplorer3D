function ensureSelectorGroups(state) {
  const selector = state.selector;
  const api = selector.api;
  if (!api?.globeRoot || selector.group) return;
  selector.group = new THREE.Group();
  selector.group.name = 'LiveEarthOverlayGroup';
  selector.satelliteGroup = new THREE.Group();
  selector.earthquakeGroup = new THREE.Group();
  selector.weatherGroup = new THREE.Group();
  selector.transportRouteGroup = new THREE.Group();
  selector.transportMarkerGroup = new THREE.Group();
  selector.group.add(selector.satelliteGroup);
  selector.group.add(selector.earthquakeGroup);
  selector.group.add(selector.weatherGroup);
  selector.group.add(selector.transportRouteGroup);
  selector.group.add(selector.transportMarkerGroup);
  api.globeRoot.add(selector.group);
}

function removeChildren(group) {
  if (!group) return;
  while (group.children.length) {
    const child = group.children.pop();
    if (!child) continue;
    group.remove(child);
    if (child.geometry?.dispose) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((entry) => entry?.dispose?.());
      else child.material.dispose?.();
    }
  }
}

export function renderSatelliteGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.satelliteGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'satellite');
  if (state.panelMode !== 'live-earth' || state.activeLayerId !== 'satellites') {
    selector.satelliteGroup.visible = false;
    if (selector.trackLine) selector.trackLine.visible = false;
    return;
  }
  selector.satelliteGroup.visible = true;

  ctx.filteredSatelliteItems(state).forEach((entry) => {
    const position = state.satellitePositions.find((item) => item.id === entry.id);
    if (!position) return;
    const altitudeScale = 1.065 + ctx.clamp01(position.altitudeKm / 42000) * 0.12;
    const point = api.latLonToLocalPoint(position.lat, position.lon, altitudeScale);
    const isSelected = entry.id === state.selectedSatelliteId;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.017 : 0.011, 12, 10),
      new THREE.MeshBasicMaterial({
        color: String(entry.classLabel || '').toLowerCase() === 'weather' ? 0x4fc3ff : 0xffffff
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'satellite', id: entry.id };
    selector.satelliteGroup.add(mesh);
    selector.markerRecords.push({ type: 'satellite', id: entry.id, mesh });
  });

  if (selector.trackLine) {
    selector.group.remove(selector.trackLine);
    selector.trackLine.geometry?.dispose?.();
    selector.trackLine.material?.dispose?.();
    selector.trackLine = null;
  }

  if (!state.satelliteTrackPoints.length) return;
  const points = state.satelliteTrackPoints.map((entry) => {
    const radius = 1.05 + ctx.clamp01(Number(entry.altitudeKm) / 42000) * 0.14;
    const point = api.latLonToLocalPoint(entry.lat, entry.lon, radius);
    return new THREE.Vector3(point.x, point.y, point.z);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  selector.trackLine = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x80d5ff, transparent: true, opacity: 0.8 })
  );
  selector.group.add(selector.trackLine);
}

export function renderEarthquakeGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.earthquakeGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'earthquake');
  if (state.panelMode !== 'live-earth' || state.activeLayerId !== 'earthquakes') {
    selector.earthquakeGroup.visible = false;
    return;
  }
  selector.earthquakeGroup.visible = true;
  state.earthquakeItems.slice(0, 100).forEach((event) => {
    const point = api.latLonToLocalPoint(event.lat, event.lon, 1.018);
    const radius = 0.008 + ctx.clamp01((Number(event.magnitude) || 0) / 8) * 0.018;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 10, 9),
      new THREE.MeshBasicMaterial({
        color: ctx.colorForMagnitude(event.magnitude)
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'earthquake', id: event.id };
    selector.earthquakeGroup.add(mesh);
    selector.markerRecords.push({ type: 'earthquake', id: event.id, mesh });
  });
}

export function renderWeatherGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.weatherGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'weather');
  const layerId = state.activeLayerId;
  if (state.panelMode !== 'live-earth' || !['weather', 'storms', 'ocean-state'].includes(layerId)) {
    selector.weatherGroup.visible = false;
    return;
  }
  selector.weatherGroup.visible = true;
  const sourceItems = layerId === 'storms'
    ? ctx.stormSamples(state)
    : layerId === 'ocean-state'
      ? ctx.oceanSamples(state)
      : state.weatherSamples;

  sourceItems.forEach((sample) => {
    const point = api.latLonToLocalPoint(sample.lat, sample.lon, 1.02);
    const isSelected = sample.id === state.selectedWeatherSampleId;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.016 : 0.011, 12, 10),
      new THREE.MeshBasicMaterial({
        color: layerId === 'storms'
          ? ctx.colorForStormSeverity(sample.stormSeverity)
          : layerId === 'ocean-state'
            ? sample.oceanState?.color || 0x67e8f9
            : ctx.colorForWeatherCategory(sample.snapshot?.category)
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.userData.liveEarth = { type: 'weather', id: sample.id };
    selector.weatherGroup.add(mesh);
    selector.markerRecords.push({ type: 'weather', id: sample.id, mesh });
  });

  const selection = ctx.selectorSelection(state);
  if (Number.isFinite(selection?.lat) && Number.isFinite(selection?.lon)) {
    const selectionPoint = api.latLonToLocalPoint(selection.lat, selection.lon, 1.028);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.016, 0.028, 20),
      new THREE.MeshBasicMaterial({
        color: ctx.colorForWeatherCategory(state.selectionWeather?.category),
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide
      })
    );
    marker.position.set(selectionPoint.x, selectionPoint.y, selectionPoint.z);
    marker.lookAt(0, 0, 0);
    selector.weatherGroup.add(marker);
  }
}

export function renderTransportGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.transportRouteGroup);
  removeChildren(selector.transportMarkerGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'ship' && entry.type !== 'aircraft');
  const layerId = state.activeLayerId;
  if (state.panelMode !== 'live-earth' || !['ships', 'aircraft'].includes(layerId)) {
    selector.transportRouteGroup.visible = false;
    selector.transportMarkerGroup.visible = false;
    return;
  }

  selector.transportRouteGroup.visible = true;
  selector.transportMarkerGroup.visible = true;
  const routes = layerId === 'ships' ? state.shipRoutes : state.aircraftRoutes;
  const items = layerId === 'ships' ? state.shipItems : state.aircraftItems;
  const selectedId = layerId === 'ships' ? state.selectedShipId : state.selectedAircraftId;

  routes.forEach((route) => {
    const points = (route.renderPoints || []).map((entry) => {
      const point = api.latLonToLocalPoint(entry.lat, entry.lon, entry.altitude);
      return new THREE.Vector3(point.x, point.y, point.z);
    });
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: route.color || (layerId === 'ships' ? 0x67e8f9 : 0xfbbf24),
      transparent: true,
      opacity: route.id === (items.find((entry) => entry.id === selectedId)?.routeId || '') ? 0.96 : 0.34
    });
    const line = new THREE.Line(geometry, material);
    selector.transportRouteGroup.add(line);
  });

  items.forEach((item) => {
    const point = api.latLonToLocalPoint(item.lat, item.lon, item.altitude || (layerId === 'ships' ? 1.018 : 1.055));
    const selected = item.id === selectedId;
    const color = layerId === 'ships' ? 0x9de5ff : 0xffd166;
    const mesh = new THREE.Mesh(
      layerId === 'ships'
        ? new THREE.ConeGeometry(selected ? 0.015 : 0.011, selected ? 0.05 : 0.036, 6)
        : new THREE.ConeGeometry(selected ? 0.013 : 0.01, selected ? 0.054 : 0.04, 5),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(Math.PI * 0.5);
    mesh.rotateY((Number(item.headingDeg) || 0) * Math.PI / 180);
    mesh.userData.liveEarth = { type: layerId === 'ships' ? 'ship' : 'aircraft', id: item.id };
    selector.transportMarkerGroup.add(mesh);
    selector.markerRecords.push({ type: layerId === 'ships' ? 'ship' : 'aircraft', id: item.id, mesh });
  });
}

export function renderGlobeLayers(ctx, state) {
  renderSatelliteGlobe(ctx, state);
  renderEarthquakeGlobe(ctx, state);
  renderWeatherGlobe(ctx, state);
  renderTransportGlobe(ctx, state);
}
