import { canonicalFieldRecord } from './field-study-contract.js';
// Authored teaching formation. Grades, magnetism, uniform bulk density and
// recovery rules describe this exhibit, not a real deposit or mining advice.
export const MINING_FORMATION_VERSION = 1;
export const MINING_OFFSETS = Object.freeze({
  a: { x: -7, z: -5 },
  b: { x: 0, z: -6 },
  c: { x: 7, z: -5 },
  dispatch: { x: -6, z: 5 },
  bench: { x: 6, z: 5 },
});
export const MINING_JOBS = Object.freeze({
  campaign: Object.freeze({
    variantId: 'campaign',
    label: 'From Vein to Material',
    seed: 26110301,
    question: 'Which exposed zone supplies the order after assay, separation and processing?',
  }),
  'narrow-vein': Object.freeze({
    variantId: 'narrow-vein',
    label: 'Follow the Narrow Vein',
    seed: 26110302,
    question: 'How much barren material does an oversized cut add to a narrow vein?',
  }),
  'mixed-batch': Object.freeze({
    variantId: 'mixed-batch',
    label: 'Separate Before Processing',
    seed: 26110303,
    question:
      'Can the waste fraction be identified and retained without losing track of the batch?',
  }),
});
export const MINING_LIMITS = Object.freeze({
  cellMeters: 0.2,
  bulkDensityKgM3: 2500,
  cellMassGrams: 20000,
  carrierCapacityGrams: 60000,
  oreCutoffPermille: 20,
  concentrationRecoveryPermille: 800,
  concentrateGradePermille: 250,
  refiningRecoveryPermille: 900,
  orderGrams: 1000,
});
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
function job(id) {
  if (!Object.hasOwn(MINING_JOBS, id)) throw Error('Choose a supported quarry job.');
  return MINING_JOBS[id];
}
export function miningFormation(variantId = 'campaign') {
  const spec = job(variantId),
    next = random(spec.seed),
    cells = [];
  for (const faceId of ['a', 'b', 'c'])
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 5; column++) {
        let grade = faceId === 'a' ? 8 : faceId === 'b' ? 65 : 3;
        if (variantId === 'narrow-vein' && faceId === 'b') grade = column === 2 ? 85 : 5;
        if (variantId === 'mixed-batch' && faceId === 'b') grade = column % 2 ? 8 : 75;
        grade += Math.floor(next() * 3) - 1;
        const protectedCell = column === 0 || column === 4 || row !== 1;
        cells.push({
          id: faceId + ':' + row + ':' + column,
          faceId,
          row,
          column,
          protected: protectedCell,
          volumeCubicMeters: 0.008,
          massGrams: MINING_LIMITS.cellMassGrams,
          copperGrams: (MINING_LIMITS.cellMassGrams * grade) / 1000,
          magnetic: faceId === 'c',
          features:
            faceId === 'b'
              ? grade >= 20
                ? 'visible-copper-bearing-streak'
                : 'pale-host-rock'
              : faceId === 'c'
                ? 'dark-magnetic-band'
                : 'pale-disseminated-grains',
        });
      }
  return {
    version: MINING_FORMATION_VERSION,
    variantId,
    seed: spec.seed,
    truthType: 'authored-virtual-quarry',
    cells,
  };
}
function selectedCells(formation, ids) {
  if (
    formation?.version !== MINING_FORMATION_VERSION ||
    !Array.isArray(ids) ||
    !ids.length ||
    new Set(ids).size !== ids.length
  )
    throw Error('Retain distinct cells from this formation.');
  const canonical = miningFormation(formation.variantId);
  if (formation.seed !== canonical.seed) throw Error('The formation seed changed.');
  // Resolve against the reviewed formation, never caller-provided masses.
  const selected = ids.map((id) => canonical.cells.find((c) => c.id === id));
  if (selected.some((c) => !c)) throw Error('The selected cell is outside the authored formation.');
  return selected;
}
export function miningAssay(formation, ids) {
  const cells = selectedCells(formation, ids),
    massGrams = cells.reduce((n, c) => n + c.massGrams, 0),
    copperGrams = cells.reduce((n, c) => n + c.copperGrams, 0);
  return {
    cellIds: cells.map((c) => c.id),
    massGrams,
    copperGrams,
    gradePermille: (copperGrams / massGrams) * 1000,
    magnetic: cells.some((c) => c.magnetic),
    truthType: 'modeled-virtual-assay',
  };
}
export function miningCutPlan(formation, ids, { returnRouteClear = false } = {}) {
  const cells = selectedCells(formation, ids);
  if (cells.some((c) => c.protected))
    throw Error('Leave the marked floor, roof and side supports intact.');
  if (new Set(cells.map((c) => c.faceId)).size !== 1) throw Error('Mark one bounded face volume.');
  const columns = cells.map((c) => c.column).sort((a, b) => a - b);
  if (columns.some((v, i) => i && v !== columns[i - 1] + 1))
    throw Error('Use one contiguous marked cut.');
  if (returnRouteClear !== true) throw Error('Keep the marked carrier return route clear.');
  const assay = miningAssay(formation, ids);
  if (assay.massGrams > MINING_LIMITS.carrierCapacityGrams)
    throw Error('The marked cut exceeds the carrier capacity.');
  return {
    ...assay,
    formationVersion: formation.version,
    seed: formation.seed,
    faceId: cells[0].faceId,
    volumeCubicMeters: cells.length * 0.008,
    supportsPreserved: true,
    returnRouteClear: true,
  };
}
function grams(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw Error('Retain a nonnegative whole-gram stock value.');
  return n;
}
export function miningSeparate(formation, ids, oreIds) {
  const cells = selectedCells(formation, ids);
  if (
    !Array.isArray(oreIds) ||
    new Set(oreIds).size !== oreIds.length ||
    oreIds.some((id) => !ids.includes(id))
  )
    throw Error('Keep the ore selection inside the cut batch.');
  const expected = cells
    .filter((c) => (c.copperGrams / c.massGrams) * 1000 >= MINING_LIMITS.oreCutoffPermille)
    .map((c) => c.id);
  if (expected.length !== oreIds.length || expected.some((id) => !oreIds.includes(id)))
    throw Error('Separate by the retained assays, not by magnetism alone.');
  const ore = cells.filter((c) => oreIds.includes(c.id)),
    waste = cells.filter((c) => !oreIds.includes(c.id)),
    sum = (xs, key) => xs.reduce((n, c) => n + c[key], 0);
  return {
    sourceCellIds: cells.map((c) => c.id),
    oreCellIds: ore.map((c) => c.id),
    oreGrams: sum(ore, 'massGrams'),
    oreCopperGrams: sum(ore, 'copperGrams'),
    wasteGrams: sum(waste, 'massGrams'),
    wasteCopperGrams: sum(waste, 'copperGrams'),
    inputGrams: sum(cells, 'massGrams'),
    inputCopperGrams: sum(cells, 'copperGrams'),
  };
}
export function miningProcess(formation, cutIds, oreIds) {
  const separated = miningSeparate(formation, cutIds, oreIds),
    ore = grams(separated.oreGrams),
    copper = grams(separated.oreCopperGrams),
    concentrateCopperGrams = Math.floor(
      (copper * MINING_LIMITS.concentrationRecoveryPermille) / 1000
    ),
    concentrateGrams = Math.ceil(
      (concentrateCopperGrams * 1000) / MINING_LIMITS.concentrateGradePermille
    );
  if (!ore || !copper || concentrateGrams > ore)
    throw Error('The assayed ore cannot supply this process batch.');
  const materialGrams = Math.floor(
      (concentrateCopperGrams * MINING_LIMITS.refiningRecoveryPermille) / 1000
    ),
    tailingsGrams = ore - concentrateGrams,
    tailingsCopperGrams = copper - concentrateCopperGrams,
    refiningResidueGrams = concentrateGrams - materialGrams,
    refiningResidueCopperGrams = concentrateCopperGrams - materialGrams;
  const output = {
    ...separated,
    source: { version: formation.version, variantId: formation.variantId, seed: formation.seed },
    settings: { ...MINING_LIMITS },
    concentrateGrams,
    concentrateCopperGrams,
    tailingsGrams,
    tailingsCopperGrams,
    materialGrams,
    refiningResidueGrams,
    refiningResidueCopperGrams,
    truthType: 'virtual-quarry-processing-ledger',
  };
  if (
    output.inputGrams !==
      output.wasteGrams + tailingsGrams + materialGrams + refiningResidueGrams ||
    output.inputCopperGrams !==
      output.wasteCopperGrams + tailingsCopperGrams + materialGrams + refiningResidueCopperGrams
  )
    throw Error('The processing ledger does not conserve mass.');
  return output;
}
export function miningFabricate(ledger, orderGrams = MINING_LIMITS.orderGrams) {
  const source = ledger?.source;
  if (source?.version !== MINING_FORMATION_VERSION)
    throw Error('Retain the original conserved processing ledger.');
  const expected = miningProcess(
    miningFormation(source.variantId),
    ledger.sourceCellIds,
    ledger.oreCellIds
  );
  if (canonicalFieldRecord(ledger) !== canonicalFieldRecord(expected))
    throw Error('The material lot no longer matches its source and processing ledger.');
  grams(orderGrams);
  if (
    orderGrams !== MINING_LIMITS.orderGrams ||
    !Number.isSafeInteger(ledger?.materialGrams) ||
    ledger.materialGrams < orderGrams
  )
    throw Error('Retain enough refined material for the specified yard order.');
  return {
    product: 'quarry-survey-marker-base',
    productGrams: orderGrams,
    remainingMaterialGrams: ledger.materialGrams - orderGrams,
    fabricationWasteGrams: 0,
    source: structuredClone(ledger.source),
    truthType: 'virtual-yard-fabrication',
  };
}
