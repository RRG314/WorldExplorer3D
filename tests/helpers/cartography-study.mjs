// Controlled model data only, never a source-world seed.
import {
  normalizeCartographyCareer,
  transitionCartographyCareer,
  cartographyTarget,
  CARTOGRAPHY_PROTOCOL,
} from '../../app/js/campaign/cartography-career.js';
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
export function cartographyHarness(initial, variantId = 'campaign') {
  let state = normalizeCartographyCareer(initial),
    now = 1000000 + state.revision * 10000;
  const events = [],
    frame = earthCoordinateFrame({ lat: 39.29095, lon: -76.61085 }, 111000),
    geo = (p) => frame.toGeographic(p.x, p.z),
    base = {
      origin: { x: 0, z: 0 },
      a: { x: 0, z: -14 },
      b: { x: 0, z: -28 },
      entry: { x: 10, z: -14 },
    },
    local =
      variantId === 'reciprocal'
        ? { ...base, origin: base.b, b: base.origin }
        : variantId === 'dogleg'
          ? { ...base, a: { x: 18, z: 0 }, b: { x: 0, z: 18 }, entry: { x: -8, z: 0 } }
          : base;
  const paths =
      variantId === 'dogleg'
        ? [
            [local.origin, local.a],
            [local.a, local.origin, local.b],
          ]
        : [
            [local.origin, local.a],
            [local.a, local.b],
          ],
    site = {
      id: 'cartography-fixture-' + variantId,
      name: 'Virtual loaded route',
      truthType: 'virtual-training-site',
      location: geo(local.origin),
      locationContext: geo({ x: 0, z: 0 }),
      points: Object.fromEntries(Object.entries(local).map(([k, p]) => [k, geo(p)])),
      plan: {
        protocol: CARTOGRAPHY_PROTOCOL,
        variantId,
        realAccess: 'unverified',
        entry: { id: 'entry-001', provenance: 'inferred' },
        ...(variantId === 'reciprocal' ? { reciprocalOf: state.records.campaign.runId } : {}),
        legs: paths.map((points, i) => ({
          from: ['origin', 'a'][i],
          to: ['a', 'b'][i],
          points: points.map(geo),
          mapDistance: variantId === 'dogleg' ? [18, 36][i] : 14,
          sources: [
            {
              id: 'way:fixture',
              kind: 'footway',
              name: 'Fixture way',
              provenance: 'mapped',
              mappedHeight: null,
            },
          ],
        })),
      },
    };
  function step(type, fields = {}) {
    const result = transitionCartographyCareer(
      state,
      {
        type,
        revision: state.revision,
        ...fields,
        ...(type === 'accept'
          ? {}
          : {
              evidence: {
                environment: 'EARTH',
                travelMode: 'walk',
                liveGps: false,
                supported: true,
                verticalDistance: 0,
                siteId: state.active.site.id,
                position: state.active.site.points[cartographyTarget(state.active)],
                at: now,
              },
            }),
      },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    now += 10000;
    return result;
  }
  function controls() {
    return step('controls', {
      north: 'true-north',
      controls: {
        runId: state.active.runId,
        siteId: site.id,
        at: now,
        sights: ['a', 'b'].map((id) => ({
          id,
          clear: true,
          rangeMeters: Math.hypot(local[id].x - local.origin.x, local[id].z - local.origin.z),
        })),
      },
    });
  }
  function reading() {
    const i = state.active.phase === 'leg-one' ? 0 : 1,
      points = [];
    let t = 0;
    for (let j = 1; j < paths[i].length; j++) {
      const a = paths[i][j - 1],
        b = paths[i][j],
        n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
      for (let k = j === 1 ? 0 : 1; k <= n; k++)
        points.push({
          position: geo({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }),
          heightMeters: 0,
          activeSeconds: t++,
          surfaceKind: 'footway',
          supported: true,
        });
    }
    return {
      protocol: CARTOGRAPHY_PROTOCOL,
      runId: state.active.runId,
      siteId: site.id,
      legIndex: i,
      startedAt: now - 60000,
      completedAt: now - 1,
      activeSeconds: t,
      excludedSeconds: 0,
      samples: points,
    };
  }
  function measure(mutate) {
    const r = reading();
    mutate?.(r);
    return step('measure', { reading: r, unit: 'm', bearingReference: 'true-north' });
  }
  function access() {
    return step('access', {
      accessClaim: 'virtual-only',
      limit: 'no-step-free-or-public-access-proof',
      inspection: {
        siteId: site.id,
        runId: state.active.runId,
        entryId: site.plan.entry.id,
        at: now,
        maxGrade: 0.04,
        entrySupport: 'exterior-only',
        entranceProvenance: 'inferred',
        surfaceKind: 'footway',
        crossingMapped: false,
      },
    });
  }
  function reconcile() {
    return step('reconcile', {
      heightSource: 'loaded-surface-not-mapped-height',
      geometryLimit: 'same-source-not-independent-survey',
      routeMeaning: 'connected-route-not-chord',
    });
  }
  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    events,
    site,
    step,
    controls,
    reading,
    measure,
    access,
    reconcile,
    accept: () => step('accept', { site, variantId, runId: 'cartography-fixture-' + variantId }),
    publish: () =>
      step('publish', { use: 'personal-virtual-route', followUp: 'recheck-loaded-access' }),
  };
}
