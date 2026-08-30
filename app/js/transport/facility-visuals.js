import { compileAirportOperationalLayout, recordPoints } from './airport-layout.js?v=6';

const FACILITY_COLORS = Object.freeze({
  aviation: 0x84d7e8,
  maritime: 0x66b8dc,
  runway: 0x768188,
  taxiway: 0x8b8769,
  apron: 0x68767c,
  helipad: 0xc8d9dc,
  pier: 0x8e7459,
  quay: 0x7d7b73,
  dock: 0x557d8e,
  berth: 0x8fc8d5,
  terminal: 0x8b9498,
  hangar: 0x69777e,
  parking_position: 0xe7c951,
  gate: 0xe7c951
});

function pointsFor(record, sampleGround) {
  return record.geometry.points.map((point) => ({
    x: point.x,
    y: Number(sampleGround?.(point.x, point.z)) || 0,
    z: point.z
  }));
}

function physicalPublicationAllowed(record) {
  if (record?.domain !== 'aviation') return true;
  return record?.geometryAuthority === 'exact-openstreetmap' ||
    (record?.geometryAuthority == null && record?.provenance?.provider !== 'openstreetmap-shortbread');
}

function surfaceFollowingProfile(record, sampleGround, spacing = 12, clearance = .09) {
  const raw = recordPoints(record);
  if (raw.length < 2) return [];
  const width = facilityWidth(record);
  const profile = [];
  for (let segment = 1; segment < raw.length; segment += 1) {
    const start = raw[segment - 1];
    const end = raw[segment];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.max(.001, Math.hypot(dx, dz));
    const divisions = Math.max(1, Math.ceil(length / Math.max(4, spacing)));
    const nx = -dz / length;
    const nz = dx / length;
    for (let division = segment === 1 ? 0 : 1; division <= divisions; division += 1) {
      const t = division / divisions;
      const x = start.x + dx * t;
      const z = start.z + dz * t;
      const sampled = [-.5, -.25, 0, .25, .5].map((factor) =>
        Number(sampleGround?.(x + nx * width * factor, z + nz * width * factor)) || 0);
      profile.push({ x, y: Math.max(...sampled) + clearance, z });
    }
  }
  profile.forEach((point, index) => { point.t = index / Math.max(1, profile.length - 1); });
  return profile;
}

function runwaySurfaceProfile(record, sampleGround, spacing = 12) {
  return surfaceFollowingProfile(record, sampleGround, spacing, .09);
}

function profilePointAt(profile, fraction) {
  if (!profile.length) return null;
  const scaled = Math.max(0, Math.min(1, fraction)) * (profile.length - 1);
  const left = profile[Math.floor(scaled)];
  const right = profile[Math.min(profile.length - 1, Math.ceil(scaled))];
  const mix = scaled - Math.floor(scaled);
  return {
    x: left.x + (right.x - left.x) * mix,
    y: left.y + (right.y - left.y) * mix,
    z: left.z + (right.z - left.z) * mix
  };
}

