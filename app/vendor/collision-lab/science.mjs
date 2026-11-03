// Numerical contract: GeV with c=1, metres, tesla, radians; no detector-response claim.
export const CURVATURE = 0.299792458;
export function invariantMass(a, b) {
  for (const m of [a, b])
    if (![m.E, m.px, m.py, m.pz].every(Number.isFinite) || m.E < 0)
      throw new Error("Invalid four-vector");
  const E = a.E + b.E,
    p2 = (a.px + b.px) ** 2 + (a.py + b.py) ** 2 + (a.pz + b.pz) ** 2;
  const m2 = E * E - p2;
  if (m2 < -1e-12 * Math.max(1, E * E, p2))
    throw new Error("Negative invariant mass squared");
  return Math.sqrt(Math.max(0, m2));
}
export const pt = (m) => Math.hypot(m.px, m.py);
export function decode(row, index) {
  return {
    id: `700:MuRun2010B.csv:${index + 1}`,
    row: index + 1,
    run: row[0],
    event: row[1],
    muons: [
      { E: row[2], px: row[3], py: row[4], pz: row[5], q: row[6] },
      { E: row[7], px: row[8], py: row[9], pz: row[10], q: row[11] },
    ],
    sourceMass: row[12],
  };
}
export function validateBundle(b) {
  if (
    b.schema !== "lhc-dimuon-v1" ||
    b.category !== "REAL_RECORDED_DATA" ||
    b.units !== "GeV (c=1); charge in elementary-charge units" ||
    b.count !== b.events?.length ||
    b.count > 150000
  )
    throw new Error("Unsupported or incomplete event bundle");
  if (!/^[a-f0-9]{64}$/.test(b.sourceSha256))
    throw new Error("Missing source digest");
  const expected = [
    "run",
    "event",
    "E1",
    "px1",
    "py1",
    "pz1",
    "q1",
    "E2",
    "px2",
    "py2",
    "pz2",
    "q2",
    "sourceMass",
  ];
  if (JSON.stringify(b.columns) !== JSON.stringify(expected))
    throw new Error("Unexpected event columns");
  for (const r of b.events) {
    if (
      r.length !== 13 ||
      typeof r[0] !== "string" ||
      typeof r[1] !== "string" ||
      !r.slice(2).every(Number.isFinite) ||
      ![r[6], r[11]].every((x) => x === 1 || x === -1)
    )
      throw new Error("Malformed event row");
    const e = decode(r, 0);
    invariantMass(...e.muons);
  }
  return b;
}
export function prepareSummary(b) {
  const mass = new Float64Array(b.count),
    minPt = new Float64Array(b.count),
    opposite = new Uint8Array(b.count);
  b.events.forEach((r, i) => {
    const e = decode(r, i);
    mass[i] = invariantMass(...e.muons);
    minPt[i] = Math.min(...e.muons.map(pt));
    opposite[i] = r[6] !== r[11] ? 1 : 0;
  });
  return { mass, minPt, opposite };
}
export function select(summary, cut = 0, charge = "all") {
  if (
    !Number.isFinite(cut) ||
    cut < 0 ||
    !["all", "opposite", "same"].includes(charge)
  )
    throw new Error("Invalid selection");
  const indices = [],
    bins = Array(55).fill(0);
  let outside = 0;
  for (let i = 0; i < summary.mass.length; i++)
    if (
      summary.minPt[i] >= cut &&
      (charge === "all" || (charge === "opposite") === !!summary.opposite[i])
    ) {
      indices.push(i);
      const m = summary.mass[i];
      if (m >= 0 && m <= 110) bins[Math.min(54, Math.floor(m / 2))]++;
      else outside++;
    }
  return { indices, bins, outside };
}
export function helix(m, B, length = 6, segments = 96) {
  if (
    ![B, length, segments, m.px, m.py, m.pz, m.q].every(Number.isFinite) ||
    length < 0 ||
    segments < 1 ||
    !Number.isInteger(segments)
  )
    throw new Error("Invalid trajectory parameters");
  const transverse = pt(m),
    mag = Math.hypot(transverse, m.pz);
  if (mag === 0) throw new Error("Zero momentum has no direction");
  const phi = Math.atan2(m.py, m.px),
    k = transverse > 0 ? (-CURVATURE * m.q * B) / transverse : 0;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const s = (length * i) / segments,
      st = (s * transverse) / mag;
    if (Math.abs(k) < 1e-10)
      points.push([(s * m.px) / mag, (s * m.py) / mag, (s * m.pz) / mag]);
    else
      points.push([
        (Math.sin(phi + k * st) - Math.sin(phi)) / k,
        (-Math.cos(phi + k * st) + Math.cos(phi)) / k,
        (s * m.pz) / mag,
      ]);
  }
  return points;
}
export function receipt(bundle, selection, cut, charge) {
  return {
    schema: "lhc-analysis-receipt-v1",
    source: bundle.source,
    sourceSha256: bundle.sourceSha256,
    category: bundle.category,
    sourceSelection: bundle.selection,
    calculation: "M=sqrt((sum E)^2-|sum p|^2), GeV, c=1; science.mjs v1",
    cut: { minimumEachMuonPtGeV: cut, charge },
    binning: {
      start: 0,
      end: 110,
      width: 2,
      convention: "[low,high), final bin includes 110",
    },
    count: selection.indices.length,
    outsideHistogram: selection.outside,
    bins: selection.bins,
    selectedIds: selection.indices.map((i) => `700:MuRun2010B.csv:${i + 1}`),
  };
}
