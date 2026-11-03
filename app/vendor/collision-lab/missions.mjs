export const missions = [
  {
    id: "bend",
    title: "Bend the beam",
    verb: "Steer",
    number: "01",
    cases: 2,
    minutes: "3 min",
    topic: "Magnetic fields",
    intro:
      "Make a charged beam turn through the target. The beam has a fixed momentum; you control the magnet.",
    goal: (c) =>
      c
        ? "Guide the higher-momentum beam through the target on the other side."
        : "Guide the beam through the marked target.",
    hint: "A stronger field makes a tighter turn. Reverse the field to reverse the turn. Changing the magnet does not add energy.",
    action: "Send test bunch",
    carry: "You can steer a beam without speeding it up.",
    model:
      "An ideal transverse magnetic field. No energy loss or field variation is included.",
    formula: "r = pT / (0.299792458 × |qB|)",
    source: "https://home.cern/how-accelerator-works/",
  },
  {
    id: "rf",
    title: "Find the right phase",
    verb: "Accelerate",
    number: "02",
    cases: 2,
    minutes: "3 min",
    topic: "Electric fields",
    intro:
      "Electric fields push the beam through eight cavities. Choose when it arrives to give it the right energy gain.",
    goal: (c) =>
      `Reach ${c ? 28 : 32} MeV after eight cavities, starting from 20 MeV.`,
    hint: "At 0° the beam receives the biggest push. At 90° it gains nothing. Beyond 90° the cavity takes energy away.",
    action: "Send bunch through cavities",
    carry: "Electric fields add energy; timing sets the size of the push.",
    model:
      "A proton crosses eight ideal 2 MV cavities at a prescribed phase. Timing feedback, radiation and beam spread are omitted.",
    formula: "ΔK = qV cos(φ) per cavity; 0° is the accelerating crest.",
    source:
      "https://home.web.cern.ch/science/engineering/accelerating-radiofrequency-cavities/",
  },
  {
    id: "focus",
    title: "Keep the beam together",
    verb: "Focus",
    number: "03",
    cases: 2,
    minutes: "4 min",
    topic: "Beam optics",
    intro:
      "A beam is a bundle of particles, not a single line. Keep it narrow in both directions as it passes through four magnetic lenses.",
    goal: (c) =>
      c
        ? "The incoming beam is wider. Keep every path, with horizontal width below 3.2 mm and vertical width below 1 mm."
        : "Keep all 64 paths inside the beam pipe and both exit widths below 2.5 mm.",
    hint: "One quadrupole squeezes one direction and spreads the other. Alternate the magnets, then adjust both strengths. Too strong can be as bad as too weak.",
    action: "Test the beam",
    carry: "Alternating magnets can confine both transverse directions.",
    model:
      "Linear, thin-lens quadrupoles and straight drift spaces. These settings describe a small model beamline, not the LHC lattice. Width means RMS position.",
    formula: "Drift: x → x + Lx′. Lens: x′ → x′ − kx; y′ → y′ + ky.",
    source:
      "https://emetral.web.cern.ch/Lund2013Course/TBD_AcceleratorCourse_Lund2013_EM.pdf",
  },
  {
    id: "signals",
    title: "Follow the signal",
    verb: "Identify",
    number: "04",
    cases: 5,
    minutes: "4 min",
    topic: "Detector evidence",
    intro:
      "A detector gives you clues, not a photograph of a particle. Open readouts until you can distinguish the possibilities.",
    goal: () =>
      "Identify the particle from the measurements you choose to inspect.",
    hint: "An electromagnetic deposit alone cannot distinguish an electron from a photon. Ask the tracker. A signal in the outer muon chambers is another useful clue.",
    action: "Identify particle",
    carry: "Particle identity is an inference from several kinds of evidence.",
    model:
      "Five idealized response patterns, not recorded detector hits. Real identification includes inefficiency, backgrounds, shower fluctuations and ambiguous cases.",
    formula:
      "Compare only the readouts you have actually opened. More than one matching pattern means you need another measurement.",
    source: "https://cms.cern/news/detector-overview",
  },
  {
    id: "track",
    title: "Recover a track",
    verb: "Reconstruct",
    number: "05",
    cases: 2,
    minutes: "4 min",
    topic: "Track fitting",
    intro:
      "Some measurements belong together; others are unrelated. Choose six points that form a smooth track, then fit them.",
    goal: () =>
      "Fit six measurements across the tracker, keeping the fit error below 15 mm.",
    hint: "Look for a smooth curve starting at the origin. The fit error measures how far the points sit from the curve. A distant point can pull the fitted curve away from the others. Select or remove points using the diagram or their letter buttons.",
    action: "Fit selected hits",
    carry:
      "A fitted track is an estimate made from measurements, with residuals you can inspect.",
    model:
      "Generated positions with small fixed perturbations and unrelated points, in an ideal transverse field. The origin and initial direction are known. This is not a full CMS reconstruction.",
    formula:
      "Circular trajectory: y = kx² / (1 + √(1 − k²x²)). Fit k by minimizing squared position residuals.",
    source: "https://cms.cern/detector",
  },
  {
    id: "mass",
    title: "Weigh a collision",
    verb: "Measure",
    number: "06",
    cases: 2,
    minutes: "4 min",
    topic: "Energy and momentum",
    intro:
      "Now work with two muons recorded by CMS. Move with the pair until its total momentum vanishes. Its remaining energy reveals its mass.",
    goal: () =>
      "Find an observer speed where the pair’s net momentum is close to zero, then make a measurement.",
    hint: "Move along the pair’s combined momentum. If the momentum becomes negative, you have gone too fast. The mass stays the same in every frame.",
    action: "Measure pair",
    carry:
      "Invariant mass links measurements made in different reference frames.",
    model:
      "A Lorentz boost along the pair’s summed momentum, calculated from the recorded, rounded four-vectors. You change the observer, never the recorded event.",
    formula: "E′ = γ(E − βP), P′ = γ(P − βE), M² = E² − P²; c = 1.",
    source: "https://opendata.cern.ch/record/700",
  },
  {
    id: "evidence",
    title: "Build the evidence",
    verb: "Investigate",
    number: "07",
    cases: 3,
    minutes: "5 min",
    topic: "Populations and controls",
    intro:
      "One event can be interesting. A reproducible comparison tells you much more. Apply a clear selection to the complete sample.",
    goal: (c) =>
      c === 0
        ? "Record opposite-charge pairs where each muon has at least 20 GeV/c of transverse momentum."
        : c === 1
          ? "Keep the same momentum cut, but record same-charge pairs as a comparison."
          : "Choose the conclusion your evidence supports.",
    hint: "Hold the momentum cut at 20 while changing charge. A feature near the Z mass is useful evidence, but these counts alone do not measure discovery significance.",
    action: "Record sample",
    carry:
      "Your result includes the selection, comparison sample and limits of the conclusion.",
    model:
      "All 100,000 rows of the preselected CMS 2010B dimuon sample. It is an educational skim, not an unbiased collision dataset or a complete discovery analysis.",
    formula:
      "M = √((ΣE)² − (Σpx)² − (Σpy)² − (Σpz)²). Both muons must pass the same pT cut.",
    source: "https://opendata.cern.ch/record/700",
  },
];
export const defaults = (id) =>
  ({
    bend: { field: 0.65, direction: 1 },
    rf: { phase: 100 },
    focus: { k1: 0.5, k2: 0.5, alternating: false },
    signals: { revealed: [], choice: "" },
    track: { selected: [] },
    mass: { beta: 0 },
    evidence: { cut: 0, charge: "all", conclusion: "" },
  })[id];