function offsetProfile(profile, lateral, yOffset = 0) {
  return profile.map((point, index) => {
    const previous = profile[Math.max(0, index - 1)];
    const next = profile[Math.min(profile.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.max(.001, Math.hypot(dx, dz));
    return { x: point.x - dz / length * lateral, y: point.y + yOffset, z: point.z + dx / length * lateral };
  });
}

function profileSurfaceYAt(surfaceProfiles, x, z) {
  let best = null;
  for (const surface of surfaceProfiles) {
    for (let index = 1; index < surface.profile.length; index += 1) {
      const start = surface.profile[index - 1];
      const end = surface.profile[index];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = Math.max(.0001, dx * dx + dz * dz);
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
      const px = start.x + dx * t;
      const pz = start.z + dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (distance > surface.width * .55 + 1.5 || (best && distance >= best.distance)) continue;
      best = { distance, y: start.y + (end.y - start.y) * t };
    }
  }
  return best?.y ?? null;
}

function createRibbonGeometry(THREE, points, width = 3) {
  const positions = [];
  const indices = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.max(.001, Math.hypot(dx, dz));
    const nx = -dz / length * width * .5;
    const nz = dx / length * width * .5;
    positions.push(points[index].x + nx, points[index].y + .035, points[index].z + nz);
    positions.push(points[index].x - nx, points[index].y + .035, points[index].z - nz);
    if (index < points.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createPolygonGeometry(THREE, points, sampleGround) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => index ? shape.lineTo(point.x, point.z) : shape.moveTo(point.x, point.z));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    position.setY(index, (Number(sampleGround?.(x, z)) || 0) + .06);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function facilityWidth(record) {
  if (record.type === 'runway') return Math.max(20, Number(record.attributes?.width) || 44);
  if (record.type === 'taxiway') return Math.max(7, Number(record.attributes?.width) || 11);
  if (record.type === 'ferry_route') return 1.2;
  if (['pier', 'quay'].includes(record.type)) return 4;
  return 2.2;
}

function addBox(THREE, parent, track, size, position, mat, name) {
  const geometry = track.geometry(new THREE.BoxGeometry(size.x, size.y, size.z));
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(position.x, position.y, position.z);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function runwayMarkingMaterial(THREE, track) {
  return track.material(new THREE.MeshBasicMaterial({ color: 0xf4f5ef, polygonOffset: true, polygonOffsetFactor: -4 }));
}

function addRunwayPresentation(THREE, group, record, profile, track, mobile) {
  const raw = recordPoints(record);
  if (raw.length < 2 || profile.length < 2) return;
  const start = raw[0];
  const end = raw.at(-1);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const width = facilityWidth(record);
  const white = runwayMarkingMaterial(THREE, track);
  const edgeWidth = Math.max(.18, Math.min(.42, width * .012));
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      track.geometry(createRibbonGeometry(THREE, offsetProfile(profile, side * width * .46, .055), edgeWidth)),
      white
    );
    edge.name = 'Runway edge marking';
    edge.renderOrder = 8;
    group.add(edge);
  }
  const dashCount = Math.min(mobile ? 20 : 38, Math.max(6, Math.floor(length / 30)));
  for (let index = 0; index < dashCount; index += 1) {
    if (index % 2) continue;
    const startFraction = .04 + index * .92 / dashCount;
    const endFraction = Math.min(.96, startFraction + .58 * .92 / dashCount);
    const dash = new THREE.Mesh(track.geometry(createRibbonGeometry(THREE, [
      { ...profilePointAt(profile, startFraction), y: profilePointAt(profile, startFraction).y + .06 },
      { ...profilePointAt(profile, endFraction), y: profilePointAt(profile, endFraction).y + .06 }
    ], .42)), white);
    dash.name = 'Runway centerline marking';
    dash.renderOrder = 8;
    group.add(dash);
  }
  [-1, 1].forEach((direction) => {
    for (let stripe = -3; stripe <= 3; stripe += 1) {
      if (stripe === 0) continue;
      const fraction = direction < 0 ? .075 : .925;
      const point = profilePointAt(profile, fraction);
      const stripeMesh = addBox(THREE, group, track,
        { x: width * .055, y: .02, z: Math.min(8, length * .025) },
        { x: point.x + Math.cos(yaw) * stripe * width * .095, y: point.y + .095, z: point.z - Math.sin(yaw) * stripe * width * .095 },
        white, 'Runway threshold marking');
      stripeMesh.rotation.y = yaw;
      stripeMesh.renderOrder = 8;
    }
    for (const x of [-width * .16, width * .16]) {
      const fraction = direction < 0 ? .19 : .81;
      const point = profilePointAt(profile, fraction);
      const aiming = addBox(THREE, group, track,
        { x: width * .07, y: .02, z: Math.min(18, length * .055) },
        { x: point.x + Math.cos(yaw) * x, y: point.y + .095, z: point.z - Math.sin(yaw) * x },
        white, 'Runway aiming point');
      aiming.rotation.y = yaw;
      aiming.renderOrder = 8;
    }
  });
  const lightCount = Math.min(mobile ? 22 : 46, Math.max(10, Math.floor(length / 24)));
  const lightMat = track.material(new THREE.MeshBasicMaterial({ color: 0xeaf7ff }));
  const lightGeometry = track.geometry(new THREE.SphereGeometry(.12, mobile ? 5 : 8, 5));
  for (let index = 0; index < lightCount; index += 1) {
    if (mobile && index % 2) continue;
    const fraction = .03 + index * .94 / Math.max(1, lightCount - 1);
    const point = profilePointAt(profile, fraction);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeometry, lightMat);
      light.position.set(
        point.x + Math.cos(yaw) * side * width * .51,
        point.y + .14,
        point.z - Math.sin(yaw) * side * width * .51
      );
      light.name = 'Runway edge light';
      group.add(light);
    }
  }
}

