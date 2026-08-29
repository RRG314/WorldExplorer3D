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
  berth: 0x8fc8d5
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

function facilityWidth(record) {
  if (record.type === 'runway') return 22;
  if (record.type === 'taxiway') return 7;
  if (record.type === 'ferry_route') return 1.2;
  if (['pier', 'quay'].includes(record.type)) return 4;
  return 2.2;
}

function createTransportFacilityVisuals(THREE, graph, options = {}) {
  const group = new THREE.Group();
  group.name = 'Mapped Transport Facilities';
  group.userData.transportFacilityAuthority = graph.authority;
  group.userData.transportFacilityRecordCount = graph.records.length;
  const materials = new Map();
  const materialFor = (record) => {
    const key = `${record.domain}:${record.type}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color: FACILITY_COLORS[record.type] || FACILITY_COLORS[record.domain],
      roughness: .82,
      metalness: .08,
      transparent: record.type === 'ferry_route',
      opacity: record.type === 'ferry_route' ? .62 : 1
    }));
    return materials.get(key);
  };
  const geometries = [];
  for (const record of graph.records) {
    const points = pointsFor(record, options.sampleGround);
    if (!points.length) continue;
    let mesh;
    if (points.length >= 2) {
      const geometry = createRibbonGeometry(THREE, points, facilityWidth(record));
      geometries.push(geometry);
      mesh = new THREE.Mesh(geometry, materialFor(record));
    } else {
      const radius = ['aerodrome', 'heliport', 'harbour', 'marina', 'port'].includes(record.type) ? 4.5 : 2.2;
      const geometry = new THREE.CylinderGeometry(radius, radius, .12, 20);
      geometries.push(geometry);
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
  return Object.freeze({
    group,
    dispose() {
      group.removeFromParent?.();
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
    }
  });
}

export { createTransportFacilityVisuals };
