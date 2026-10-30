import {createHeightCache} from './height-cache.js';
import {terrainGridInterval,sampleIndexedTerrainCell} from './world-grid.js';
import {REVIEWED_CORRIDOR_SUPPORT_METERS,hasReviewedPavementBoundary} from './reviewed-corridor-policy.js';
import {BANKED_ROAD_MODEL} from '../physics/road-plane-dynamics.js';
import {roadPavementSectionForSegment} from '../world/road-pavement-sections.js';
import {projectRoadPavementPoint} from '../world/road-pavement-coordinate-frame.js';
import { streetSideEdge } from '../world/compiler/street-frontage-policy.js';
import {
  projectPointToFeature,
  sampleFeatureSurfaceY
} from "../structure-semantics.js?v=63";
import { roadWidthAtProjection } from '../world/road-cross-section-profile.js?v=1';
import { terrainHeightWithPortalCuts } from './structure-terrain-portals.js?v=2';

const MAX_HEIGHT_CACHE_ENTRIES = 65536;

// Compiler support only. Continue the accepted road plane across the native
// cell supporting its edge; clamping to the road width would flatten the bank.
// The source path, physical pavement footprint and live sampler stay unchanged.
function reviewedSupportPlane(feature,projected,x,z,surfaceY){
 const a=feature.pts[projected.segIndex],b=feature.pts[projected.segIndex+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
 if(!(length>1e-8))return surfaceY;
 const ox=x-projected.x,oz=z-projected.z,lateral=(ox*dz-oz*dx)/length,along=projected.pavementAlongResidual??((ox*dx+oz*dz)/length),half=feature.transportSurfaceModel.width/2;
 let center;
 if(!feature.transportSurfaceModel.pavementHeightDeltas&&Math.abs(lateral)>half){
  center=sampleFeatureSurfaceY(feature,projected.x,projected.z,projected);
  const side=Math.sign(lateral),edge=sampleFeatureSurfaceY(feature,projected.x+dz/length*half*side,projected.z-dx/length*half*side,projected);
  surfaceY+=(edge-center)/half*(Math.abs(lateral)-half);
 }
 if(projected.segIndex===0&&projected.t===0&&along<0||projected.segIndex===feature.pts.length-2&&projected.t===1&&along>0){
  center??=sampleFeatureSurfaceY(feature,projected.x,projected.z,projected);
  const dt=(projected.t===0?1:-1)*Math.min(.001,1/length),t=projected.t+dt,near={segIndex:projected.segIndex,t,x:a.x+dx*t,z:a.z+dz*t},height=sampleFeatureSurfaceY(feature,near.x,near.z,near);
  surfaceY+=(height-center)/(dt*length)*along;
 }
 if(!Number.isFinite(surfaceY))throw Error('reviewed_corridor_plane_unavailable');
 return surfaceY;
}

function reviewedBoundarySurface(feature,projected,x,z,terrainY,surfaceY,sampleNative){
 const a=feature.pts[projected.segIndex],b=feature.pts[projected.segIndex+1],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),half=feature.transportSurfaceModel.width/2;
 if(!(length>1e-8))return surfaceY;
 const lateral=projected.pavementLateral!==undefined?-projected.pavementLateral:((x-projected.x)*dz-(z-projected.z)*dx)/length;
 const section=roadPavementSectionForSegment(feature,projected.segIndex,projected.t),side=Math.sign(lateral),edgeDistance=section?(side>0?section.negative:section.positive):half;
 if(Math.abs(lateral)<=edgeDistance)return reviewedSupportPlane(feature,projected,x,z,surfaceY);
 const bx=projected.x-(projected.pavementFrameX??(-dz/length))*edgeDistance*side,bz=projected.z-(projected.pavementFrameZ??(dx/length))*edgeDistance*side,
  edge=sampleFeatureSurfaceY(feature,bx,bz,projected),native=sampleNative(bx,bz);
 if(!Number.isFinite(edge)||!Number.isFinite(native))throw Error('reviewed_terrain_boundary_ground_unavailable');
 // Beyond the physical edge retain the actual native bank/apron. Carry only
 // the boundary correction into its shoulder, rather than extrapolating a
 // steep road plane several metres above the native ground.
 return terrainY+edge-native;
}

