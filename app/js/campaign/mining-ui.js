import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import { MINING_JOBS, MINING_LIMITS } from './mining-formation.js';
import { miningTarget } from './mining-career.js';
import { miningAssayMarkup, miningLedgerMarkup, miningReportMarkup } from './mining-report.js';
export const miningStationLabel = (id) =>
  ['a', 'b', 'c'].includes(id)
    ? 'Quarry face ' + id.toUpperCase()
    : id === 'dispatch'
      ? 'Return-route control'
      : 'Receiving scale and processor';
const objective = (a) =>
  ({
    inspect: 'Inspect face ' + miningTarget(a).toUpperCase(),
    assay: 'Measure the five-point line at face ' + miningTarget(a).toUpperCase(),
    plan: 'Mark a supported extraction volume',
    cut: 'Operate the cutter against the marked cells',
    sort: 'Separate by the retained assays',
    deliver: 'Deliver the loaded carrier through the return control',
    process: 'Process the weighed batch',
    fabricate: 'Complete the useful yard order',
    restore: 'Stabilize and backfill the worked cell',
    publish: 'Publish the conserved quarry ledger',
    complete: 'Quarry ledger saved',
  })[a.phase];
const kg = (g) => (g / 1000).toFixed(3) + ' kg';
export function createMiningUI(options) {
  const form = (type, body) =>
      `<form id='miningFormActive' data-research-form='${type}'>${body}</form>`,
    submit = (label) =>
      `<button type='submit' form='miningFormActive' class='research-primary'>${esc(label)}</button>`;
  function reading(r) {
    if (!r?.ready) return '';
    const data = r.data;
    if (r.method.startsWith('assay-')) return miningAssayMarkup({ [data.faceId]: data });
    if (r.method === 'cut')
      return `<p>${data.contacts.length} marked cells contacted by the actual cutter over ${data.effort.activeSeconds.toFixed(2)} active seconds. Tool positions and rotor angles are retained.</p>`;
    return `<p>Receiving scale: ${kg(data.massGrams)} · ${data.route.length} supported carrier positions · ${data.distanceMeters.toFixed(2)} m. All four actual wheel contacts meet the pan. The original weighed batch and route stay unchanged on a failed save.</p>`;
  }
  function view(a) {
    const r = options.tools.snapshot().window;
    let body = `<p>${esc(MINING_JOBS[a.variantId].question)}</p>`,
      actions = '';
    if (a.phase === 'inspect') {
      body += `<p>Inspect all three exposed faces before marking a cut. Face ${miningTarget(a).toUpperCase()} must actually be visible in the world camera. Look for pale host rock, copper-bearing streaks and the contrasting dark magnetic band. A color or magnetic anomaly alone does not establish ore.</p><p>This is an authored above-ground quarry exhibit. No mapped ground is removed, and no real mineral occurrence or excavation permission is inferred.</p>`;
      actions = `<button type='button' data-research-action='inspect' class='research-primary'>Record visible face</button>`;
    } else if (a.phase === 'assay' || a.phase === 'cut') {
      const assay = a.phase === 'assay';
      body += assay
        ? `<p>The working rail probes five equal modeled cells across the same row. Each cell represents ${kg(MINING_LIMITS.cellMassGrams)} at the declared teaching bulk density. Probing does not remove material. Watch the physical probe move between five points during five active seconds. Blocked contacts and paused frames do not count.</p>`
        : `<p>Marked cells: ${a.plan.cellIds.map(esc).join(', ')} · ${kg(a.plan.massGrams)} · ${a.plan.volumeCubicMeters.toFixed(3)} m³. Marked floor, roof and side supports stay in place. The actual cutter must contact every selected cell while its motor runs for four active seconds.</p>`;
      if (r?.ready) {
        body += reading(r);
        actions = `<button type='button' data-research-action='${assay ? 'assay' : 'cut'}' class='research-primary'>${assay ? 'Save measured line' : 'Save cut record'}</button>`;
      } else {
        if (r)
          body += `<p>${r.activeSeconds.toFixed(2)} / ${r.targetSeconds} active seconds · ${esc(r.reason)}</p>`;
        actions = `<button type='button' data-research-action='begin' class='research-primary'>${r?.interrupted || r?.complete ? 'Restart instrument' : r ? 'Continue instrument' : assay ? 'Place line and measure' : 'Run cutter'}</button>`;
      }
    } else if (a.phase === 'plan') {
      body +=
        miningAssayMarkup(a.assays) +
        `<p>Choose one face and contiguous middle-row cells. Each cell is 0.2 × 0.2 × 0.2 m. The marked floor, roof and side columns are protected. Carrier capacity is ${kg(MINING_LIMITS.carrierCapacityGrams)}. The return corridor is checked against actual support and solid obstacles before the cut is accepted.</p>` +
        form(
          'plan',
          select('faceId', 'Working face', { a: 'Face A', b: 'Face B', c: 'Face C' }) +
            `<fieldset class='mining-selection'><legend>Middle-row cut cells</legend>${[1, 2, 3].map((i) => `<label><input type='checkbox' name='take${i}'>Column ${i} · 20 kg</label>`).join('')}</fieldset>`
        );
      actions = submit('Mark bounded cut');
    } else if (a.phase === 'sort') {
      body +=
        miningAssayMarkup(a.assays) +
        `<p>Separate the cut by its measured copper fraction. Retain every waste cell; none disappears. This training process uses a ${(MINING_LIMITS.oreCutoffPermille / 10).toFixed(1)}% cutoff. Magnetism alone does not make a cell ore.</p>` +
        form(
          'sort',
          `<fieldset class='mining-selection'><legend>Cells to the ore compartment</legend>${a.plan.cellIds
            .map((id, i) => {
              const [face, , column] = id.split(':'),
                s = a.assays[face].samples[Number(column)];
              return `<label><input type='checkbox' name='ore${i}' value='${esc(id)}'>${esc(id)} · ${((s.copperGrams / s.massGrams) * 100).toFixed(1)}% copper</label>`;
            })
            .join('')}</fieldset>`
        );
      actions = submit('Separate and load carrier');
    } else if (a.phase === 'deliver') {
      body += `<p>Loaded batch: ${kg(a.separation.inputGrams)}. Attach the physical carrier beside the cut face, pass the return-route control, and pull the load across the receiving pan. The walk uses the existing ground and collision rules. Reaching this panel cannot substitute for moving the carrier.</p><p>Approach the pan from the west return control and walk across it. The final gate accepts the load only when all four wheels are actually on the scale.</p>`;
      if (r?.ready) {
        body += reading(r);
        actions = `<button type='button' data-research-action='deliver' class='research-primary'>Save weighed delivery</button>`;
      } else {
        body += `<p>Close this panel and return to the loaded carrier to attach it. Your accepted assays, cut and separated batch are already saved.</p>`;
        actions = `<button type='button' data-research-close>Return to carrier</button>`;
      }
    } else if (a.phase === 'process') {
      body += `<p>Original pan reading ${kg(a.delivery.massGrams)}. The processor receives ${kg(a.separation.oreGrams)} of assayed ore; ${kg(a.separation.wasteGrams)} of sorted waste stays in the ledger.</p><p>Run the declared teaching separation: 80% copper recovery into 25% concentrate, then 90% refining recovery. Tailings and refining residue remain contained. Compare the outputs before allocating any material.</p>`;
      actions = `<button type='button' data-research-action='process' class='research-primary'>Process weighed batch</button>`;
    } else if (a.phase === 'fabricate') {
      body +=
        miningLedgerMarkup(a.processing) +
        `<p>The yard order needs a 1.000 kg cast base plate for its return-route marker. Allocate that mass from the refined lot. The rest remains recorded material; this course produces no shared stock, tradable commodity or credits.</p>`;
      actions = `<button type='button' data-research-action='fabricate' class='research-primary'>Cast and install marker base</button>`;
    } else if (a.phase === 'restore') {
      body +=
        miningLedgerMarkup(a.processing, a.fabrication) +
        `<p>Return to the worked face. Retain its supports, seal ${kg(a.processing.inputGrams - a.processing.materialGrams)} of the contained waste fractions in the bounded exhibit cells, and check the carrier route and installed return marker. This is modeled restoration, not a real safety certification.</p>`;
      actions = `<button type='button' data-research-action='restore' class='research-primary'>Backfill and stabilize worked cell</button>`;
    } else if (a.phase === 'publish') {
      body +=
        miningLedgerMarkup(a.processing, a.fabrication) +
        `<p>The worked cells are backfilled and the useful yard marker is installed. Publish the original assays, cutter contacts, walked carrier route, receiving weight and full material ledger.</p>` +
        form(
          'publish',
          select('limit', 'Scope of this result', {
            'authored-formation-not-real-ore-reserve':
              'Authored quarry exercise; no real ore reserve or excavation permission',
            'proved-real-reserve': 'A real ore reserve was proved',
          })
        );
      actions = submit('Publish quarry ledger');
    } else {
      body += miningReportMarkup(a.report).replace(
        "class='mining-report'",
        "class='mining-report' open"
      );
      actions = `<button type='button' data-research-journal>View Journal</button><button type='button' data-research-next class='research-primary'>Choose next job</button>`;
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'mining',
    label: 'Mining engineer',
    target: miningTarget,
    objective,
    stationLabel: miningStationLabel,
    view,
    onCommand(type, fields, a, { perform, close, feedback }) {
      if (type === 'begin') {
        try {
          const r = options.tools.snapshot().window;
          options.tools.start({ restart: !!(r?.interrupted || (r?.complete && !r.ready)) });
          close();
        } catch (e) {
          feedback(e.message);
        }
        return;
      }
      const command =
        type === 'plan'
          ? {
              type,
              cellIds: [1, 2, 3]
                .filter((i) => fields['take' + i])
                .map((i) => fields.faceId + ':1:' + i),
            }
          : type === 'sort'
            ? {
                type,
                oreCellIds: Object.entries(fields)
                  .filter(([k]) => k.startsWith('ore'))
                  .map(([, v]) => v),
              }
            : type === 'publish'
              ? { type, limit: fields.limit }
              : { type };
      void perform(() => options.tools.prepare(command));
    },
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar mining-instruments';
  toolbar.setAttribute('aria-label', 'Quarry instruments');
  toolbar.innerHTML = `<p data-mining-effort></p><div><button type='button' data-mining-start>Start instrument</button><button type='button' data-mining-open class='research-primary'>Open measured record</button></div><p role='status' aria-live='polite'></p>`;
  shell.mountTools(toolbar);
  let disposed = false;
  toolbar.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const status = toolbar.querySelector('[role=status]');
    status.textContent = '';
    try {
      if (b.hasAttribute('data-mining-start')) {
        const r = options.tools.snapshot().window;
        options.tools.start({ restart: !!(r?.interrupted || (r?.complete && !r.ready)) });
        options.requestWorldFocus?.();
      } else shell.open();
    } catch (error) {
      status.textContent = error.message;
    }
    update();
  };
  function update() {
    shell.update();
    const a = options.getState().active,
      r = options.tools.snapshot().window;
    toolbar.hidden = disposed || !['assay', 'cut', 'deliver'].includes(a.phase) || shell.isOpen();
    if (toolbar.hidden) return;
    toolbar.querySelector('[data-mining-effort]').textContent = r
      ? `${r.activeSeconds.toFixed(2)} active s · ${r.reason}`
      : a.phase === 'deliver'
        ? 'Return to the loaded carrier beside the cut face.'
        : 'Operate the physical instrument, then retain its measured record.';
    const start = toolbar.querySelector('[data-mining-start]');
    start.textContent =
      r?.interrupted || (r?.complete && !r.ready)
        ? 'Restart instrument'
        : a.phase === 'deliver'
          ? 'Attach loaded carrier'
          : r
            ? 'Continue instrument'
            : 'Start instrument';
    start.disabled = !!r?.ready;
    toolbar.querySelector('[data-mining-open]').disabled = !r?.ready;
  }
  return {
    ...shell,
    update,
    dispose() {
      disposed = true;
      shell.dispose();
      toolbar.remove();
    },
  };
}
