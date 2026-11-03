export const ACCELERATOR_PROTOCOL = 'we3d-collision-experiment-v1';
export const ACCELERATOR_SOURCE = Object.freeze({
  project: 'Collision Lab',
  version: '0.7.0',
  modelsSha256: 'd3182f444320f5818b35f2497621dcadec9c579342e59c0806579a40f38c1af6',
  scienceSha256: '9fbc8d18e39e98bd33a379d990aa4d08c917cc2157bfe13a5261ba35d7f5ae29',
  dataUrl: '/app/assets/data/cms/dimuon-2010b.json',
  dataBytes: 10279577,
  dataSha256: '9b75ec65e71f48b36837ce8153197f6690a5b8ef26af1c27f1afa4f2a2700e5c',
});
export const ACCELERATOR_STUDIES = Object.freeze({
  campaign: Object.freeze({
    id: 'campaign',
    label: 'From Beam to Evidence',
    question:
      'How do controlled beam settings, detector clues and a recorded charge comparison become a reproducible result?',
    caseIndex: 0,
    momentumGeV: 0.9,
    radiusMeters: 2,
    rfTargetMeV: 32,
    spread: 1,
    signalIndex: 2,
    cutGeV: 20,
  }),
  'wider-bunch': Object.freeze({
    id: 'wider-bunch',
    label: 'Keep the Wider Bunch',
    question:
      'Can a wider, higher-momentum training beam be retained while its recorded event is interpreted separately?',
    caseIndex: 1,
    momentumGeV: 1.8,
    radiusMeters: 3,
    rfTargetMeV: 28,
    spread: 1.25,
    signalIndex: 0,
    cutGeV: 20,
  }),
  'selection-control': Object.freeze({
    id: 'selection-control',
    label: 'Hold the Selection Fixed',
    question:
      'What changes under a stricter recorded momentum cut when the opposite- and same-charge samples use exactly the same selection?',
    caseIndex: 0,
    momentumGeV: 0.9,
    radiusMeters: 2,
    rfTargetMeV: 32,
    spread: 1,
    signalIndex: 1,
    cutGeV: 30,
  }),
});
export function acceleratorStudy(id = 'campaign') {
  if (!Object.hasOwn(ACCELERATOR_STUDIES, id))
    throw Error('Choose a supported Collision Lab study.');
  return ACCELERATOR_STUDIES[id];
}
