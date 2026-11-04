// Controlled pure-domain shapes, never a source observation or instrument clock.
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
import { fieldDistance } from '../../app/js/campaign/field-study-contract.js';
import {
  MINING_OFFSETS,
  miningFormation,
  miningAssay,
} from '../../app/js/campaign/mining-formation.js';
import {
  normalizeMiningCareer,
  transitionMiningCareer,
  miningTarget,
} from '../../app/js/campaign/mining-career.js';
export function miningHarness(
  initial,
  variantId = 'campaign',
  runId = 'mining-controlled-case-0001'
) {
  let state = normalizeMiningCareer(initial),
    now = Math.max(Date.parse('2026-11-03T12:00:00Z'), (state.active?.completedAt || 0) + 1000);
  const frame = earthCoordinateFrame({ lat: 39.27, lon: -76.59 }, 111000),
    site = {
      id: 'controlled-quarry-yard',
      name: 'Controlled quarry training yard',
      truthType: 'virtual-training-site',
      location: frame.toGeographic(0, 0),
      points: Object.fromEntries(
        Object.entries(MINING_OFFSETS).map(([id, p]) => [id, frame.toGeographic(p.x, p.z)])
      ),
    },
    events = [],
    items = [];
  function command(action, overrides = {}) {
    now += 100;
    const a = state.active,
      id = a ? miningTarget(a) : 'bench',
      p = MINING_OFFSETS[id],
      evidence = {
        environment: 'EARTH',
        travelMode: 'walk',
        liveGps: false,
        supported: true,
        verticalDistance: 0,
        position: site.points[id],
        siteId: site.id,
        at: now,
        localPosition: { x: p.x, y: 0, z: p.z },
      };
    const result = transitionMiningCareer(
      state,
      { ...action, revision: state.revision, evidence, ...overrides },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    items.push(...result.samples);
    return result;
  }
  function window(method, seconds, activeSeconds = seconds) {
    const startedAt = now + 100;
    now = startedAt + activeSeconds * 1000;
    return {
      runId: state.active.runId,
      habitatId: site.id + ':' + method,
      method: 'mining-' + method,
      targetSeconds: seconds,
      activeSeconds,
      startedAt,
      endedAt: now,
      complete: true,
      interrupted: false,
      liveGps: false,
      supported: true,
      sensor: { aligned: true },
      observerDistanceMeters: 0,
      routeGates: [],
    };
  }
  function inspect() {
    const id = miningTarget(state.active),
      features = [
        ...new Set(
          miningFormation(variantId)
            .cells.filter((c) => c.faceId === id)
            .map((c) => c.features)
        ),
      ].sort();
    return command({
      type: 'inspect',
      inspection: { faceId: id, visible: true, features, truthType: 'visible-authored-formation' },
    });
  }
  function assayRecord() {
    const id = miningTarget(state.active),
      f = miningFormation(variantId),
      effort = window('assay-' + id, 5),
      samples = Array.from({ length: 5 }, (_, i) => {
        const a = miningAssay(f, [id + ':1:' + i]);
        return {
          cellId: a.cellIds[0],
          massGrams: a.massGrams,
          copperGrams: a.copperGrams,
          magnetic: a.magnetic,
          tipMeters: { x: (i - 2) * 0.2, y: 1, z: 0.145 },
          contact: true,
          activeSeconds: i + 0.75,
        };
      });
    return { faceId: id, truthType: 'modeled-virtual-line-assay', samples, effort };
  }
  function assay() {
    return command({ type: 'assay', assay: assayRecord() });
  }
  const ids =
    variantId === 'narrow-vein'
      ? ['b:1:2']
      : variantId === 'mixed-batch'
        ? ['b:1:1', 'b:1:2', 'b:1:3']
        : ['b:1:1', 'b:1:2'];
  function cutRecord() {
    const effort = window('cut', 4),
      contacts = ids.map((id, i) => {
        const t = ((i + 0.5) * 4) / ids.length;
        return {
          cellId: id,
          contact: true,
          tipMeters: { x: (Number(id.split(':')[2]) - 2) * 0.2, y: 1, z: 0 },
          activeSeconds: t,
          motorAngle: t * 8 * Math.PI,
        };
      });
    return { truthType: 'working-cutter-contact', effort, contacts };
  }
  function delivery() {
    const positions = [];
    for (const [start, end] of [
      [MINING_OFFSETS.b, MINING_OFFSETS.dispatch],
      [MINING_OFFSETS.dispatch, MINING_OFFSETS.bench],
    ])
      for (let i = 0; i <= 6; i++) {
        if (positions.length && i === 0) continue;
        const t = i / 6;
        positions.push(
          frame.toGeographic(start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t)
        );
      }
    let distance = 0;
    const route = positions.map((position, i) => {
        if (i) distance += fieldDistance(positions[i - 1], position);
        return {
          position,
          heightMeters: 0,
          activeSeconds: i,
          supported: true,
          carrierBlocked: false,
        };
      }),
      effort = window('delivery', 3, route.length - 1);
    effort.observerDistanceMeters = distance;
    effort.routeGates = ['dispatch', 'bench'];
    return {
      truthType: 'walked-carrier-delivery',
      effort,
      route,
      distanceMeters: distance,
      onPan: true,
      wheelClearancesMeters: [0, 0, 0, 0],
      cellIds: [...ids],
      massGrams: state.active.separation.inputGrams,
    };
  }
  function finish() {
    while (state.active.phase === 'inspect') inspect();
    while (state.active.phase === 'assay') assay();
    if (state.active.phase === 'plan')
      command({ type: 'plan', cellIds: ids, returnRoute: { clear: true } });
    if (state.active.phase === 'cut') command({ type: 'cut', cut: cutRecord() });
    if (state.active.phase === 'sort')
      command({
        type: 'sort',
        oreCellIds: ids.filter(
          (id) => miningAssay(miningFormation(variantId), [id]).gradePermille >= 20
        ),
      });
    if (state.active.phase === 'deliver') command({ type: 'deliver', delivery: delivery() });
    if (state.active.phase === 'process') command({ type: 'process' });
    if (state.active.phase === 'fabricate') command({ type: 'fabricate' });
    if (state.active.phase === 'restore')
      command({
        type: 'restore',
        restoration: {
          truthType: 'restored-authored-quarry-cell',
          supportsIntact: true,
          returnRouteClear: true,
          orderInstalled: true,
          backfillGrams: state.active.processing.inputGrams - state.active.processing.materialGrams,
          backfilledCellIds: ids,
        },
      });
    if (state.active.phase === 'publish')
      command({ type: 'publish', limit: 'authored-formation-not-real-ore-reserve' });
    return state;
  }
  command({
    type: 'accept',
    site,
    variantId,
    runId,
    admission: {
      kind: 'authored-quarry-training-yard',
      yardId: 'quarry-exhibit-01',
      siteId: site.id,
    },
  });
  return {
    get state() {
      return state;
    },
    events,
    items,
    site,
    command,
    inspect,
    assay,
    assayRecord,
    cutRecord,
    delivery,
    finish,
    ids,
  };
}
