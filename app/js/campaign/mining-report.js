import { researchText as esc } from '../ui/research-markup.js';
import { MINING_LIMITS } from './mining-formation.js';
const kg = (g) => (g / 1000).toFixed(3) + ' kg';
const validLine = (line) =>
  Array.isArray(line?.samples) &&
  line.samples.length === 5 &&
  line.samples.every(
    (s) =>
      [s?.massGrams, s?.copperGrams].every(Number.isSafeInteger) &&
      s.massGrams > 0 &&
      s.copperGrams >= 0 &&
      s.copperGrams <= s.massGrams &&
      typeof s.magnetic === 'boolean'
  );
export function miningAssayMarkup(assays = {}) {
  const faces = ['a', 'b', 'c'].filter((id) => validLine(assays[id]));
  return `<div class='mining-table mining-assays'><table><caption>Five modeled assay cells per face · copper mass fraction</caption><thead><tr><th scope='col'>Line point</th>${faces.map((id) => `<th scope='col'>Face ${id.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${[
    0, 1, 2, 3, 4,
  ]
    .map(
      (i) =>
        `<tr><th scope='row'>${i}</th>${faces
          .map((id) => {
            const sample = assays[id].samples[i];
            return `<td>${((sample.copperGrams / sample.massGrams) * 100).toFixed(1)}%</td>`;
          })
          .join('')}</tr>`
    )
    .join(
      ''
    )}<tr><th scope='row'>Magnetic</th>${faces.map((id) => `<td>${assays[id].samples.some((sample) => sample.magnetic) ? 'Yes' : 'No'}</td>`).join('')}</tr></tbody></table></div><p>Teaching cutoff ${(MINING_LIMITS.oreCutoffPermille / 10).toFixed(1)}% copper by mass. The dark magnetic control is not automatically ore. Probing does not remove stock; only the accepted cut subtracts material. These are geometry-bound virtual assays of this authored formation, not real chemical analyses or a reserve estimate.</p>`;
}
export function miningLedgerMarkup(p, fabrication = null) {
  if (
    !p ||
    ![
      'inputGrams',
      'materialGrams',
      'wasteGrams',
      'tailingsGrams',
      'refiningResidueGrams',
      'concentrateGrams',
      'concentrateCopperGrams',
      'oreGrams',
    ].every((k) => Number.isSafeInteger(p[k]) && p[k] >= 0) ||
    !p.settings ||
    ![
      'concentrationRecoveryPermille',
      'concentrateGradePermille',
      'refiningRecoveryPermille',
    ].every((k) => Number.isFinite(p.settings[k])) ||
    (fabrication &&
      !['productGrams', 'remainingMaterialGrams'].every(
        (k) => Number.isSafeInteger(fabrication[k]) && fabrication[k] >= 0
      ))
  )
    return '';
  const backfill = p.wasteGrams + p.tailingsGrams + p.refiningResidueGrams,
    metal = fabrication ? fabrication.remainingMaterialGrams : p.materialGrams,
    order = fabrication?.productGrams || 0;
  return `<section class='mining-ledger'><h3>Conserved processing ledger</h3><svg class='mining-flow' viewBox='0 0 440 240' role='img' aria-label='Measured batch splits into refined material and retained waste; material supplies the yard order with the rest retained'><title>Every gram retained</title><g fill='none' stroke='#89bdb1' stroke-width='2'><path d='M220 48V75H100V98M220 75H340V98M100 137V162H55V185M100 162H195V185'/></g><g fill='#203b34' stroke='#89bdb1'><rect x='132' y='8' width='176' height='40' rx='6'/><rect x='10' y='98' width='180' height='40' rx='6'/><rect x='250' y='98' width='180' height='40' rx='6'/><rect x='6' y='185' width='130' height='45' rx='6'/><rect x='148' y='185' width='130' height='45' rx='6'/></g><g fill='#f0eedc' text-anchor='middle' font-size='18'><text x='220' y='32'>Input ${kg(p.inputGrams)}</text><text x='100' y='114'>Refined material</text><text x='100' y='132'>${kg(p.materialGrams)}</text><text x='340' y='114'>Retained waste</text><text x='340' y='132'>${kg(backfill)}</text><text x='71' y='203'>Yard order</text><text x='71' y='220'>${kg(order)}</text><text x='213' y='203'>Retained metal</text><text x='213' y='220'>${kg(metal)}</text></g></svg><div class='mining-table'><table><caption>Original input and processing fractions</caption><tbody>${[
    ['Delivered input', p.inputGrams],
    ['Sorted waste', p.wasteGrams],
    ['Ore to processor', p.oreGrams],
    ['Intermediate concentrate', p.concentrateGrams],
    ['Copper in concentrate', p.concentrateCopperGrams],
    ['Retained tailings', p.tailingsGrams],
    ['Retained refining residue', p.refiningResidueGrams],
    ['Refined material', p.materialGrams],
    ['Yard order allocation', order],
    ['Remaining refined material', metal],
  ]
    .map(([label, g]) => `<tr><th scope='row'>${esc(label)}</th><td>${kg(g)}</td></tr>`)
    .join(
      ''
    )}</tbody></table></div><p>Input ${kg(p.inputGrams)} = retained waste ${kg(backfill)} + refined material ${kg(p.materialGrams)}. Material ${kg(p.materialGrams)} = order ${kg(order)} + remaining metal ${kg(metal)}. Intermediate concentrate is processed onward; it is not an additional final output.</p><p>Declared teaching rules: ${(p.settings.concentrationRecoveryPermille / 10).toFixed(0)}% copper recovery into ${(p.settings.concentrateGradePermille / 10).toFixed(0)}% concentrate, then ${(p.settings.refiningRecoveryPermille / 10).toFixed(0)}% refining recovery. Every loss remains in a named retained fraction. These rules do not predict a real plant's recovery.</p></section>`;
}
export function miningReportMarkup(r) {
  if (
    r?.schemaVersion !== 1 ||
    r.truthType !== 'authored-quarry-mass-ledger' ||
    !miningLedgerMarkup(r.processing, r.fabrication) ||
    !r.fabrication ||
    !r.restoration ||
    !r.delivery ||
    !r.site ||
    !r.formation ||
    ![r.formation.version, r.formation.seed].every(Number.isSafeInteger) ||
    !r.plan ||
    !Array.isArray(r.plan.cellIds) ||
    !Number.isFinite(r.plan.volumeCubicMeters) ||
    !Number.isFinite(r.cut?.effort?.activeSeconds) ||
    !Number.isFinite(r.delivery.distanceMeters) ||
    !Array.isArray(r.delivery.route) ||
    !Number.isSafeInteger(r.delivery.massGrams) ||
    !Number.isSafeInteger(r.restoration.backfillGrams) ||
    !r.faces ||
    !r.assays ||
    !['a', 'b', 'c'].every((id) => validLine(r.assays[id])) ||
    !Object.values(r.assays).every(validLine)
  )
    return '';
  return `<details class='mining-report'><summary>Quarry ledger · ${esc(r.title)}</summary><p>${esc(r.site.name)} · authored teaching formation, version ${r.formation.version}, seed ${r.formation.seed}. Source cells: ${r.plan.cellIds.map(esc).join(', ')}. Bounded cut ${r.plan.volumeCubicMeters.toFixed(3)} m³; marked supports and return route retained.</p>${miningAssayMarkup(r.assays)}<p>The actual carrier delivered ${kg(r.delivery.massGrams)} after ${r.delivery.distanceMeters.toFixed(2)} m of recorded movement through the return control. Four wheel contacts and the original receiving-pan reading remain in this record. Cutter contact and motor positions were retained over ${r.cut.effort.activeSeconds.toFixed(2)} active seconds.</p>${miningLedgerMarkup(r.processing, r.fabrication)}<p>The ${kg(r.fabrication.productGrams)} base plate is installed on the training yard's return-route marker. ${kg(r.restoration.backfillGrams)} of retained material fills the bounded worked cell; the remaining refined lot stays in the ledger. Backfill and supports are a modeled exhibit restoration, not a real geotechnical or environmental certification.</p><p>No real mineral occurrence, mine access, ore reserve, commodity price or shared-stock reward is established. The Backpack holds the fabrication record, not a second copy of the material. Ordinary location exploration and commerce retain their own rules.</p><details><summary>Original evidence and settings</summary><p>${Object.keys(r.faces).length} inspected faces · ${Object.values(r.assays).reduce((n, a) => n + a.samples.length, 0)} original assay readings · ${r.delivery.route.length} supported carrier positions. Masses are retained in integer grams; copper and total mass both balance. Reopening the completed yard does not produce another batch or reward.</p></details></details>`;
}