// THREE.PlaneGeometry splits each grid cell along the bottom-left to
// top-right diagonal. Runtime ground queries must use those same two planes;
// bilinear interpolation describes a curved patch that the GPU never renders.
function interpolateRenderedTerrainCell(sx, sz, y00, y10, y01, y11) {
  const x = Math.max(0, Math.min(1, Number(sx) || 0));
  const z = Math.max(0, Math.min(1, Number(sz) || 0));
  if (x + z <= 1) {
    return y00 + (y10 - y00) * x + (y01 - y00) * z;
  }
  return (1 - x) * y01 + (1 - z) * y10 + (x + z - 1) * y11;
}

function createTerrainHeightSamplingApi(deps = {}) {
  const {
    appCtx,
    terrainTileDeps,
    elevationWorldYAtWorldXZ
  } = deps;

  const terrainHeightCache = createHeightCache(MAX_HEIGHT_CACHE_ENTRIES);
  const baseTerrainHeightCache = createHeightCache(MAX_HEIGHT_CACHE_ENTRIES);
  let terrainHeightCacheEnabled = true;

  function terrainMeshHeightAt(x, z, options = {}) {
    if (appCtx.worldLoadRuntimeState?.groundMode === 'polar-cryosphere-local') {
      const polarY = appCtx.samplePolarCryosphereWorldYAt?.(x, z);
      return Number.isFinite(polarY) ? polarY : elevationWorldYAtWorldXZ(x, z);
    }
    if (!appCtx.terrainGroup || appCtx.terrainGroup.children.length === 0) {
      return elevationWorldYAtWorldXZ(x, z);
    }

    const segs = appCtx.TERRAIN_SEGMENTS;
    const vps = segs + 1;

    for (let c = 0; c < appCtx.terrainGroup.children.length; c++) {
      const mesh = appCtx.terrainGroup.children[c];
      if (mesh?.visible === false || mesh?.userData?.pendingTerrainTile) {
        continue;
      }
      const info = mesh.userData?.terrainTile;
      if (!info) continue;

      const pos = mesh.geometry.attributes.position;
      if (!pos || pos.count < 4) continue;

      const lx = x - mesh.position.x;
      const lz = z - mesh.position.z;
      const x0 = pos.getX(0);
      const x1 = pos.getX(segs);
      const z0 = pos.getZ(0);
      const z1 = pos.getZ(segs * vps);

      if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

      const col = terrainGridInterval(pos.array,segs,3,0,lx);
      const row = terrainGridInterval(pos.array,segs,vps*3,2,lz);
      const refined=mesh.userData.reviewedTerrainCells?.get(row*vps+col);
      if(refined){
        const y=sampleIndexedTerrainCell(pos.array,refined,lx,lz);
        if(!Number.isFinite(y))throw Error('reviewed_terrain_cell_coverage');
        const height=y+mesh.position.y;
        return options.ignorePortalCuts?height:terrainHeightWithPortalCuts(mesh.userData.structureTerrainPortalDescriptors,x,z,height);
      }
      const sx = (lx-pos.getX(col))/(pos.getX(col+1)-pos.getX(col));
      const sz = (lz-pos.getZ(row*vps))/(pos.getZ((row+1)*vps)-pos.getZ(row*vps));

      const baseY = mesh.position.y;
      const y00 = pos.getY(row * vps + col) + baseY;
      const y10 = pos.getY(row * vps + col + 1) + baseY;
      const y01 = pos.getY((row + 1) * vps + col) + baseY;
      const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;
      const height = interpolateRenderedTerrainCell(sx, sz, y00, y10, y01, y11);
      if (options.ignorePortalCuts) return height;
      return terrainHeightWithPortalCuts(mesh.userData.structureTerrainPortalDescriptors, x, z, height);
    }

    // Outside the detailed tile ring the fixed-location LOD is the rendered
    // ground. Its coarser source and seam blend can differ from a direct z15
    // elevation lookup by several metres, so physics must consume that exact
    // triangle surface instead of letting vehicles pass underneath it.
    const farTerrainY = appCtx.sampleFarTerrainWorldYAt?.(x, z, options);
    return Number.isFinite(farTerrainY)
      ? Number(farTerrainY)
      : elevationWorldYAtWorldXZ(x, z, terrainTileDeps);
  }

  function baseTerrainHeightAt(x, z) {
    const authoritativeY = elevationWorldYAtWorldXZ(x, z);
    if (Number.isFinite(authoritativeY)) return authoritativeY;
    const meshY = terrainMeshHeightAt(x, z);
    if (Number.isFinite(meshY)) return meshY;
    return null;
  }

  function cachedBaseTerrainHeight(x, z) {
    const height = baseTerrainHeightCache.get(x,z);
    return height !== undefined ? height : baseTerrainHeightCache.set(x,z,baseTerrainHeightAt(x,z));
  }

  function applyStructureTerrainCuts(worldX, worldZ, terrainY) {
    if (!Array.isArray(appCtx.structureTerrainCuts) || appCtx.structureTerrainCuts.length === 0 || !Number.isFinite(terrainY)) {
      return terrainY;
    }

    let adjustedY = terrainY;
    const indexedFeatures = appCtx.structureTerrainCutIndex?.candidates?.(worldX, worldZ);
    const candidates = Array.isArray(indexedFeatures)
      ? indexedFeatures
      : appCtx.structureTerrainCuts;
    let strongestAtGradeWeight = 0;
    let atGradeWeightedY = 0;
    let atGradeWeightSum = 0;
    // Accumulate the two ownership classes separately. Terrain compilation
    // visits every grid vertex; allocating a sample object per nearby road
    // and filtering another array added garbage without changing the grade.
    let ownedWeight = 0, ownedY = 0, ownedStrongest = 0, ownedCount = 0;
    let reviewedWeight = 0, reviewedY = 0, reviewedStrongest = 0;
    for (let i = 0; i < candidates.length; i++) {
      const cut = candidates[i];
      const feature = cut?.feature || cut;
      if (!feature || !Array.isArray(feature.pts)) continue;
      const bounds = cut?.bounds || feature.bounds;
      if (cut?.feature && bounds && (
        worldX < bounds.minX || worldX > bounds.maxX ||
        worldZ < bounds.minZ || worldZ > bounds.maxZ
      )) continue;

      const nearest = appCtx.structureTerrainProjectionIndex
        ? appCtx.structureTerrainProjectionIndex.project(feature,worldX,worldZ)
        : projectPointToFeature(feature,worldX,worldZ);
      const projected=projectRoadPavementPoint(feature,worldX,worldZ,nearest);
      if (!projected) continue;
      const connectedEnds=feature.transportRecord?.crossSection?.pavementSections?.connectedEnds;
      if(connectedEnds&&feature.transportSurfaceModel?.reviewedSurfacePhase==='accepted'){
        // The privately bound continuation owns the other side of this
        // common transect. Extending an old end plane into the next bank
        // blended different transition angles across the real pavement.
        const along=projected.pavementAlongResidual;
        if(connectedEnds.start&&projected.segIndex===0&&projected.t===0&&along< -1e-7||
          connectedEnds.end&&projected.segIndex===feature.pts.length-2&&projected.t===1&&along>1e-7)continue;
      }

      if (feature?.structureSemantics?.terrainMode === 'at_grade') {
        const width = roadWidthAtProjection(feature, projected);
        const halfWidth = width * 0.5;
        const shoulderBlend = Math.max(3.5, Math.min(8, width * 0.65));
        const p1=feature.pts[projected.segIndex],p2=feature.pts[projected.segIndex+1];
        const dx=p2.x-p1.x,dz=p2.z-p1.z;
        const sign=((worldX-projected.x)*dz-(worldZ-projected.z)*dx)>=0 ? 1 : -1;
        const edge=streetSideEdge(feature,halfWidth,sign,projected.segIndex,projected.t);
        const frontage=appCtx.streetFrontageGrading;
        const gradedEdge=frontage && projected.dist<=edge ? edge : frontage?.influenceOuterDistance
          ? frontage.influenceOuterDistance(feature,projected,worldX,worldZ,halfWidth,shoulderBlend)
          : frontage?.outerDistance(feature,projected,worldX,worldZ,halfWidth) ?? halfWidth;
        if(gradedEdge===null)continue;
        const influenceRadius = gradedEdge + shoulderBlend;
        if (!Number.isFinite(projected.dist) || projected.dist > influenceRadius) continue;
        const model=feature.transportSurfaceModel,reviewed=model?.reviewedSurfacePhase==='accepted'&&model.surveyedSurface?.surfaceModel===BANKED_ROAD_MODEL;
        const boundary=reviewed&&hasReviewedPavementBoundary(feature),support=REVIEWED_CORRIDOR_SUPPORT_METERS/(Number(feature.metersPerWorldUnit)||1),fullGradeEdge=boundary?edge:reviewed?Math.min(influenceRadius-.001,Math.max(gradedEdge,edge+support)):gradedEdge;
        let surfaceY = sampleFeatureSurfaceY(feature, worldX, worldZ, projected);
        if (!Number.isFinite(surfaceY)) continue;
        if(boundary)surfaceY=reviewedBoundarySurface(feature,projected,worldX,worldZ,terrainY,surfaceY,(x,z)=>elevationWorldYAtWorldXZ?.(x,z,terrainTileDeps));
        else if(reviewed)surfaceY=reviewedSupportPlane(feature,projected,worldX,worldZ,surfaceY);
        const targetTerrainY = surfaceY - Math.max(0, Number(feature.surfaceBias) || 0.08);
        // A depressed engineered approach has an explicit excavation, floor
        // and retaining walls. Blending that floor into the coarse terrain
        // grid also depresses neighboring surface streets and wall tops.
        // Keep its cut with that owner; raised approaches still need fill.
        if (feature.transportSurfaceModel?.engineeredApproach === true && targetTerrainY < terrainY) continue;
        const shoulderT = Math.max(0, Math.min(1,
          (projected.dist - fullGradeEdge) / (influenceRadius-fullGradeEdge)
        ));
        const weight = projected.dist <= fullGradeEdge
          ? 1
          : 1 - (shoulderT * shoulderT * (3 - 2 * shoulderT));
        const edgeDistance=Math.max(0,projected.dist-edge);
        if (reviewed) {
          // The accepted cross-section owns the complete native cells under
          // its pavement. A generalized access-road profile must not pull an
          // outside support vertex away from that plane. Its original finite
          // shoulder weight returns continuously to ordinary grading below.
          const gradeWeight = edgeDistance === 0
            ? Math.max(1e-12, Math.max(0, edge-projected.dist)**2)
            : weight**4 / edgeDistance**2;
          reviewedY += targetTerrainY * gradeWeight;
          reviewedWeight += gradeWeight;
          reviewedStrongest = Math.max(reviewedStrongest, weight);
          continue;
        }
        if (edgeDistance === 0) {
          const gradeWeight = Math.max(1e-12, Math.max(0, edge-projected.dist)**2);
          ownedY += targetTerrainY * gradeWeight;
          ownedWeight += gradeWeight;
          ownedStrongest = Math.max(ownedStrongest, weight);
          ownedCount++;
        } else {
          const gradeWeight = weight**4 / edgeDistance**2;
          atGradeWeightedY += targetTerrainY * gradeWeight;
          atGradeWeightSum += gradeWeight;
          strongestAtGradeWeight = Math.max(strongestAtGradeWeight, weight);
        }
        continue;
      }
      const width = Math.max(4.5, Number(cut.width) || Number(feature.width) || 6);
      const influenceRadius = width * 0.82 + 3.4;
      if (!Number.isFinite(projected.dist) || projected.dist > influenceRadius) continue;

      const surfaceY = sampleFeatureSurfaceY(feature, worldX, worldZ, projected);
      if (!Number.isFinite(surfaceY)) continue;

      const clearance = Math.max(3.1, Number(cut.clearance) || 3.8);
      const targetY = surfaceY - clearance;
      if (!(targetY < adjustedY - 0.05)) continue;

      const lateralT = Math.max(0, Math.min(1, projected.dist / Math.max(0.5, influenceRadius)));
      let fade = 1 - (lateralT * lateralT * (3 - 2 * lateralT));
      const distances = feature?.transportSurfaceModel?.pathDistances || feature?.surfaceDistances;
      const points = feature?.pts;
      if (distances instanceof Float32Array && Array.isArray(points) && points.length >= 2) {
        const lastIndex = distances.length - 1;
        const p1 = points[projected.segIndex];
        const p2 = points[projected.segIndex + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const distanceAlong = (Number(distances[projected.segIndex]) || 0) + segLen * projected.t;
        const totalDistance = Number(distances[lastIndex]) || 0;
        const portalLength = Math.max(6, Number(cut.portalLength) || 0);
        if (portalLength > 0 && totalDistance > 0) {
          const portalDistance = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
          const portalT = Math.max(0, Math.min(1, portalDistance / portalLength));
          fade *= portalT * portalT * (3 - 2 * portalT);
        }
      }
      adjustedY = Math.min(adjustedY, adjustedY + (targetY - adjustedY) * fade);
    }

    // Carriageways own their elevation. A neighboring frontage/shoulder may
    // shape unowned ground but cannot vote on an occupied carriageway. Outside
    // the footprint inverse-distance weights approach that boundary value
    // continuously, rather than switching abruptly to the closest road.
    if (ownedCount) {
      atGradeWeightedY = ownedY;
      atGradeWeightSum = ownedWeight;
      strongestAtGradeWeight = ownedStrongest;
    }

    if (atGradeWeightSum > 0) {
      adjustedY = terrainY + (atGradeWeightedY / atGradeWeightSum - terrainY) * strongestAtGradeWeight;
    }
    if (reviewedWeight > 0) {
      adjustedY += (reviewedY / reviewedWeight - adjustedY) * reviewedStrongest;
    }

    return adjustedY;
  }

  function pointAlongPolyline(points = [], distance = 0) {
    if (!Array.isArray(points) || points.length === 0) return null;
    if (points.length === 1) return { x: points[0].x, z: points[0].z, tangentX: 1, tangentZ: 0 };
    let remaining = Math.max(0, Number(distance) || 0);
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen <= 1e-6) continue;
      if (remaining <= segLen) {
        const t = remaining / segLen;
        return {
          x: p1.x + dx * t,
          z: p1.z + dz * t,
          tangentX: dx / segLen,
          tangentZ: dz / segLen
        };
      }
      remaining -= segLen;
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const dx = last.x - prev.x;
    const dz = last.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      x: last.x,
      z: last.z,
      tangentX: dx / len,
      tangentZ: dz / len
    };
  }

  function polylineCurvatureMetric(points = []) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let totalTurn = 0;
    let samples = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      const ax = curr.x - prev.x;
      const az = curr.z - prev.z;
      const bx = next.x - curr.x;
      const bz = next.z - curr.z;
      const aLen = Math.hypot(ax, az);
      const bLen = Math.hypot(bx, bz);
      if (!(aLen > 1e-5) || !(bLen > 1e-5)) continue;
      const dot = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (aLen * bLen)));
      totalTurn += Math.acos(dot);
      samples += 1;
    }
    return samples > 0 ? totalTurn / samples : 0;
  }

  function cachedTerrainHeight(x, z) {
    if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);
    const height = terrainHeightCache.get(x,z);
    return height !== undefined ? height : terrainHeightCache.set(x,z,terrainMeshHeightAt(x,z));
  }

  function clearTerrainHeightCache() {
    terrainHeightCache.clear();
    baseTerrainHeightCache.clear();
  }

  function calculateCurvature(pts, i) {
    if (i === 0 || i >= pts.length - 1) return 0;

    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx1 = p1.x - p0.x;
    const dz1 = p1.z - p0.z;
    const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;
    const dx2 = p2.x - p1.x;
    const dz2 = p2.z - p1.z;
    const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
    const nx1 = dx1 / len1;
    const nz1 = dz1 / len1;
    const nx2 = dx2 / len2;
    const nz2 = dz2 / len2;
    const dot = nx1 * nx2 + nz1 * nz2;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const avgLen = (len1 + len2) / 2;
    return angle / (avgLen || 1);
  }

  function subdivideRoadPoints(pts, maxDist) {
    if (pts.length < 2) return pts;

    const result = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const dx = cur.x - prev.x;
      const dz = cur.z - prev.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const curvPrev = calculateCurvature(pts, i - 1);
      const curvCur = calculateCurvature(pts, i);
      const avgCurv = (curvPrev + curvCur) / 2;
      const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
      const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

      if (dist > adaptiveDist) {
        const steps = Math.ceil(dist / adaptiveDist);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
        }
      }
      result.push(cur);
    }

    return result;
  }

  return {
    applyStructureTerrainCuts,
    baseTerrainHeightAt,
    cachedBaseTerrainHeight,
    cachedTerrainHeight,
    clearTerrainHeightCache,
    heightSamplingCacheStats: () => ({terrainEntries:terrainHeightCache.size,baseEntries:baseTerrainHeightCache.size,maximumEntriesPerCache:MAX_HEIGHT_CACHE_ENTRIES}),
    pointAlongPolyline,
    polylineCurvatureMetric,
    subdivideRoadPoints,
    terrainMeshHeightAt
  };
}

export { createTerrainHeightSamplingApi, interpolateRenderedTerrainCell };
