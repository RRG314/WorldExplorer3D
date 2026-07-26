function assert(value, message) {
  if (!value) throw new Error(message);
}

export function assertWorldMatrixLocation(spec, result) {
  assert(result.worldLoading === false, `${spec.id}: worldLoading stayed true`);
  if (spec.kind === 'custom') {
    assert(
      String(result.customLocationLabel || '') === String(spec.label || ''),
      `${spec.id}: custom location identity changed during load ${JSON.stringify({ expected: spec.label, actual: result.customLocationLabel })}`
    );
  }
  assert(!result.terrainProfiles?.urban, `${spec.id}: base terrain still resolved to urban pavement ${JSON.stringify(result.terrainProfiles.urban)}`);
  if (spec.kind === 'preset') assert(result.counts.roads > 0, `${spec.id}: preset silently finalized without mapped roads`);
  if (
    result.expectedStart === 'land' &&
    Number(result.counts?.roads || 0) === 0 &&
    Number(result.traversal?.walkSegments || 0) > 0
  ) {
    assert(
      result.initialSpawn?.onWalkSurface === true &&
      result.initialSpawn?.source === 'walk_surface_search',
      `${spec.id}: sparse mapped world ignored its pedestrian network at spawn ${JSON.stringify(result.initialSpawn)}`
    );
    assert(
      Number(result.initialSpawn?.slopeDeg) <= 22,
      `${spec.id}: sparse mapped path spawn exceeded the walkable slope contract ${JSON.stringify(result.initialSpawn)}`
    );
    assert(
      Number(result.counts?.linearFeatures || 0) > 0 &&
      Number(result.counts?.linearFeatureMeshes || 0) > 0,
      `${spec.id}: sparse pedestrian network has no rendered path product ${JSON.stringify(result.counts)}`
    );
  }
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
    if (spec.expectedRoadStructure === 'bridge') {
      const guardrails = result.structurePresentation?.guardrails || {};
      assert(guardrails.protectedRoads > 0, `${spec.id}: mapped bridge registered no protected road guardrails ${JSON.stringify(guardrails)}`);
      assert(guardrails.colliders > 0, `${spec.id}: mapped bridge registered no guardrail collision barriers ${JSON.stringify(guardrails)}`);
      assert(guardrails.visualInstances > 0, `${spec.id}: mapped bridge rendered no guardrail instances ${JSON.stringify(guardrails)}`);
      assert(
        guardrails.visualInstances <= guardrails.colliders * 10,
        `${spec.id}: guardrail visuals exceeded the physical collider-density budget ${JSON.stringify(guardrails)}`
      );
    }
    if (spec.expectedRoadStructure === 'tunnel' && result.tunnelPortalTraversal) {
      const tunnelVisuals = result.structurePresentation?.tunnelVisuals || {};
      assert(tunnelVisuals.tunnelRoads > 0, `${spec.id}: no mapped tunnel roads were registered ${JSON.stringify(tunnelVisuals)}`);
      assert(tunnelVisuals.walls > 0 && tunnelVisuals.roofs > 0 && tunnelVisuals.floors > 0, `${spec.id}: tunnel shell is incomplete ${JSON.stringify(tunnelVisuals)}`);
      assert(tunnelVisuals.lights > 0 && tunnelVisuals.portals > 0, `${spec.id}: tunnel presentation is incomplete ${JSON.stringify(tunnelVisuals)}`);
      assert(
        tunnelVisuals.totalInstances <= tunnelVisuals.walls * 4,
        `${spec.id}: tunnel visual density exceeded the shell-derived budget ${JSON.stringify(tunnelVisuals)}`
      );
      const traversal = result.tunnelPortalTraversal;
      const checkpoints = traversal?.checkpoints || [];
      const interior = checkpoints.filter((checkpoint) => checkpoint?.terrainMode === 'subgrade');
      const interiorCore = interior.filter((checkpoint) => checkpoint?.stage !== 'entry');
      const entry = checkpoints.find((checkpoint) => checkpoint?.stage === 'entry');
      const exit = checkpoints.find((checkpoint) => checkpoint?.stage === 'exit');
      assert(checkpoints.length === 5, `${spec.id}: tunnel lifecycle did not produce all five checkpoints ${JSON.stringify(traversal)}`);
      assert(interior.length >= 4, `${spec.id}: tunnel lifecycle lost its subgrade road ${JSON.stringify(traversal)}`);
      assert(interiorCore.every((checkpoint) => checkpoint.applied && checkpoint.renderedDelta <= 0.2), `${spec.id}: tunnel road diverged during interior traversal ${JSON.stringify(traversal)}`);
      assert(entry?.applied && entry?.renderedDelta <= 0.5, `${spec.id}: tunnel portal transition diverged from its rendered surface ${JSON.stringify(traversal)}`);
      assert(interior.every((checkpoint) => checkpoint.cameraAboveRoad <= 1.75), `${spec.id}: tunnel camera crossed the shell ceiling ${JSON.stringify(traversal)}`);
      assert(interior.every((checkpoint) => checkpoint.visibleWaterMeshes === 0), `${spec.id}: water surface remained visible inside the tunnel ${JSON.stringify(traversal)}`);
      assert(interior.every((checkpoint) => !checkpoint.boatAvailable && !checkpoint.boatPromptVisible), `${spec.id}: boat travel was offered inside the tunnel ${JSON.stringify(traversal)}`);
      assert(
        Number(traversal?.movement?.distance || 0) >= 0.5 &&
        Number(traversal?.movement?.running?.speed || 0) >= 3,
        `${spec.id}: accelerator input did not produce sustained vehicle motion inside the tunnel ${JSON.stringify(traversal)}`
      );
      assert(traversal?.movement?.remainedInTunnel, `${spec.id}: vehicle detached from the tunnel during movement ${JSON.stringify(traversal)}`);
      assert(exit?.applied && exit?.terrainMode !== 'subgrade', `${spec.id}: no mapped at-grade tunnel exit was traversable ${JSON.stringify(traversal)}`);
      assert(Number.isFinite(exit?.terrainY), `${spec.id}: exterior terrain is missing at the tunnel exit ${JSON.stringify(traversal)}`);
      assert(exit?.renderedDelta <= 2.5, `${spec.id}: exit road diverged from its rendered surface ${JSON.stringify(traversal)}`);
      assert(exit?.cameraAboveRoad >= 2, `${spec.id}: camera remained tunnel-constrained after exit ${JSON.stringify(traversal)}`);
      if (exit?.waterMeshes > 0) {
        assert(exit.visibleWaterMeshes > 0, `${spec.id}: water visibility was not restored after tunnel exit ${JSON.stringify(traversal)}`);
      }
    }
  }
  if (spec.minimumWaterAreas) assert(result.counts.waterAreas >= spec.minimumWaterAreas, `${spec.id}: expected mapped water areas`);
  if (spec.minimumBuildings) {
    assert(
      result.counts.buildings >= spec.minimumBuildings,
      `${spec.id}: expected at least ${spec.minimumBuildings} rendered buildings ` +
      `${JSON.stringify({ buildings: result.counts.buildings, detail: result.buildingDetail })}`
    );
  }
  if (spec.minimumVegetationFeatures) {
    assert(
      result.counts.vegetationFeatures >= spec.minimumVegetationFeatures,
      `${spec.id}: expected at least ${spec.minimumVegetationFeatures} mapped vegetation instances ` +
      `${JSON.stringify({ vegetationFeatures: result.counts.vegetationFeatures, worldCover: result.worldCover?.status })}`
    );
  }
  const architecturalBuildings = Number(result.buildingDimensions?.architecturalCount || 0);
  if (architecturalBuildings > 0) {
    const dimensions = result.buildingDimensions || {};
    const buildingSource = String(result.buildingDetail?.source || '');
    const authoritativeBuildingSource = buildingSource === 'shortbread-vector-buildings';
    assert(
      authoritativeBuildingSource,
      `${spec.id}: buildings did not use an authoritative mapped massing source ${JSON.stringify(result.buildingDetail)}`
    );
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
      streamedMappedBuildings > 0 || inferredFootprints > 0,
      `${spec.id}: rendered buildings lost authoritative or explicit inferred provenance ${JSON.stringify(dimensions)}`
    );
    assert(
      architecturalBuildings > 0 &&
        (streamedMappedBuildings + inferredFootprints) / architecturalBuildings >= 0.9,
      `${spec.id}: more than 10% of rendered buildings bypassed global or explicit inferred provenance ${JSON.stringify(dimensions.geometrySources)}`
    );
    const sourceDetails = result.buildingDetail?.sourceDetails || {};
    const coverageIsWideEnough =
      Number(sourceDetails.loaded || 0) >= 4 &&
      Number(sourceDetails.zoom || 0) >= 14;
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
      assert(
        Number(dimensions.metadataMatched || 0) > 0 && Number(sourceDetails.loaded || 0) >= 4,
        `${spec.id}: mapped building source lost its metadata enrichment or visible coverage ${JSON.stringify({ dimensions, sourceDetails })}`
      );
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
      const detailedRatio = Number(presentation.visibleDetailedSourceCount || 0) / visibleSources;
      const wallFacadeRatio = Number(presentation.visibleWallFacadeSourceCount || 0) / visibleSources;
      assert(detailedRatio >= 0.5, `${spec.id}: most visible buildings lost facade surface detail ${JSON.stringify(presentation)}`);
      assert(wallFacadeRatio >= 0.5, `${spec.id}: occupied buildings regressed to blank extrusions ${JSON.stringify(presentation)}`);
    }
  }
  if (spec.expectedLandmarkKind) {
    assert(
      result.landmarkPresentation?.[spec.expectedLandmarkKind]?.visibleMeshes > 0,
      `${spec.id}: expected mapped ${spec.expectedLandmarkKind} landmark ` +
      `${JSON.stringify({ landmarks: result.landmarkPresentation, diagnostics: result.loadDiagnostics?.landmarks })}`
    );
    if (spec.expectedLandmarkKind === 'historic_wall') {
      const wall = result.landmarkPresentation.historic_wall;
      assert(
        wall.segments > 0 &&
        wall.maxSegmentLength <= 14.7 &&
        wall.maxHeight <= 14 &&
        wall.maxWidth <= 8,
        `${spec.id}: historic wall contains terrain-bridging slab geometry ${JSON.stringify(wall)}`
      );
    }
  }

  if (Number.isFinite(spec.minimumLandmarkSpawnDistance)) {
    assert(
      Number(result.initialSpawn?.landmarkDistance) >= spec.minimumLandmarkSpawnDistance,
      `${spec.id}: landmark arrival is too close to mapped landmark geometry ` +
      `${JSON.stringify(result.initialSpawn)}`
    );
  }

  if (Number.isFinite(spec.maximumWaterAreaSpan)) {
    const oversizedWater = (result.waterAreaSamples || []).filter(
      (water) => Number(water?.span || 0) > spec.maximumWaterAreaSpan
    );
    assert(
      oversizedWater.length === 0,
      `${spec.id}: unvalidated mapped water sheet exceeded ${spec.maximumWaterAreaSpan}m ` +
      `${JSON.stringify(oversizedWater.slice(0, 3))}`
    );
  }
  if (spec.rejectBoatPrompt) {
    assert(
      result.boatAvailability?.available !== true && result.boatAvailability?.promptVisible !== true,
      `${spec.id}: false boat prompt appeared on a land arrival ${JSON.stringify(result.boatAvailability)}`
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
    assert(
      result.boatPresentation.visibleOverlappingNonWaterLanduses === 0,
      `${spec.id}: a non-water land-use surface remained visible beneath the boat ${JSON.stringify(result.boatPresentation)}`
    );
    assert(
      result.boatPresentation.waterPatchEdgeFade > 0 &&
      result.boatPresentation.waterPatchEdgeFade <= 0.12,
      `${spec.id}: local water surface feather exposes terrain beneath the hull ${JSON.stringify(result.boatPresentation)}`
    );
    if (
      result.boatPresentation.waterKind !== 'open_ocean' &&
      result.boatPresentation.shorelineDistance > 24
    ) {
      assert(
        result.boatPresentation.waterPatchRadius <= result.boatPresentation.shorelineDistance * 0.85,
        `${spec.id}: local water patch covered the mapped shoreline ${JSON.stringify(result.boatPresentation)}`
      );
    }
    if (result.boatPresentation.waterKind === 'open_ocean') {
      assert(
        result.boatPresentation.terrainSceneGroups?.every((group) => group.current || !group.effectivelyVisible),
        `${spec.id}: a superseded terrain scene remains visible after the atomic world commit ${JSON.stringify(result.boatPresentation.terrainSceneGroups)}`
      );
      assert(
        result.boatPresentation.oceanHorizonPatchVisible === true,
        `${spec.id}: open-ocean surface cannot cover the visible horizon ${JSON.stringify(result.boatPresentation)}`
      );
      assert(
        result.boatPresentation.visibleTerrainMeshes === 0 &&
        result.boatPresentation.visibleGroundPlanes === 0 &&
        result.boatPresentation.visibleWaterLanduses === 0,
        `${spec.id}: land rendering leaked into far-offshore presentation ${JSON.stringify(result.boatPresentation)}`
      );
    } else {
      assert(
        result.boatPresentation.oceanHorizonPatchVisible === false,
        `${spec.id}: open-ocean horizon surface leaked into inland or coastal water ${JSON.stringify(result.boatPresentation)}`
      );
    }
    assert(String(result.hudLocationLabel || '').trim(), `${spec.id}: water start has no HUD location label`);
    if (Array.isArray(spec.expectedHudLocationTerms) && spec.expectedHudLocationTerms.length > 0) {
      assert(
        spec.expectedHudLocationTerms.some((term) =>
          String(result.hudLocationLabel || '').toLowerCase().includes(String(term).toLowerCase())
        ),
        `${spec.id}: HUD location label does not identify the selected destination ${JSON.stringify({ expectedTerms: spec.expectedHudLocationTerms, actual: result.hudLocationLabel })}`
      );
    }
    if (result.livePlaceLocation && String(result.livePlaceLocation.display || '').trim() === String(result.hudLocationLabel || '').trim()) {
      const latDelta = Math.abs(Number(result.livePlaceLocation.lat) - Number(spec.lat));
      const lonDelta = Math.abs(Number(result.livePlaceLocation.lon) - Number(spec.lon));
      assert(latDelta <= 0.4 && lonDelta <= 0.4, `${spec.id}: HUD reused a stale place label ${JSON.stringify(result.livePlaceLocation)}`);
    }
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
  assert(result.driveSpawn?.valid !== false, `${spec.id}: invalid drive spawn ${JSON.stringify(result.driveSpawn)}`);
  assert(result.walkSpawn?.valid !== false, `${spec.id}: invalid walk spawn ${JSON.stringify(result.walkSpawn)}`);
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
      if (Number.isFinite(exactRenderedRoadY)) {
        assert(
          Math.abs(carFeetY - exactRenderedRoadY) <= 2.5,
          `${spec.id}: playable car surface diverged from raw rendered road geometry ` +
          `${JSON.stringify({ carFeetY, exactRenderedRoadY, road })}`
        );
      }
      if (road.terrainMode === 'at_grade') {
        const terrainMeshY = Number(result.landPresentation?.terrainMeshY);
        if (Number.isFinite(terrainMeshY)) {
          assert(
            Math.abs(roadSurfaceY - terrainMeshY) <= 2.5,
            `${spec.id}: at-grade road profile detached from current terrain ` +
            `${JSON.stringify({ roadSurfaceY, terrainMeshY, road })}`
          );
          if (Number.isFinite(exactRenderedRoadY)) {
            assert(
              Math.abs(exactRenderedRoadY - terrainMeshY) <= 2.5,
              `${spec.id}: rendered at-grade road detached from current terrain ` +
              `${JSON.stringify({ exactRenderedRoadY, terrainMeshY, road })}`
            );
          }
        }
      }
    }
  }
}
