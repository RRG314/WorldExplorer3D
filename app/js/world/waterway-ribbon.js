import { ctx as appCtx } from "../shared-context.js?v=55";
import { clampNumber } from "./budgets.js?v=8";
import { resolveWaterSurfaceVisualProfile } from "./load-geometry.js?v=19";
import { registerWaterWaveMaterial } from "./render-support.js?v=6";
import { decimatePoints } from "./world-geometry.js?v=2";
import { inferWaterRenderContext } from "../water-dynamics.js?v=4";
import { classifyStructureSemantics } from "../structure-semantics.js?v=21";
import { normalizeWaterBody } from './water-body-contract.js?v=2';

function waterwayWidthFromTags(tags) {
  const explicit = Number.parseFloat(tags?.width);
  if (Number.isFinite(explicit) && explicit > 1) return Math.min(240, explicit);
  const kind = (tags?.kind || tags?.waterway || '').toString();
  if (kind.includes('ocean') || kind.includes('coast')) return 220;
  if (kind.includes('river')) return 18;
  if (kind.includes('canal')) return 12;
  if (kind.includes('drain')) return 4;
  if (kind.includes('ditch')) return 3;
  if (kind.includes('stream')) return 6;
  return 8;
}

function waterwayIsNavigable(tags = {}) {
  const explicitWidth = Number.parseFloat(tags.width);
  if (Number.isFinite(explicitWidth) && explicitWidth >= 12) return true;
  return ['boat', 'motorboat', 'ship'].some((key) => {
    const value = String(tags[key] || '').toLowerCase();
    return value === 'yes' || value === 'designated' || value === 'permissive';
  });
}

export function addWaterwayRibbon(pts, tags) {
  if (!pts || pts.length < 2) return;
  const centerline = decimatePoints(pts, 1000, false);
  if (centerline.length < 2) return;

  const width = waterwayWidthFromTags(tags);
  const structureSemantics = classifyStructureSemantics(tags, { featureKind: 'waterway' });
  const surfaceVisible = structureSemantics.terrainMode !== 'subgrade';
  const navigable = surfaceVisible && waterwayIsNavigable(tags);
  if (!surfaceVisible) {
    appCtx.waterways.push(normalizeWaterBody({
      shape: 'waterway',
      type: tags?.kind || tags?.waterway || 'waterway',
      width,
      surfaceY: null,
      pts: centerline,
      navigable: false,
      structureSemantics,
      kindHint: tags?.kind || tags?.waterway,
      geometrySource: tags?._geometrySource || 'osm-overpass',
      datumMethod: 'subgrade-hidden'
    }));
    return;
  }
  const waterVisualProfile = resolveWaterSurfaceVisualProfile();
  const halfWidth = width * 0.5;
  const verticalBias = 0.14 + (structureSemantics.terrainMode === 'elevated' ? structureSemantics.deckClearance : 0);
  const heightAt = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
  const verts = [];
  const indices = [];
  const surfaceProfile = [];

  for (let i = 0; i < centerline.length; i++) {
    const point = centerline[i];
    let dx;
    let dz;

    if (i === 0) {
      dx = centerline[1].x - point.x;
      dz = centerline[1].z - point.z;
    } else if (i === centerline.length - 1) {
      dx = point.x - centerline[i - 1].x;
      dz = point.z - centerline[i - 1].z;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dz = centerline[i + 1].z - centerline[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const leftX = point.x + nx * halfWidth;
    const leftZ = point.z + nz * halfWidth;
    const rightX = point.x - nx * halfWidth;
    const rightZ = point.z - nz * halfWidth;
    let surfaceY = heightAt(point.x, point.z) + verticalBias;
    const previous = surfaceProfile[i - 1];
    if (!Number.isFinite(surfaceY)) surfaceY = Number(previous?.y) || verticalBias;
    if (previous) {
      const segmentLength = Math.hypot(point.x - previous.x, point.z - previous.z);
      const maxDelta = Math.max(0.35, Math.min(6, segmentLength * 0.08));
      surfaceY = Math.max(previous.y - maxDelta, Math.min(previous.y + maxDelta, surfaceY));
    }
    surfaceProfile.push({ x: point.x, z: point.z, y: surfaceY });

    verts.push(leftX, surfaceY, leftZ);
    verts.push(rightX, surfaceY, rightZ);

    if (i < centerline.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }

  if (verts.length < 12 || indices.length < 6) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: waterVisualProfile.color,
    emissive: waterVisualProfile.mode === 'ice' ? 0x8fa6bd : 0x0d2b4f,
    emissiveIntensity: waterVisualProfile.mode === 'ice' ? 0.08 : 0.14,
    roughness: waterVisualProfile.mode === 'ice' ? 0.82 : 0.38,
    metalness: 0.02,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });

  registerWaterWaveMaterial(material, {
    waveScale: clampNumber(width / 42, 0.55, 1.1, 0.7),
    waveBase: clampNumber(width / 60, 0.4, 0.85, 0.55),
    width,
    waterKind: inferWaterRenderContext({ width })
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;
  mesh.userData.isWaterwayLine = true;
  mesh.userData.alwaysVisible = true;
  mesh.userData.waterwayCenterline = centerline;
  mesh.userData.waterwayWidth = width;
  mesh.userData.waterwayBias = verticalBias;
  mesh.userData.surfaceVariant = waterVisualProfile.mode;
  mesh.userData.structureSemantics = structureSemantics;
  mesh.visible = true;
  appCtx.scene.add(mesh);
  appCtx.landuseMeshes.push(mesh);
  appCtx.waterways.push(normalizeWaterBody({
    shape: 'waterway',
    type: tags?.kind || tags?.waterway || 'waterway',
    width,
    surfaceY: null,
    surfaceProfile,
    pts: centerline,
    navigable,
    structureSemantics,
    kindHint: tags?.kind || tags?.waterway,
    geometrySource: tags?._geometrySource || 'osm-overpass',
    datumMethod: 'terrain-profile'
  }));
}
