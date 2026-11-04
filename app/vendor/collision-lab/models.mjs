// Units: metres, radians, tesla, GeV and elementary charge unless stated otherwise.
export const K = 0.299792458;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function bend(momentum, field, charge = 1, length = 6, steps = 120) {
  if (
    ![momentum, field, charge, length].every(Number.isFinite) ||
    momentum <= 0 ||
    length < 0
  )
    throw Error("Invalid beam parameters");
  const curvature = (-K * charge * field) / momentum,
    radius = Math.abs(curvature) > 1e-12 ? 1 / Math.abs(curvature) : Infinity;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const s = (length * i) / steps;
    return Math.abs(curvature) < 1e-12
      ? [s, 0]
      : [
          Math.sin(curvature * s) / curvature,
          (1 - Math.cos(curvature * s)) / curvature,
        ];
  });
  return { points, radius, curvature };
}
export function accelerate(phase, voltageMeV = 2, passes = 8, initialMeV = 20) {
  if (![phase, voltageMeV, passes, initialMeV].every(Number.isFinite))
    throw Error("Invalid cavity parameters");
  const gain = voltageMeV * Math.cos((phase * Math.PI) / 180),
    energies = Array.from(
      { length: passes + 1 },
      (_, i) => initialMeV + i * gain,
    );
  return { gain, energies, energy: energies.at(-1) };
}
export function beamTransport(k1, k2, alternating = true, spread = 1) {
  if (
    ![k1, k2, spread].every(Number.isFinite) ||
    Math.max(Math.abs(k1), Math.abs(k2)) > 2 ||
    spread <= 0
  )
    throw Error("Invalid optics");
  const rays = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2,
      b = i * 2.399963229728653;
    return {
      x: 0.003 * spread * Math.cos(a),
      xp: 0.002 * spread * Math.cos(b),
      y: 0.003 * spread * Math.sin(a),
      yp: 0.002 * spread * Math.sin(b),
      lost: false,
    };
  });
  const history = [];
  let s = 0;
  const record = () => {
    history.push({
      s,
      x: Math.sqrt(rays.reduce((v, r) => v + r.x * r.x, 0) / rays.length),
      y: Math.sqrt(rays.reduce((v, r) => v + r.y * r.y, 0) / rays.length),
      rays: rays.map((r) => [r.x, r.y, r.lost]),
    });
  };
  record();
  for (let cell = 0; cell < 4; cell++) {
    for (let j = 0; j < 10; j++) {
      for (const r of rays) {
        r.x += r.xp * 0.1;
        r.y += r.yp * 0.1;
        if (Math.abs(r.x) > 0.025 || Math.abs(r.y) > 0.025) r.lost = true;
      }
      s += 0.1;
      record();
    }
    const k = cell % 2 ? (alternating ? -k2 : k2) : k1;
    for (const r of rays) {
      r.xp -= k * r.x;
      r.yp += k * r.y;
    }
  }
  for (let j = 0; j < 10; j++) {
    for (const r of rays) {
      r.x += r.xp * 0.1;
      r.y += r.yp * 0.1;
      if (Math.abs(r.x) > 0.025 || Math.abs(r.y) > 0.025) r.lost = true;
    }
    s += 0.1;
    record();
  }
  return {
    history,
    x: history.at(-1).x,
    y: history.at(-1).y,
    lost: rays.filter((r) => r.lost).length,
    total: rays.length,
  };
}
export const signatures = [
  {
    name: "Electron",
    signal: [1, 2, 0, 0],
    why: "A charged track leads into the electromagnetic calorimeter.",
  },
  {
    name: "Photon",
    signal: [0, 2, 0, 0],
    why: "An electromagnetic deposit without an incoming charged track points to a photon in this simplified case.",
  },
  {
    name: "Muon",
    signal: [1, 1, 1, 1],
    why: "A track continues through the calorimeters into the outer muon chambers.",
  },
  {
    name: "Charged hadron",
    signal: [1, 1, 2, 0],
    why: "A charged track and a strong hadronic deposit support a charged-hadron interpretation.",
  },
  {
    name: "Neutral hadron",
    signal: [0, 1, 2, 0],
    why: "A strong hadronic deposit without a charged track supports a neutral-hadron interpretation.",
  },
];
export function candidates(signal, revealed) {
  return signatures
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => revealed.every((j) => s.signal[j] === signal[j]))
    .map(({ i }) => i);
}
export function circleY(k, x) {
  if (Math.abs(k) < 1e-12) return 0;
  const a = k * x;
  if (Math.abs(a) >= 1) return NaN;
  return (k * x * x) / (1 + Math.sqrt(1 - a * a));
}
export function hitSample(caseIndex) {
  const k = caseIndex === 0 ? 0.16 : -0.13,
    noise = [0.008, -0.009, 0.004, 0.011, -0.006, 0.005];
  const hits = Array.from({ length: 6 }, (_, i) => ({
    id: (caseIndex ? "GACJEF" : "BHFADJ")[i],
    x: 0.25 + i * 0.32,
    y: circleY(k, 0.25 + i * 0.32) + noise[i] * (caseIndex ? -1 : 1),
  }));
  const clutter = [
    { x: 0.47, y: 0.24 },
    { x: 0.82, y: -0.22 },
    { x: 1.22, y: 0.38 },
    { x: 1.64, y: -0.3 },
  ];
  clutter.forEach((h, i) =>
    hits.push({ id: (caseIndex ? "BDHI" : "CEGI")[i], ...h }),
  );
  return hits.sort((a, b) => a.x - b.x);
}
export function fitTrack(hits) {
  if (hits.length < 3) throw Error("Select at least three measurements");
  let best = { residual: Infinity, k: 0 };
  for (let n = -400; n <= 400; n++) {
    const k = n / 1000,
      ss = hits.reduce((s, h) => s + (circleY(k, h.x) - h.y) ** 2, 0),
      residual = Math.sqrt(ss / hits.length);
    if (residual < best.residual) best = { k, residual };
  }
  return {
    ...best,
    radius: Math.abs(best.k) > 0 ? 1 / Math.abs(best.k) : Infinity,
    span: Math.max(...hits.map((h) => h.x)) - Math.min(...hits.map((h) => h.x)),
    count: hits.length,
  };
}
export function boostPair(muons, beta) {
  if (!Number.isFinite(beta) || Math.abs(beta) >= 1)
    throw Error("Speed must be below light speed");
  const E = muons.reduce((s, m) => s + m.E, 0),
    v = ["px", "py", "pz"].map((key) => muons.reduce((s, m) => s + m[key], 0)),
    P = Math.hypot(...v),
    gamma = 1 / Math.sqrt(1 - beta * beta),
    energy = gamma * (E - beta * P),
    momentum = gamma * (P - beta * E);
  return {
    energy,
    momentum,
    mass: Math.sqrt(Math.max(0, E * E - P * P)),
    restBeta: P / E,
    sourceEnergy: E,
    sourceMomentum: P,
  };
}
