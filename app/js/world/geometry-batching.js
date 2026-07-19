import { ctx as appCtx } from "../shared-context.js?v=55";

export function geometryHasFinitePositions(geometry) {
  const arr = geometry?.attributes?.position?.array;
  if (!arr || !Number.isFinite(arr.length)) return false;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) return false;
  }
  return true;
}

export function materialBatchKey(material) {
  if (!material || Array.isArray(material)) return null;
  if (material.userData?.buildingBatchKey) {
    return String(material.userData.buildingBatchKey);
  }
  const colorHex = material.color ? material.color.getHexString() : '';
  const emissiveHex = material.emissive ? material.emissive.getHexString() : '';
  const mapId = material.map ? material.map.uuid : '-';
  const normalId = material.normalMap ? material.normalMap.uuid : '-';
  const roughnessId = material.roughnessMap ? material.roughnessMap.uuid : '-';
  return [
    material.type || '',
    mapId,
    normalId,
    roughnessId,
    colorHex,
    emissiveHex,
    Number(material.emissiveIntensity || 0).toFixed(3),
    Number(material.roughness || 0).toFixed(3),
    Number(material.metalness || 0).toFixed(3),
    material.transparent ? 1 : 0,
    Number(material.opacity ?? 1).toFixed(3),
    material.side ?? 0,
    material.depthWrite ? 1 : 0,
    material.depthTest ? 1 : 0,
    material.polygonOffset ? 1 : 0,
    Number(material.polygonOffsetFactor || 0).toFixed(3),
    Number(material.polygonOffsetUnits || 0).toFixed(3)
  ].join('|');
}

export function appendGeometryWithTransform(batch, geometry, matrix) {
  if (!geometry?.attributes?.position) return 0;

  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  const baseVertex = batch.positions.length / 3;
  const startPos = batch.positions.length;
  const startNormals = batch.normals.length;
  const startUvs = batch.uvs.length;
  const startIdx = batch.indices.length;

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  const rollback = () => {
    batch.positions.length = startPos;
    batch.normals.length = startNormals;
    batch.uvs.length = startUvs;
    batch.indices.length = startIdx;
  };

  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
      rollback();
      return -1;
    }
    batch.positions.push(v.x, v.y, v.z);

    if (normAttr) {
      n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
      if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) {
        batch.normals.push(n.x, n.y, n.z);
      } else {
        batch.normals.push(0, 1, 0);
      }
    } else {
      batch.normals.push(0, 1, 0);
    }

    if (uvAttr) {
      const u = uvAttr.getX(i);
      const vUv = uvAttr.getY(i);
      batch.uvs.push(Number.isFinite(u) ? u : 0, Number.isFinite(vUv) ? vUv : 0);
    } else {
      batch.uvs.push(0, 0);
    }
  }

  if (geometry.index) {
    const indexArr = geometry.index.array;
    for (let i = 0; i < indexArr.length; i++) {
      const idx = Number(indexArr[i]);
      if (!Number.isFinite(idx) || idx < 0 || idx >= posAttr.count) {
        rollback();
        return -1;
      }
      batch.indices.push(idx + baseVertex);
    }
  } else {
    for (let i = 0; i < posAttr.count; i++) {
      batch.indices.push(baseVertex + i);
    }
  }

  return posAttr.count;
}

export function buildMergedGeometry(batch) {
  if (!batch.positions.length || !batch.indices.length) return null;
  if (batch.positions.length % 3 !== 0 || batch.normals.length % 3 !== 0 || batch.uvs.length % 2 !== 0) return null;
  if (batch.normals.length !== batch.positions.length) return null;
  if (batch.uvs.length !== batch.positions.length / 3 * 2) return null;

  for (let i = 0; i < batch.positions.length; i++) {
    if (!Number.isFinite(batch.positions[i])) return null;
  }
  for (let i = 0; i < batch.normals.length; i++) {
    if (!Number.isFinite(batch.normals[i])) return null;
  }
  for (let i = 0; i < batch.uvs.length; i++) {
    if (!Number.isFinite(batch.uvs[i])) return null;
  }
  const vertexCount = batch.positions.length / 3;
  for (let i = 0; i < batch.indices.length; i++) {
    const idx = batch.indices[i];
    if (!Number.isFinite(idx) || idx < 0 || idx >= vertexCount) return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));

  const indexArray = vertexCount > 65535 ? new Uint32Array(batch.indices) : new Uint16Array(batch.indices);
  geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function meanFootprintCenter(footprint, fallbackX = 0, fallbackZ = 0) {
  if (!Array.isArray(footprint) || footprint.length === 0) {
    return { x: fallbackX, z: fallbackZ };
  }
  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < footprint.length; i++) {
    sumX += footprint[i].x;
    sumZ += footprint[i].z;
  }
  return {
    x: sumX / footprint.length,
    z: sumZ / footprint.length
  };
}

export function boundingSphereCenter(mesh, fallbackX = 0, fallbackZ = 0) {
  if (!mesh?.geometry) return { x: fallbackX, z: fallbackZ };
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const bs = mesh.geometry.boundingSphere;
  if (!bs) return { x: fallbackX, z: fallbackZ };
  return {
    x: bs.center.x + fallbackX,
    z: bs.center.z + fallbackZ
  };
}

export function disposeSceneMesh(mesh) {
  if (!mesh) return;
  mesh.parent?.remove?.(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
}
