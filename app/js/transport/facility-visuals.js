import { compileAirportOperationalLayout, recordPoints } from './airport-layout.js?v=4';

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

function createPolygonGeometry(THREE, points) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => index ? shape.lineTo(point.x, point.z) : shape.moveTo(point.x, point.z));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
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

function addRunwayPresentation(THREE, group, record, track, sampleGround, mobile) {
  const raw = recordPoints(record);
  if (raw.length < 2) return;
  const start = raw[0];
  const end = raw.at(-1);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const yaw = Math.atan2(dx, dz);
  const width = facilityWidth(record);
  const center = { x: (start.x + end.x) * .5, z: (start.z + end.z) * .5 };
  const groundY = Number(sampleGround?.(center.x, center.z)) || 0;
  const white = runwayMarkingMaterial(THREE, track);
  const markingGroup = new THREE.Group();
  markingGroup.name = 'Runway markings';
  markingGroup.position.y = groundY + .09;
  markingGroup.rotation.y = yaw;
  group.add(markingGroup);
  const edgeWidth = Math.max(.18, Math.min(.42, width * .012));
  addBox(THREE, markingGroup, track, { x: edgeWidth, y: .018, z: length * .94 }, { x: -width * .46, y: 0, z: 0 }, white, 'Runway edge marking');
  addBox(THREE, markingGroup, track, { x: edgeWidth, y: .018, z: length * .94 }, { x: width * .46, y: 0, z: 0 }, white, 'Runway edge marking');
  const dashCount = Math.min(mobile ? 20 : 38, Math.max(6, Math.floor(length / 30)));
  for (let index = 0; index < dashCount; index += 1) {
    if (index % 2) continue;
    addBox(THREE, markingGroup, track, { x: .42, y: .02, z: length / dashCount * .58 }, {
      x: 0, y: .01, z: -length * .46 + (index + .5) * length * .92 / dashCount
    }, white, 'Runway centerline marking');
  }
  [-1, 1].forEach((direction) => {
    for (let stripe = -3; stripe <= 3; stripe += 1) {
      if (stripe === 0) continue;
      addBox(THREE, markingGroup, track, { x: width * .055, y: .02, z: Math.min(8, length * .025) }, {
        x: stripe * width * .095, y: .015, z: direction * length * .425
      }, white, 'Runway threshold marking');
    }
    for (const x of [-width * .16, width * .16]) {
      addBox(THREE, markingGroup, track, { x: width * .07, y: .02, z: Math.min(18, length * .055) }, {
        x, y: .015, z: direction * length * .31
      }, white, 'Runway aiming point');
    }
  });
  const lightCount = Math.min(mobile ? 22 : 46, Math.max(10, Math.floor(length / 24)));
  const lightMat = track.material(new THREE.MeshBasicMaterial({ color: 0xeaf7ff }));
  const lightGeometry = track.geometry(new THREE.SphereGeometry(.12, mobile ? 5 : 8, 5));
  for (let index = 0; index < lightCount; index += 1) {
    if (mobile && index % 2) continue;
    const forward = -length * .47 + index * length * .94 / Math.max(1, lightCount - 1);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeometry, lightMat);
      light.position.set(side * width * .51, .13, forward);
      light.name = 'Runway edge light';
      markingGroup.add(light);
    }
  }
}

function addRunwayDesignator(THREE, group, layout, track, sampleGround) {
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
  const point = layout.runwayStart;
  mesh.rotation.set(-Math.PI / 2, 0, -layout.yaw);
  mesh.position.set(point.x + Math.sin(layout.yaw) * layout.runwayLength * .09, (Number(sampleGround?.(point.x, point.z)) || 0) + .13, point.z + Math.cos(layout.yaw) * layout.runwayLength * .09);
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
      transparent: record.type === 'ferry_route',
      opacity: record.type === 'ferry_route' ? .62 : 1
    })));
    return materials.get(key);
  };
  const airportLayout = compileAirportOperationalLayout(graph, options);
  const renderedRunwayIds = new Set();
  for (const record of graph.records) {
    const points = pointsFor(record, options.sampleGround);
    if (!points.length) continue;
    if (record.type === 'control_tower') continue;
    let mesh;
    if (record.geometry?.kind === 'polygon' && points.length >= 3 && ['apron', 'terminal', 'hangar', 'helipad', 'pier', 'quay', 'dock'].includes(record.type)) {
      const geometry = track.geometry(createPolygonGeometry(THREE, points));
      mesh = new THREE.Mesh(geometry, materialFor(record));
      mesh.position.y = Math.max(...points.map(({ y }) => y)) + .045;
    } else if (points.length >= 2) {
      const geometry = track.geometry(createRibbonGeometry(THREE, points, facilityWidth(record)));
      mesh = new THREE.Mesh(geometry, materialFor(record));
      if (record.type === 'runway') {
        renderedRunwayIds.add(record.id);
        addRunwayPresentation(THREE, group, record, track, options.sampleGround, options.mobile === true);
      } else if (record.type === 'taxiway') {
        const centerline = track.geometry(createRibbonGeometry(THREE, points.map((point) => ({ ...point, y: point.y + .06 })), .18));
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
  if (airportLayout?.generatedFallback && !renderedRunwayIds.has(airportLayout.primaryRunway.id)) {
    const record = airportLayout.primaryRunway;
    const points = pointsFor(record, options.sampleGround);
    const mesh = new THREE.Mesh(track.geometry(createRibbonGeometry(THREE, points, facilityWidth(record))), materialFor(record));
    mesh.name = 'Generated gameplay runway';
    mesh.userData.transportFacilityId = record.id;
    mesh.userData.mapped = false;
    mesh.userData.generatedActivity = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addRunwayPresentation(THREE, group, record, track, options.sampleGround, options.mobile === true);
  }
  addRunwayDesignator(THREE, group, airportLayout, track, options.sampleGround);
  addStandPresentation(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  addControlTower(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  addGeneratedTerminal(THREE, group, airportLayout, track, options.sampleGround, options.mobile === true);
  group.userData.airportLayoutAuthority = airportLayout?.authority || '';
  group.userData.generatedAirportFallback = airportLayout?.generatedFallback === true;
  return Object.freeze({
    group,
    airportLayout,
    dispose() {
      group.removeFromParent?.();
      resources.geometries.forEach((geometry) => geometry.dispose?.());
      resources.materials.forEach((material) => material.dispose?.());
      resources.textures.forEach((texture) => texture.dispose?.());
    }
  });
}

export { createTransportFacilityVisuals };
