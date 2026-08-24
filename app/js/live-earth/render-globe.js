function ensureSelectorGroups(state) {
  const selector = state.selector;
  const api = selector.api;
  if (!api?.globeRoot || selector.group) return;
  selector.group = new THREE.Group();
  selector.group.name = 'LiveEarthOverlayGroup';
  selector.satelliteGroup = new THREE.Group();
  selector.earthquakeGroup = new THREE.Group();
  selector.weatherGroup = new THREE.Group();
  selector.deFlockGroup = new THREE.Group();
  selector.deFlockPointGroup = new THREE.Group();
  selector.deFlockSelectionGroup = new THREE.Group();
  selector.transportRouteGroup = new THREE.Group();
  selector.transportMarkerGroup = new THREE.Group();
  selector.group.add(selector.satelliteGroup);
  selector.group.add(selector.earthquakeGroup);
  selector.group.add(selector.weatherGroup);
  selector.group.add(selector.deFlockGroup);
  selector.deFlockGroup.add(selector.deFlockPointGroup);
  selector.deFlockGroup.add(selector.deFlockSelectionGroup);
  selector.group.add(selector.transportRouteGroup);
  selector.group.add(selector.transportMarkerGroup);
  api.globeRoot.add(selector.group);
}

function cameraDirectionEndpoint(camera, bearingDegrees, distanceDegrees = 0.45) {
  const bearing = Number(bearingDegrees) * Math.PI / 180;
  const lat = Number(camera.lat) + Math.cos(bearing) * distanceDegrees;
  const lonScale = Math.max(0.2, Math.cos(Number(camera.lat) * Math.PI / 180));
  const lon = Number(camera.lon) + Math.sin(bearing) * distanceDegrees / lonScale;
  return { lat: Math.max(-89.999, Math.min(89.999, lat)), lon: ((lon + 540) % 360) - 180 };
}

function renderDeFlockSelectionDirections(ctx, state, group) {
  const selected = ctx.selectedDeFlockCamera(state);
  if (!selected) return;
  const center = state.selector.api.latLonToLocalPoint(selected.lat, selected.lon, 1.023);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.00072, 0.00155, 24),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthTest: false })
  );
  marker.position.set(center.x, center.y, center.z);
  marker.lookAt(0, 0, 0);
  marker.renderOrder = 8;
  group.add(marker);
  const centerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.00036, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthTest: false })
  );
  centerDot.position.set(center.x, center.y, center.z);
  centerDot.lookAt(0, 0, 0);
  centerDot.renderOrder = 9;
  group.add(centerDot);
  const sectors = Array.isArray(selected.directionSectors) ? selected.directionSectors : [];
  if (!state.deFlockCoverageVisible || !sectors.length) return;
  sectors.forEach((sector) => {
    const mappedFov = Number(sector.fieldOfViewDegrees);
    const fieldOfView = sector.kind === 'panoramic' ? 360 : Number.isFinite(mappedFov) ? Math.max(8, Math.min(350, mappedFov)) : 70;
    const segments = fieldOfView >= 359 ? 32 : Math.max(6, Math.ceil(fieldOfView / 10));
    const startBearing = Number(sector.bearingDegrees) - fieldOfView * 0.5;
    const triangles = [];
    for (let index = 0; index < segments; index += 1) {
      const aGeo = cameraDirectionEndpoint(selected, startBearing + fieldOfView * index / segments);
      const bGeo = cameraDirectionEndpoint(selected, startBearing + fieldOfView * (index + 1) / segments);
      const a = state.selector.api.latLonToLocalPoint(aGeo.lat, aGeo.lon, 1.024);
      const b = state.selector.api.latLonToLocalPoint(bGeo.lat, bGeo.lon, 1.024);
      triangles.push(center.x, center.y, center.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const coverageGeometry = new THREE.BufferGeometry();
    coverageGeometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
    const coverage = new THREE.Mesh(
      coverageGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      })
    );
    coverage.renderOrder = 6;
    group.add(coverage);
    const outlinePoints = [];
    for (let index = 0; index <= segments; index += 1) {
      const edgeGeo = cameraDirectionEndpoint(selected, startBearing + fieldOfView * index / segments);
      const edge = state.selector.api.latLonToLocalPoint(edgeGeo.lat, edgeGeo.lon, 1.025);
      outlinePoints.push(new THREE.Vector3(edge.x, edge.y, edge.z));
    }
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center.x, center.y, center.z),
        ...outlinePoints,
        new THREE.Vector3(center.x, center.y, center.z)
      ]),
      new THREE.LineBasicMaterial({ color: 0xb9f7ff, transparent: true, opacity: 0.95, depthTest: false })
    );
    outline.renderOrder = 7;
    group.add(outline);
    const endGeo = cameraDirectionEndpoint(selected, sector.bearingDegrees);
    const end = state.selector.api.latLonToLocalPoint(endGeo.lat, endGeo.lon, 1.026);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(center.x, center.y, center.z),
        new THREE.Vector3(end.x, end.y, end.z)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, depthTest: false })
    );
    line.renderOrder = 7;
    group.add(line);
  });
}

