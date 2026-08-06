function assert(value, message) {
  if (!value) throw new Error(message);
}

export function assertWorldMatrixLocation(spec, result) {
  assert(result.worldLoading === false, `${spec.id}: worldLoading stayed true`);
  assert(result.worldLoad?.status === 'ready', `${spec.id}: requested world load did not reach ready`);
  assert(
    Number(result.worldLoad?.sequence) === Number(result.worldLoad?.publicationSequence),
    `${spec.id}: requested world load and published world sequences diverged`
  );
  assert(!result.terrainProfiles?.urban, `${spec.id}: base terrain still resolved to urban pavement ${JSON.stringify(result.terrainProfiles.urban)}`);
  if (spec.kind === 'preset') assert(result.counts.roads > 0, `${spec.id}: preset silently finalized without mapped roads`);
  if (spec.expectedTerrainMode) {
    const acceptableTerrainModes = spec.acceptableTerrainModes || [spec.expectedTerrainMode];
    assert(acceptableTerrainModes.some((mode) => result.terrainProfiles?.[mode]?.count > 0), `${spec.id}: expected ${acceptableTerrainModes.join(' or ')} terrain ${JSON.stringify(result.terrainProfiles)}`);
    const allowedStartModes = new Set(spec.acceptableStartTerrainModes || [spec.expectedTerrainMode]);
    assert(allowedStartModes.has(result.terrainProfileSamples?.[0]?.mode), `${spec.id}: player started on ${result.terrainProfileSamples?.[0]?.mode || 'unknown'} terrain`);
  }
  if (spec.expectedRoadStructure) {
    assert(result.structurePresentation?.roads?.[spec.expectedRoadStructure] > 0, `${spec.id}: expected mapped ${spec.expectedRoadStructure} roads ${JSON.stringify(result.structurePresentation?.roads)}`);
    const probe = result.customStructureProbe;
    assert(probe?.kind === spec.expectedRoadStructure, `${spec.id}: mapped ${spec.expectedRoadStructure} probe was not created ${JSON.stringify(probe)}`);
    assert(probe?.applied, `${spec.id}: gameplay actor was not placed on the mapped ${spec.expectedRoadStructure}`);
    assert(probe?.nearestKind === spec.expectedRoadStructure, `${spec.id}: structure probe resolved to the wrong traversal surface ${JSON.stringify(probe)}`);
    assert(Number.isFinite(probe?.surfaceY) && Number.isFinite(probe?.renderedY), `${spec.id}: structure probe has no rendered surface ${JSON.stringify(probe)}`);
    assert(probe.renderedDelta <= 2.5, `${spec.id}: mapped and rendered ${spec.expectedRoadStructure} surfaces diverged ${JSON.stringify(probe)}`);
    if (Number.isFinite(spec.minimumStructureClearance)) {
      const terrainY = Number(result.landPresentation?.terrainY);
      assert(
        Number.isFinite(terrainY) && probe.surfaceY - terrainY >= spec.minimumStructureClearance,
        `${spec.id}: mapped ${spec.expectedRoadStructure} fell below its required terrain clearance ` +
        `${JSON.stringify({ surfaceY: probe.surfaceY, terrainY, required: spec.minimumStructureClearance })}`
      );
    }
  }
  if (Number.isFinite(spec.expectedStackedRoadClearance)) {
    const crossings = result.stackedRoadCrossings || {};
    assert(
      Number(crossings.count || 0) > 0,
      `${spec.id}: no mapped differently layered road crossing was measured ${JSON.stringify(crossings)}`
    );
    assert(
      Number(crossings.minimumSeparation) >= Number(spec.expectedStackedRoadClearance),
      `${spec.id}: stacked road decks lack vehicle clearance ${JSON.stringify({
        measured: crossings.minimumSeparation,
        required: spec.expectedStackedRoadClearance,
        worst: crossings.worst
      })}`
    );
  }
  const trappedElevatedTerminals = (result.elevatedTerminalEndpoints || []).filter((endpoint) =>
    endpoint?.terminalBarrierPresent === true
  );
  assert(
    trappedElevatedTerminals.length === 0,
    `${spec.id}: a bridge or elevated road has a travel-blocking terminal barrier ` +
    `${JSON.stringify(trappedElevatedTerminals.slice(0, 4))}`
  );
  if (spec.minimumWaterAreas) assert(result.counts.waterAreas >= spec.minimumWaterAreas, `${spec.id}: expected mapped water areas`);
  if (spec.minimumBuildings) {
    assert(
      result.counts.buildings >= spec.minimumBuildings,
      `${spec.id}: expected at least ${spec.minimumBuildings} rendered buildings ` +
      `${JSON.stringify({ buildings: result.counts.buildings, detail: result.buildingDetail })}`
    );
  }
  const architecturalBuildings = Number(result.buildingDimensions?.architecturalCount || 0);
  if (architecturalBuildings > 0) {
    const dimensions = result.buildingDimensions || {};
    const buildingSource = String(result.buildingDetail?.source || '');
    const authoritativeBuildingSource =
      buildingSource === 'overture-buildings-pmtiles' ||
      buildingSource === 'shortbread-vector-buildings';
    assert(
      authoritativeBuildingSource,
      `${spec.id}: buildings did not use an authoritative mapped massing source ${JSON.stringify(result.buildingDetail)}`
    );
    const overtureBuildings = Number(dimensions.geometrySources?.overture || 0);
    const streamedMappedBuildings = Number(dimensions.geometrySources?.['shortbread-vector'] || 0);
    const inferredFootprints = Number(dimensions.geometrySources?.inferred_road_frontage || 0);
    if (inferredFootprints > 0) {
      assert(spec.kind === 'custom', `${spec.id}: inferred footprints appeared outside a custom location`);
      assert(inferredFootprints <= 72, `${spec.id}: inferred footprint coverage exceeded its bounded cap`);
      assert(
        Object.keys(dimensions.inferenceBases || {}).every((basis) =>
          basis === 'mapped_developed_landuse_and_road_frontage' || basis === 'mapped_residential_road_frontage'
        ),
        `${spec.id}: inferred footprints lack approved development evidence ${JSON.stringify(dimensions.inferenceBases)}`
      );
      assert(
        Number(result.buildingDetail?.inferredCoverage?.added || 0) >= inferredFootprints,
        `${spec.id}: inferred footprint diagnostics lost source provenance ${JSON.stringify(result.buildingDetail)}`
      );
    }
    assert(
      overtureBuildings > 0 || streamedMappedBuildings > 0 || inferredFootprints > 0,
      `${spec.id}: rendered buildings lost authoritative or explicit inferred provenance ${JSON.stringify(dimensions)}`
    );
    assert(
      architecturalBuildings > 0 &&
        (overtureBuildings + streamedMappedBuildings + inferredFootprints) / architecturalBuildings >= 0.9,
      `${spec.id}: more than 10% of rendered buildings bypassed global or explicit inferred provenance ${JSON.stringify(dimensions.geometrySources)}`
    );
    const sourceDetails = result.buildingDetail?.sourceDetails || {};
    const coverageIsWideEnough = buildingSource === 'shortbread-vector-buildings'
      ? Number(sourceDetails.loaded || 0) >= 4 && Number(sourceDetails.zoom || 0) >= 14
      : Number(sourceDetails.radiusDegrees || 0) >= 0.0135;
    assert(coverageIsWideEnough, `${spec.id}: building coverage is smaller than the visible-world contract ${JSON.stringify(sourceDetails)}`);
    assert(Number(dimensions.minHeight) >= 0.2, `${spec.id}: building height fell below the usable minimum ${JSON.stringify(dimensions)}`);
    assert(
      Number(dimensions.maxHeightBySource?.fallback || 0) <= 80,
      `${spec.id}: inferred building height exceeded its safety limit ${JSON.stringify(dimensions)}`
    );
    assert(
      Number(dimensions.maxHeightBySource?.levels || 0) <= 1000 &&
      Number(dimensions.maxHeightBySource?.explicit_height || 0) <= 1000 &&
      Number(dimensions.maxHeightBySource?.fallback_part || 0) <= 1000 &&
      Number(dimensions.maxHeight) <= 1000,
      `${spec.id}: authoritative building height exceeded the global safety limit ${JSON.stringify(dimensions)}`
    );

    if (Number(dimensions.inferredCount) >= 30) {
      const inferredSpan = Number(dimensions.inferredMaxHeight) - Number(dimensions.inferredMinHeight);
      const inferredBuckets = Object.keys(dimensions.inferredHeightBuckets || {}).length;
      assert(inferredSpan >= 2.5, `${spec.id}: inferred building heights collapsed into a uniform slab ${JSON.stringify(dimensions)}`);
      assert(inferredBuckets >= 6, `${spec.id}: inferred building heights lack neighborhood-scale variation ${JSON.stringify(dimensions)}`);
    }
    if (spec.minimumAuthoritativeBuildingParts) {
      if (buildingSource === 'overture-buildings-pmtiles') {
        assert(
          Number(dimensions.buildingParts || 0) >= spec.minimumAuthoritativeBuildingParts,
          `${spec.id}: expected at least ${spec.minimumAuthoritativeBuildingParts} authoritative building parts ${JSON.stringify(dimensions)}`
        );
      } else {
        assert(
          Number(dimensions.metadataMatched || 0) > 0 && Number(sourceDetails.loaded || 0) >= 4,
          `${spec.id}: mapped building fallback lost its metadata enrichment or visible coverage ${JSON.stringify({ dimensions, sourceDetails })}`
        );
      }
    }
    if (result.counts.buildings >= 1000) {
      assert(
        Number(dimensions.maxCenterDistance || 0) >= 1200 && Number(dimensions.outerRingCount || 0) >= 20,
        `${spec.id}: dense-city buildings stop before the visible outer ring ${JSON.stringify({ maxCenterDistance: dimensions.maxCenterDistance, outerRingCount: dimensions.outerRingCount })}`
      );
    }

    const presentation = result.buildingPresentation || {};
    const visibleSources = Number(presentation.visibleSourceCount || 0);
    if (visibleSources >= 30) {
      const exteriorOwnerRatio = Number(presentation.visibleExteriorOwnedSourceCount || 0) / visibleSources;
      const provenanceRatio = Number(presentation.visibleProvenanceClaimedSourceCount || 0) / visibleSources;
      const visibleBodySources = visibleSources - Number(presentation.visibleRoofSourceCount || 0);
      assert(exteriorOwnerRatio === 1, `${spec.id}: visible buildings escaped the exterior material owner ${JSON.stringify(presentation)}`);
      assert(provenanceRatio === 1, `${spec.id}: visible building material claim lacks mapped or neutral provenance ${JSON.stringify(presentation)}`);
      assert(
        Number(presentation.visibleFacadeAtlasSourceCount || 0) === visibleBodySources,
        `${spec.id}: a visible building body lacks its shared facade atlas ${JSON.stringify(presentation)}`
      );
      assert(
        Number(presentation.visibleWallFacadeSourceCount || 0) === 0,
        `${spec.id}: deleted legacy wall-facade shader returned ${JSON.stringify(presentation)}`
      );
    }
  }
  if (spec.expectedLandmarkKind) {
    assert(
      result.landmarkPresentation?.[spec.expectedLandmarkKind]?.visibleMeshes > 0,
      `${spec.id}: expected mapped ${spec.expectedLandmarkKind} landmark ` +
      `${JSON.stringify({ landmarks: result.landmarkPresentation, diagnostics: result.loadDiagnostics?.landmarks })}`
    );
  }

  const hasMappedWorld = result.counts.roads > 0 || result.counts.buildings > 0 || result.counts.landuses > 0;
  const hasTerrainFallback = result.counts.terrainTilesLoaded > 0;
  if (result.expectedStart === 'water') {
    assert(result.boatActive && result.initialSpawn?.mode === 'boat', `${spec.id}: water start did not enter boat mode ${JSON.stringify(result.initialSpawn)}`);
    assert(result.boatPresentation?.meshVisible, `${spec.id}: boat mesh is not visible`);
    assert(result.boatPresentation?.cameraMode === 0, `${spec.id}: boat did not start in chase camera mode`);
    assert(result.boatPresentation?.cameraDistance >= 8 && result.boatPresentation?.cameraDistance <= 30, `${spec.id}: boat camera is outside the usable chase range ${JSON.stringify(result.boatPresentation)}`);
    const surface = result.boatPresentation?.surfaceEnvelope || {};
    assert(
      Number.isFinite(surface.baseY) && Math.abs(surface.baseY - result.boatPresentation.waterPatchY) <= 0.15,
      `${spec.id}: rendered water patch diverged from the water datum ${JSON.stringify(result.boatPresentation)}`
    );
    assert(
      Number.isFinite(surface.averageY) && Number.isFinite(surface.maximumY) && surface.maximumY >= surface.averageY,
      `${spec.id}: dynamic water envelope is invalid ${JSON.stringify(result.boatPresentation)}`
    );
    assert(
      Number.isFinite(surface.resolvedBoatY) && Math.abs(surface.resolvedBoatY - result.boatPresentation.boatY) <= 0.15,
      `${spec.id}: boat pose diverged from the resolved buoyancy surface ${JSON.stringify(result.boatPresentation)}`
    );
    assert(
      result.boatPresentation.boatY >= surface.averageY + Math.max(0.2, Number(surface.hullDraft || 0) * 0.3),
      `${spec.id}: boat hull is submerged below the dynamic water surface ${JSON.stringify(result.boatPresentation)}`
    );
    assert(result.boatPresentation.maxWaterGeometryYSpan <= 0.25, `${spec.id}: area water is still draped over terrain ${JSON.stringify(result.boatPresentation)}`);
    if (spec.expectedWaterKind) {
      assert(result.boatPresentation.waterKind === spec.expectedWaterKind, `${spec.id}: expected ${spec.expectedWaterKind} water, received ${result.boatPresentation.waterKind}`);
    }
    if (Array.isArray(spec.expectedWaterElevationRange)) {
      const [minimumY, maximumY] = spec.expectedWaterElevationRange;
      assert(
        result.boatPresentation.waterPatchY >= minimumY && result.boatPresentation.waterPatchY <= maximumY,
        `${spec.id}: rendered water elevation is outside the expected range ${JSON.stringify({ expected: spec.expectedWaterElevationRange, presentation: result.boatPresentation })}`
      );
    }
    if (result.boatPresentation?.waterKind === 'open_ocean') {
      assert(Math.abs(result.boatPresentation.boatY) <= 12 && Math.abs(result.boatPresentation.waterPatchY) <= 12, `${spec.id}: open-ocean surface used seabed elevation ${JSON.stringify(result.boatPresentation)}`);
    }
    return;
  }

  assert(hasMappedWorld || hasTerrainFallback, `${spec.id}: no mapped world or terrain fallback loaded`);
  assert(result.boatActive !== true, `${spec.id}: land launch was incorrectly captured by nearby water`);
  assert(result.initialSpawn?.mode !== 'boat', `${spec.id}: land launch incorrectly selected boat mode ${JSON.stringify(result.initialSpawn)}`);
  assert(result.driveSpawn?.valid !== false, `${spec.id}: invalid drive spawn ${JSON.stringify(result.driveSpawn)}`);
  assert(result.walkSpawn?.valid !== false, `${spec.id}: invalid walk spawn ${JSON.stringify(result.walkSpawn)}`);
  assert(
    result.spawnOccupancy?.actorCollision !== true &&
      result.spawnOccupancy?.actorInsideBuilding !== true,
    `${spec.id}: actor spawned inside published building collision ${JSON.stringify(result.spawnOccupancy)}`
  );
  assert(
    result.spawnOccupancy?.cameraInsideBuilding !== true,
    `${spec.id}: chase camera spawned inside published building collision ${JSON.stringify(result.spawnOccupancy)}`
  );
  if (spec.expectedRoadStructure) {
    const gameplay = result.structureGameplay;
    assert(gameplay?.evidence?.kind === 'synthetic-direct-state', `${spec.id}: structure simulation evidence kind is missing ${JSON.stringify(gameplay)}`);
    assert(gameplay?.evidence?.releaseEligible === false, `${spec.id}: direct-state structure simulation was mislabeled as release evidence`);
    assert(gameplay?.frames >= 480, `${spec.id}: structure simulation was only a short segment ${JSON.stringify(gameplay)}`);
    assert(gameplay?.simulatedSeconds >= 8, `${spec.id}: structure simulation duration is insufficient ${JSON.stringify(gameplay)}`);
    assert(gameplay?.moved >= 40, `${spec.id}: simulated vehicle did not traverse the structure ${JSON.stringify(gameplay)}`);
    assert(gameplay?.onExpectedLayerPct >= 95, `${spec.id}: simulated vehicle changed grade-separated layers ${JSON.stringify(gameplay)}`);
    assert(gameplay?.maximumVerticalError <= 0.8, `${spec.id}: simulated vehicle clipped or floated from compiled surface ${JSON.stringify(gameplay)}`);
    assert(
      gameplay?.maximumLateralError <= Math.max(3, Number(result.landPresentation?.nearestRoad?.width || 0) * 0.5 + 1),
      `${spec.id}: vehicle left the compiled transport ribbon ${JSON.stringify(gameplay)}`
    );
  }
  if (result.counts.roads > 0) {
    if (Number(result.traversalDiagnostics?.driveEligible || 0) > 0) {
      assert(result.traversal.driveSegments > 0, `${spec.id}: drive traversal graph missing`);
    }
    if (Number(result.traversalDiagnostics?.walkEligible || 0) > 0) {
      assert(result.traversal.walkSegments > 0, `${spec.id}: walk traversal graph missing`);
    }
    const road = result.landPresentation?.nearestRoad;
    const exactRenderedRoadY = result.landPresentation?.exactRenderedRoadY;
    const renderedRoadY = result.landPresentation?.renderedRoadY;
    const carFeetY = Number(result.landPresentation?.carY) - 1.2;
    const roadSurfaceY = Number(road?.surfaceY);
    if (road && road.distance <= Math.max(2.5, road.width * 0.5 + 0.6) && Number.isFinite(roadSurfaceY)) {
      assert(
        Math.abs(carFeetY - roadSurfaceY) <= 2.5,
        `${spec.id}: playable car surface diverged from mapped road profile ` +
        `${JSON.stringify({ carFeetY, roadSurfaceY, road })}`
      );
      if (Number.isFinite(renderedRoadY)) {
        assert(
          Math.abs(roadSurfaceY - renderedRoadY) <= 2.5,
          `${spec.id}: rendered road diverged from its mapped surface profile ` +
          `${JSON.stringify({ renderedRoadY, roadSurfaceY, road })}`
        );
      }
      if (
        Number.isFinite(exactRenderedRoadY) &&
        Math.abs(exactRenderedRoadY - roadSurfaceY) <= 2.5
      ) {
        assert(
          Math.abs(carFeetY - exactRenderedRoadY) <= 2.5,
          `${spec.id}: playable car surface diverged from raw rendered road geometry ` +
          `${JSON.stringify({ carFeetY, exactRenderedRoadY, road })}`
        );
      }
      if (road.terrainMode === 'at_grade') {
        const terrainMeshY = Number(result.landPresentation?.terrainMeshY);
        if (Number.isFinite(terrainMeshY)) {
          const profileTerrainDelta = roadSurfaceY - terrainMeshY;
          const retainingSkirtDepth = Number(road.retainingSkirtDepth);
          const supportedEngineeredFill =
            profileTerrainDelta > 2.5 &&
            Number.isFinite(retainingSkirtDepth) &&
            retainingSkirtDepth >= profileTerrainDelta + 0.4;
          assert(
            Math.abs(profileTerrainDelta) <= 2.5 || supportedEngineeredFill,
            `${spec.id}: at-grade road profile detached from current terrain ` +
            `${JSON.stringify({ roadSurfaceY, terrainMeshY, profileTerrainDelta, supportedEngineeredFill, road })}`
          );
          if (Number.isFinite(exactRenderedRoadY)) {
            const renderedTerrainDelta = exactRenderedRoadY - terrainMeshY;
            assert(
              Math.abs(renderedTerrainDelta) <= 2.5 ||
                (
                  renderedTerrainDelta > 2.5 &&
                  Number.isFinite(retainingSkirtDepth) &&
                  retainingSkirtDepth >= renderedTerrainDelta + 0.4
                ),
              `${spec.id}: rendered at-grade road detached from current terrain ` +
              `${JSON.stringify({ exactRenderedRoadY, terrainMeshY, renderedTerrainDelta, road })}`
            );
          }
        }
      }
    }
  }
}