function addRunwayDesignator(THREE, group, layout, profile, track) {
  if (!globalThis.document?.createElement || !layout) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f4f5ef';
  context.font = '700 84px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(layout.runwayDesignator || '').slice(0, 6), canvas.width / 2, canvas.height / 2);
  const texture = track.texture(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = track.material(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  const mesh = new THREE.Mesh(track.geometry(new THREE.PlaneGeometry(Math.min(20, layout.runwayWidth * .45), Math.min(10, layout.runwayLength * .04))), material);
  const point = profilePointAt(profile, .09);
  if (!point) return;
  mesh.rotation.set(-Math.PI / 2, 0, -layout.yaw);
  mesh.position.set(point.x, point.y + .1, point.z);
  mesh.name = 'Runway designator';
  group.add(mesh);
}

function addStandPresentation(THREE, group, layout, track, sampleGround, mobile) {
  if (!layout) return;
  const yellow = track.material(new THREE.MeshBasicMaterial({ color: 0xe8c63f }));
  const stands = layout.stands.slice(0, mobile ? 10 : 22);
  stands.forEach((stand) => {
    const y = (Number(sampleGround?.(stand.x, stand.z)) || 0) + .1;
    const standGroup = new THREE.Group();
    standGroup.position.set(stand.x, y, stand.z);
    standGroup.rotation.y = stand.yaw;
    standGroup.userData.airportStandId = stand.id;
    addBox(THREE, standGroup, track, { x: .18, y: .018, z: 18 }, { x: 0, y: 0, z: -5 }, yellow, 'Aircraft stand lead-in');
    addBox(THREE, standGroup, track, { x: 7, y: .02, z: .24 }, { x: 0, y: .01, z: 3.5 }, yellow, 'Aircraft stop line');
    group.add(standGroup);
  });
}

function addControlTower(THREE, group, layout, track, sampleGround, mobile) {
  if (!layout?.tower) return;
  const tower = layout.tower;
  const groundY = Number(sampleGround?.(tower.x, tower.z)) || 0;
  const shaftMat = track.material(new THREE.MeshStandardMaterial({ color: 0x879398, roughness: .73 }));
  const glassMat = track.material(new THREE.MeshStandardMaterial({ color: 0x193d4b, roughness: .2, metalness: .22, emissive: 0x07151b }));
  const roofMat = track.material(new THREE.MeshStandardMaterial({ color: 0x2c363b, roughness: .58, metalness: .2 }));
  const towerGroup = new THREE.Group();
  towerGroup.name = tower.mapped ? 'Mapped airport control tower' : 'Generated airport control tower';
  towerGroup.position.set(tower.x, groundY, tower.z);
  towerGroup.userData.transportFacilityId = tower.id;
  towerGroup.userData.mapped = tower.mapped;
  towerGroup.userData.generatedActivity = tower.generatedActivity;
  const shaft = new THREE.Mesh(track.geometry(new THREE.CylinderGeometry(2.6, 4.1, tower.height * .78, mobile ? 8 : 14)), shaftMat);
  shaft.position.y = tower.height * .39;
  shaft.castShadow = true;
  towerGroup.add(shaft);
  const cab = new THREE.Mesh(track.geometry(new THREE.CylinderGeometry(5.1, 4.5, tower.height * .14, mobile ? 8 : 14)), glassMat);
  cab.position.y = tower.height * .84;
  cab.castShadow = true;
  towerGroup.add(cab);
  const roof = new THREE.Mesh(track.geometry(new THREE.CylinderGeometry(5.7, 5.1, .7, mobile ? 8 : 14)), roofMat);
  roof.position.y = tower.height * .93;
  towerGroup.add(roof);
  const antenna = new THREE.Mesh(track.geometry(new THREE.CylinderGeometry(.08, .12, tower.height * .15, 6)), roofMat);
  antenna.position.y = tower.height;
  towerGroup.add(antenna);
  const beacon = new THREE.Mesh(track.geometry(new THREE.SphereGeometry(.22, 8, 6)), track.material(new THREE.MeshBasicMaterial({ color: 0x8ff5a4 })));
  beacon.position.y = tower.height * 1.08;
  towerGroup.add(beacon);
  group.add(towerGroup);
}

function addGeneratedTerminal(THREE, group, layout, track, sampleGround, mobile) {
  if (!layout?.ticketCounter || layout.hasMappedTerminal) return;
  const terminal = layout.ticketCounter;
  const groundY = Number(sampleGround?.(terminal.x, terminal.z)) || 0;
  const body = track.material(new THREE.MeshStandardMaterial({ color: 0x7f8b91, roughness: .68, metalness: .12 }));
  const glass = track.material(new THREE.MeshStandardMaterial({ color: 0x173945, roughness: .18, metalness: .26, emissive: 0x06161d, emissiveIntensity: .35 }));
  const roof = track.material(new THREE.MeshStandardMaterial({ color: 0x303b40, roughness: .58, metalness: .22 }));
  const terminalGroup = new THREE.Group();
  terminalGroup.name = 'Generated airport terminal and ticket hall';
  terminalGroup.position.set(terminal.x, groundY, terminal.z);
  terminalGroup.rotation.y = terminal.yaw;
  terminalGroup.userData.transportFacilityId = terminal.id;
  terminalGroup.userData.airportTicketCounter = true;
  terminalGroup.userData.mapped = false;
  terminalGroup.userData.generatedActivity = true;
  addBox(THREE, terminalGroup, track, { x: mobile ? 38 : 54, y: 8.5, z: mobile ? 15 : 20 }, { x: 0, y: 4.25, z: 0 }, body, 'Airport terminal');
  addBox(THREE, terminalGroup, track, { x: mobile ? 32 : 48, y: 4.4, z: .28 }, { x: 0, y: 4.1, z: (mobile ? 15 : 20) * .505 }, glass, 'Terminal glass frontage');
  addBox(THREE, terminalGroup, track, { x: mobile ? 40 : 57, y: .65, z: mobile ? 17 : 22 }, { x: 0, y: 8.75, z: 0 }, roof, 'Terminal roof');
  const entranceMat = track.material(new THREE.MeshStandardMaterial({ color: 0x102a35, roughness: .18, metalness: .3 }));
  addBox(THREE, terminalGroup, track, { x: 7, y: 3.5, z: .36 }, { x: 0, y: 1.75, z: (mobile ? 15 : 20) * .53 }, entranceMat, 'Ticket hall entrance');
  const signMat = track.material(new THREE.MeshBasicMaterial({ color: 0xb9f0f3 }));
  addBox(THREE, terminalGroup, track, { x: 13, y: 1.1, z: .24 }, { x: 0, y: 7, z: (mobile ? 15 : 20) * .53 }, signMat, 'Airport terminal sign');
  group.add(terminalGroup);
}

function createTransportFacilityVisuals(THREE, graph, options = {}) {
  const group = new THREE.Group();
  group.name = 'Mapped Transport Facilities';
  group.userData.transportFacilityAuthority = graph.authority;
  group.userData.transportFacilityRecordCount = graph.records.length;
  const resources = { geometries: [], materials: [], textures: [] };
  const track = {
    geometry(value) { resources.geometries.push(value); return value; },
    material(value) { resources.materials.push(value); return value; },
    texture(value) { resources.textures.push(value); return value; }
  };
  const materials = new Map();
  const materialFor = (record) => {
    const key = `${record.domain}:${record.type}`;
    if (!materials.has(key)) materials.set(key, track.material(new THREE.MeshStandardMaterial({
      color: FACILITY_COLORS[record.type] || FACILITY_COLORS[record.domain],
      roughness: .82,
      metalness: .08,
      polygonOffset: ['runway', 'taxiway', 'apron'].includes(record.type),
      polygonOffsetFactor: ['runway', 'taxiway', 'apron'].includes(record.type) ? -2 : 0,
      polygonOffsetUnits: ['runway', 'taxiway', 'apron'].includes(record.type) ? -2 : 0,
      transparent: record.type === 'ferry_route',
      opacity: record.type === 'ferry_route' ? .62 : 1
    })));
    return materials.get(key);
  };
  const airportLayout = compileAirportOperationalLayout(graph, options);
  let primaryRunwayProfile = [];
  const surfaceProfiles = [];
  for (const record of graph.records) {
    if (!physicalPublicationAllowed(record)) continue;
    const points = pointsFor(record, options.sampleGround);
    if (!points.length) continue;
    if (record.type === 'control_tower') continue;
    let mesh;
    if (record.geometry?.kind === 'polygon' && points.length >= 3 && ['apron', 'terminal', 'hangar', 'helipad', 'pier', 'quay', 'dock'].includes(record.type)) {
      const geometry = track.geometry(createPolygonGeometry(THREE, points, options.sampleGround));
      mesh = new THREE.Mesh(geometry, materialFor(record));
    } else if (points.length >= 2) {
      const surfaceProfile = record.type === 'runway'
        ? runwaySurfaceProfile(record, options.sampleGround, options.mobile === true ? 18 : 10)
        : record.type === 'taxiway'
          ? surfaceFollowingProfile(record, options.sampleGround, options.mobile === true ? 20 : 12, .075)
          : points;
      const geometry = track.geometry(createRibbonGeometry(THREE, surfaceProfile, facilityWidth(record)));
      if (['runway', 'taxiway'].includes(record.type)) {
        surfaceProfiles.push({ profile: surfaceProfile, width: facilityWidth(record), type: record.type, id: record.id });
      }
      mesh = new THREE.Mesh(geometry, materialFor(record));
      if (record.type === 'runway') {
        mesh.renderOrder = 6;
        if (record.id === airportLayout?.primaryRunway?.id) primaryRunwayProfile = surfaceProfile;
        addRunwayPresentation(THREE, group, record, surfaceProfile, track, options.mobile === true);
      } else if (record.type === 'taxiway') {
        const centerline = track.geometry(createRibbonGeometry(THREE, surfaceProfile.map((point) => ({ ...point, y: point.y + .06 })), .18));
        const centerlineMesh = new THREE.Mesh(centerline, track.material(new THREE.MeshBasicMaterial({ color: 0xe7c743 })));
        centerlineMesh.name = 'Taxiway centerline';
        group.add(centerlineMesh);
      }
    } else {
      const radius = ['aerodrome', 'heliport', 'harbour', 'marina', 'port'].includes(record.type) ? 4.5 : 2.2;
      const geometry = track.geometry(new THREE.CylinderGeometry(radius, radius, .12, 20));
      mesh = new THREE.Mesh(geometry, materialFor(record));
      mesh.position.set(points[0].x, points[0].y + .08, points[0].z);
    }
    mesh.name = `Mapped ${record.domain} ${record.type}`;
    mesh.userData.transportFacilityId = record.id;
    mesh.userData.transportFacilityType = record.type;
    mesh.userData.mapped = true;
    mesh.userData.generatedActivity = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  addRunwayDesignator(THREE, group, airportLayout, primaryRunwayProfile, track);
  addStandPresentation(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  addControlTower(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  addGeneratedTerminal(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  group.userData.airportLayoutAuthority = airportLayout?.authority || '';
  group.userData.generatedAirportFallback = airportLayout?.generatedFallback === true;
  return Object.freeze({
    group,
    airportLayout,
    surfaceYAt(x, z) {
      return profileSurfaceYAt(surfaceProfiles, Number(x), Number(z));
    },
    dispose() {
      group.removeFromParent?.();
      resources.geometries.forEach((geometry) => geometry.dispose?.());
      resources.materials.forEach((material) => material.dispose?.());
      resources.textures.forEach((texture) => texture.dispose?.());
    }
  });
}

export {
  createTransportFacilityVisuals,
  physicalPublicationAllowed,
  profileSurfaceYAt,
  runwaySurfaceProfile
};