export function renderDeFlockGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  removeChildren(selector.deFlockSelectionGroup);
  if (state.panelMode !== 'live-earth' || state.activeLayerId !== 'deflock-cameras') {
    selector.deFlockGroup.visible = false;
    return;
  }
  selector.deFlockGroup.visible = true;
  const snapshot = state.deFlockIndex;
  if (!snapshot?.count) return;
  const buildKey = JSON.stringify(snapshot.builds);
  if (selector.deFlockBuildKey !== buildKey || !selector.deFlockPointGroup?.children.length) {
    removeChildren(selector.deFlockPointGroup);
    selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'deflock');
    const positions = new Float32Array(snapshot.count * 3);
    let offset = 0;
    for (const index of snapshot.indexes) {
      for (let itemIndex = 0; itemIndex < index.count; itemIndex += 1) {
        const point = selector.api.latLonToLocalPoint(index.latitudes[itemIndex] / 1e6, index.longitudes[itemIndex] / 1e6, 1.017);
        positions[offset * 3] = point.x;
        positions[offset * 3 + 1] = point.y;
        positions[offset * 3 + 2] = point.z;
        offset += 1;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xff4f67,
        size: 1.45,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    points.renderOrder = 5;
    points.userData.liveEarth = { type: 'deflock' };
    selector.deFlockPointGroup.add(points);
    selector.markerRecords.push({ type: 'deflock', id: 'camera-index', mesh: points });
    selector.deFlockBuildKey = buildKey;
  }
  renderDeFlockSelectionDirections(ctx, state, selector.deFlockSelectionGroup);
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

function transportMarkerSpec(item = {}, type = 'aircraft', selected = false, overview = false) {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const observedAircraft = type === 'aircraft' && item.dataSource !== 'reference';
  const radius = Number.isFinite(Number(item.altitude))
    ? Number(item.altitude)
    : (type === 'ship' ? 1.018 : 1.055);
  return Object.freeze({
    lat,
    lon,
    radius,
    observedAircraft,
    color: type === 'ship' ? 0x9de5ff : (observedAircraft ? 0x55e6ff : 0xffd166),
    size: selected && !overview ? 0.003 : (observedAircraft ? (item.onGround ? 0.0015 : 0.002) : 0.012)
  });
}

function createAircraftMarkerGeometry(size) {
  const shape = new THREE.Shape();
  shape.moveTo(0, size * 1.35);
  shape.lineTo(size * 0.18, size * 0.35);
  shape.lineTo(size, size * 0.02);
  shape.lineTo(size, -size * 0.2);
  shape.lineTo(size * 0.2, -size * 0.08);
  shape.lineTo(size * 0.28, -size * 0.8);
  shape.lineTo(size * 0.08, -size * 0.92);
  shape.lineTo(0, -size * 0.58);
  shape.lineTo(-size * 0.08, -size * 0.92);
  shape.lineTo(-size * 0.28, -size * 0.8);
  shape.lineTo(-size * 0.2, -size * 0.08);
  shape.lineTo(-size, -size * 0.2);
  shape.lineTo(-size, size * 0.02);
  shape.lineTo(-size * 0.18, size * 0.35);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function renderSatelliteGlobe(ctx, state) {
  ensureSelectorGroups(state);
  const selector = state.selector;
  const api = selector.api;
  removeChildren(selector.satelliteGroup);
  selector.markerRecords = selector.markerRecords.filter((entry) => entry.type !== 'satellite');
  const overview = state.activeLayerId === 'overview';
  if (state.panelMode !== 'live-earth' || (!overview && state.activeLayerId !== 'satellites')) {
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

  if (overview || !state.satelliteTrackPoints.length) return;
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
  const overview = state.activeLayerId === 'overview';
  if (state.panelMode !== 'live-earth' || (!overview && state.activeLayerId !== 'earthquakes')) {
    selector.earthquakeGroup.visible = false;
    return;
  }
  selector.earthquakeGroup.visible = true;
  state.earthquakeItems.slice(0, overview ? 45 : 100).forEach((event) => {
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
  const overview = layerId === 'overview';
  if (state.panelMode !== 'live-earth' || (!overview && !['weather', 'storms', 'ocean-state'].includes(layerId))) {
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
  const overview = layerId === 'overview';
  if (state.panelMode !== 'live-earth' || (!overview && !['ships', 'aircraft'].includes(layerId))) {
    selector.transportRouteGroup.visible = false;
    selector.transportMarkerGroup.visible = false;
    return;
  }

  selector.transportRouteGroup.visible = true;
  selector.transportMarkerGroup.visible = true;
  const transportSets = overview ? [
    { type: 'ship', routes: state.shipRoutes, items: state.shipItems, selectedId: state.selectedShipId },
    { type: 'aircraft', routes: state.aircraftRoutes, items: state.aircraftItems, selectedId: state.selectedAircraftId }
  ] : [{
    type: layerId === 'ships' ? 'ship' : 'aircraft',
    routes: layerId === 'ships' ? state.shipRoutes : state.aircraftRoutes,
    items: layerId === 'ships' ? state.shipItems : state.aircraftItems,
    selectedId: layerId === 'ships' ? state.selectedShipId : state.selectedAircraftId
  }];

  transportSets.forEach(({ type, routes, items, selectedId }) => routes.forEach((route) => {
    const points = (route.renderPoints || []).map((entry) => {
      const point = api.latLonToLocalPoint(entry.lat, entry.lon, entry.altitude);
      return new THREE.Vector3(point.x, point.y, point.z);
    });
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: route.color || (type === 'ship' ? 0x67e8f9 : 0xfbbf24),
      transparent: true,
      opacity: route.id === (items.find((entry) => entry.id === selectedId)?.routeId || '') ? 0.9 : (overview ? 0.22 : 0.34)
    });
    const line = new THREE.Line(geometry, material);
    selector.transportRouteGroup.add(line);
  }));

  transportSets.forEach(({ type, items, selectedId }) => items.forEach((item) => {
    const selected = item.id === selectedId;
    const spec = transportMarkerSpec(item, type, selected, overview);
    if (!spec) return;
    const point = api.latLonToLocalPoint(spec.lat, spec.lon, spec.radius);
    if (spec.observedAircraft) {
      const surface = api.latLonToLocalPoint(spec.lat, spec.lon, 1.014);
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(surface.x, surface.y, surface.z),
          new THREE.Vector3(point.x, point.y, point.z)
        ]),
        new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: selected ? 0.9 : 0.42 })
      );
      selector.transportMarkerGroup.add(stem);
    }
    const mesh = new THREE.Mesh(
      spec.observedAircraft
        ? createAircraftMarkerGeometry(spec.size)
        : type === 'ship'
        ? new THREE.ConeGeometry(selected && !overview ? 0.015 : 0.011, selected && !overview ? 0.05 : 0.036, 6)
        : new THREE.ConeGeometry(selected && !overview ? 0.013 : 0.01, selected && !overview ? 0.054 : 0.04, 5),
      new THREE.MeshBasicMaterial({
        color: selected && spec.observedAircraft ? 0xffffff : spec.color,
        side: spec.observedAircraft ? THREE.DoubleSide : THREE.FrontSide,
        transparent: spec.observedAircraft,
        opacity: 0.96,
        depthWrite: !spec.observedAircraft
      })
    );
    mesh.position.set(point.x, point.y, point.z);
    mesh.lookAt(0, 0, 0);
    if (spec.observedAircraft) mesh.rotateZ(-(Number(item.headingDeg) || 0) * Math.PI / 180);
    else {
      mesh.rotateX(Math.PI * 0.5);
      mesh.rotateY((Number(item.headingDeg) || 0) * Math.PI / 180);
    }
    mesh.renderOrder = spec.observedAircraft ? 5 : 2;
    mesh.userData.liveEarth = { type, id: item.id };
    selector.transportMarkerGroup.add(mesh);
    selector.markerRecords.push({ type, id: item.id, lat: spec.lat, lon: spec.lon, altitude: spec.radius, dataSource: item.dataSource || 'reference', mesh });
  }));
}

export function renderGlobeLayers(ctx, state) {
  renderSatelliteGlobe(ctx, state);
  renderEarthquakeGlobe(ctx, state);
  renderWeatherGlobe(ctx, state);
  renderDeFlockGlobe(ctx, state);
  renderTransportGlobe(ctx, state);
}

export { transportMarkerSpec };
