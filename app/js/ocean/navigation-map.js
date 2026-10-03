// North-up gameplay map. +X is east, +Z is south. Heights come from the
// collision sampler; geographic source coverage is an independent overlay.
export function oceanHeadingDegrees(yaw = 0) {
  return ((180 - yaw * 180 / Math.PI) % 360 + 360) % 360;
}

export function createSeabedMapData({ sample, centerX = 0, centerZ = 0, halfExtent = 300,
  resolution = 33, metersPerWorldUnit = 1.11, contourIntervalMeters = 10 }) {
  const size = Math.max(3, Math.min(65, Math.round(resolution)));
  const depths = new Float32Array(size * size);
  const known = new Uint8Array(size * size);
  const sources = new Set();
  let knownCount = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const evidence = sample(centerX + (col / (size - 1) * 2 - 1) * halfExtent,
        centerZ + (row / (size - 1) * 2 - 1) * halfExtent);
      const index = row * size + col;
      depths[index] = Number.isFinite(evidence?.presentationWorldY)
        ? Math.max(0, -evidence.presentationWorldY * metersPerWorldUnit) : NaN;
      if (evidence?.bathymetry?.truthType !== 'unknown' && Number.isFinite(evidence?.bathymetry?.depthMeters)) {
        known[index] = 1; knownCount++;
        sources.add(evidence.bathymetry.sourceId);
      }
    }
  }
  const contours = [];
  // Marching triangles avoids ambiguous four-edge saddle connections.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const corners = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]];
      for (const triangle of [[0, 1, 2], [0, 2, 3]]) {
        const points = triangle.map(i => corners[i]);
        const values = points.map(([x, y]) => depths[y * size + x]);
        if (!values.every(Number.isFinite)) continue;
        const low = Math.min(...values), high = Math.max(...values);
        for (let level = Math.ceil(low / contourIntervalMeters) * contourIntervalMeters; level < high; level += contourIntervalMeters) {
          const hits = [];
          for (let edge = 0; edge < 3; edge++) {
            const next = (edge + 1) % 3;
            if ((values[edge] <= level && values[next] > level) || (values[next] <= level && values[edge] > level)) {
              const t = (level - values[edge]) / (values[next] - values[edge]);
              hits.push([(points[edge][0] + t * (points[next][0] - points[edge][0])) / (size - 1),
                (points[edge][1] + t * (points[next][1] - points[edge][1])) / (size - 1)]);
            }
          }
          if (hits.length === 2) contours.push({ depthMeters: level, from: hits[0], to: hits[1] });
        }
      }
    }
  }
  return { size, depths, known, knownCount, sources: [...sources], contours, centerX, centerZ, halfExtent,
    metersPerWorldUnit, contourIntervalMeters };
}

const mapCache = new WeakMap();
export function drawOceanNavigationMap(appCtx, oceanMode, sample) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx || typeof sample !== 'function') return;
  const width = canvas.width, height = canvas.height;
  const sub = oceanMode.diver?.active?oceanMode.diver.navigationActor():oceanMode.submarine;
  const x = sub.position.x, z = sub.position.z;
  const units = Number(appCtx.METERS_PER_WORLD_UNIT) > 0 ? appCtx.METERS_PER_WORLD_UNIT : 1.11;
  const zoom = Math.max(11, Math.min(19, Number(appCtx.minimapZoom) || 15));
  const halfExtent = 300 * 2 ** (15 - zoom);
  const snap = halfExtent / 24;
  const centerX = Math.round(x / snap) * snap, centerZ = Math.round(z / snap) * snap;
  const key = `${centerX},${centerZ},${halfExtent},${width},${height},${units},${oceanMode.bathymetryReady}`;
  let cached = mapCache.get(canvas);
  const now = performance.now();
  const dataChanged = !cached || cached.local !== oceanMode.localBathymetryGrid
    || cached.global !== oceanMode.globalBathymetryGrid || cached.site !== oceanMode.launchSite
    || cached.ready !== oceanMode.bathymetryReady || cached.data.halfExtent !== halfExtent;
  // Keep marker motion continuous, but bound terrain sampling during travel.
  if (dataChanged || (cached.key !== key && now - cached.generatedAt >= 200)) {
    const data = createSeabedMapData({ sample, centerX, centerZ, halfExtent, metersPerWorldUnit: units });
    const raster = cached?.raster || document.createElement('canvas'); raster.width = width; raster.height = height;
    const paint = raster.getContext('2d');
    const cellWidth = width / (data.size - 1), cellHeight = height / (data.size - 1);
    for (let row = 0; row < data.size - 1; row++) {
      for (let col = 0; col < data.size - 1; col++) {
        const i = row * data.size + col;
        const depth = data.depths[i];
        const light = Math.max(11, Math.min(38, 38 - depth * .13));
        paint.fillStyle = `hsl(198 60% ${light}%)`;
        paint.fillRect(col * cellWidth, row * cellHeight, cellWidth + 1, cellHeight + 1);
        if (!data.known[i] || !data.known[i + 1] || !data.known[i + data.size] || !data.known[i + data.size + 1]) {
          paint.strokeStyle = 'rgba(255,194,104,.26)'; paint.lineWidth = .65;
          paint.beginPath(); paint.moveTo(col * cellWidth, (row + 1) * cellHeight);
          paint.lineTo((col + 1) * cellWidth, row * cellHeight); paint.stroke();
        }
      }
    }
    paint.strokeStyle = 'rgba(145,233,235,.65)'; paint.lineWidth = .65;
    paint.beginPath();
    for (const line of data.contours) {
      paint.moveTo(line.from[0] * width, line.from[1] * height);
      paint.lineTo(line.to[0] * width, line.to[1] * height);
    }
    paint.stroke();
    cached = { key, generatedAt: now, ready: oceanMode.bathymetryReady, local: oceanMode.localBathymetryGrid, global: oceanMode.globalBathymetryGrid,
      site: oceanMode.launchSite, data, raster };
    mapCache.set(canvas, cached);
  }
  ctx.drawImage(cached.raster, 0, 0);
  const markerX = width * (.5 + (x - cached.data.centerX) / (halfExtent * 2));
  const markerY = height * (.5 + (z - cached.data.centerZ) / (halfExtent * 2));
  const heading = oceanHeadingDegrees(sub.yaw);
  ctx.save(); ctx.translate(markerX, markerY); ctx.rotate(heading * Math.PI / 180);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#43dcf0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
  if(oceanMode.diver?.active){
    const parked=oceanMode.submarine.position;
    const px=width*(.5+(parked.x-cached.data.centerX)/(halfExtent*2)),py=height*(.5+(parked.z-cached.data.centerZ)/(halfExtent*2));
    ctx.fillStyle='#ffc76b';ctx.fillRect(px-3,py-3,6,6);ctx.font='9px sans-serif';ctx.fillText('SUB',px+5,py+3);
  }
  if(appCtx.oceanVoyage?.current){
    const px=Math.max(7,Math.min(width-7,width*(.5-cached.data.centerX/(halfExtent*2)))),py=Math.max(40,Math.min(height-38,height*(.5-cached.data.centerZ/(halfExtent*2))));
    ctx.fillStyle='#ffdc91';ctx.fillRect(px-4,py-4,8,8);ctx.font='9px sans-serif';ctx.fillText('SHIP',Math.min(width-28,px+6),py+3);
  }
  const evidence = sample(x, z);
  const depthKnown = evidence.bathymetry.truthType !== 'unknown';
  const sourceLabel = !depthKnown ? 'Depth data unknown' : evidence.bathymetry.sourceId?.includes('gebco') ? 'GEBCO modeled depth' : 'Terrain-derived depth';
  const modelDepth = depthKnown ? `${Math.round(evidence.bathymetry.depthMeters)} m` : 'unknown';
  ctx.fillStyle = 'rgba(3,17,28,.9)'; ctx.fillRect(0, 0, width, 33); ctx.fillRect(0, height - 30, width, 30);
  ctx.fillStyle = '#e5f7fa'; ctx.font = 'bold 9px sans-serif'; ctx.fillText('SEABED · GAME', 6, 12);
  ctx.font = '8px sans-serif'; ctx.fillStyle = depthKnown ? '#96e2e3' : '#ffd294';
  ctx.fillText(depthKnown ? `Model ${modelDepth} · ≈MSL` : 'No geographic depth data', 6, 25);
  ctx.fillStyle = '#fff'; ctx.fillText('N ↑', width - 23, 12);
  const scaleMeters = halfExtent * 2 * units / 4;
  const scaleText = scaleMeters >= 1000 ? `${(scaleMeters / 1000).toFixed(1)} km` : `${Math.round(scaleMeters)} m`;
  ctx.strokeStyle = '#e5f7fa'; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(7, height - 8); ctx.lineTo(7 + width / 4, height - 8); ctx.stroke();
  ctx.fillStyle = '#d3eef1'; ctx.font = '8px sans-serif'; ctx.fillText(scaleText, 7, height - 15);
  ctx.fillText(`${Math.round(heading) % 360}°`, width * .46, height - 15);
  const detail = `North-up gameplay seabed, 10 m contour interval. Heading ${Math.round(heading) % 360} degrees. ${sourceLabel}: ${modelDepth}. Geographic datum: ${evidence.bathymetry.verticalDatum || 'unknown'}; ≈MSL means assumed mean sea level. Hatched areas lack geographic depth data. Terrain is compressed for gameplay; not a navigation chart.`;
  canvas.title = detail; canvas.setAttribute('aria-label', detail);
  oceanMode.navigationMapSnapshot = { headingDegrees: heading, halfExtentWorldUnits: halfExtent,
    widthMeters: halfExtent * 2 * units, contourIntervalMeters: 10,
    coverageFraction: cached.data.knownCount / cached.data.known.length,
    sourceLabel, geographicDepthMeters: depthKnown ? evidence.bathymetry.depthMeters : null,
    verticalDatum: evidence.bathymetry.verticalDatum || null, gameplaySeabedWorldY: evidence.presentationWorldY };
}
