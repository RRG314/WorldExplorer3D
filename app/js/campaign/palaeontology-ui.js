import { PALAEONTOLOGY_STUDIES, palaeontologyTarget } from './palaeontology-career.js';
import { createResearchStationShell } from './research-station-shell.js';
import { drawFossil, drawFossilPlate } from './palaeontology-illustration.js';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const words = (value) => String(value || '').replaceAll('-', ' ');
const select = (name, label, choices) =>
  `<label>${escape(label)}<select required name="${name}"><option value="">Choose…</option>${Object.entries(
    choices
  )
    .map(([id, text]) => `<option value="${id}">${escape(text)}</option>`)
    .join('')}</select></label>`;
const form = (type, content) =>
  `<form id="fossilFormActive" data-research-form="${type}">${content}</form>`;
const submit = (label, disabled = false) =>
  `<button type="submit" class="research-primary" form="fossilFormActive"${disabled ? ' disabled' : ''}>${label}</button>`;
const forms = {
  'planispiral-shell': 'Coiled shell in one plane',
  'veined-leaf': 'Leaf with branching veins',
  'paired-valves': 'Two matching shell valves'
};
const structures = {
  'coils-in-one-plane': 'Coils in a single plane',
  'branching-veins': 'Branching veins',
  'two-matching-valves': 'Two matching valves'
};
const surfaces = {
  'curved-ribs': 'Curved ribs',
  'thin-impression': 'Thin impression',
  'broken-radial-ribs': 'Broken edges and radial ribs'
};
export const palaeontologyObjective = (active) =>
  ({
    brief: 'Inspect the exposed fossil form',
    photographs: 'Photograph the layer and orientation',
    preparation: 'Expose, support and lift the training cast',
    comparison: 'Compare morphology and sediment',
    interpretation: 'Interpret the fossil bed with its limits',
    complete: 'Fossil report and museum plate saved'
  })[active.phase];
export function createPalaeontologyUI(options) {
  function view(active) {
    const study = PALAEONTOLOGY_STUDIES[active.variantId];
    let body = '',
      actions = '';
    if (active.phase === 'brief') {
      body =
        `<p>${escape(study.brief)}</p><p>The cast and enclosing formation are freestanding training furniture. No fossil occurrence or collecting permission is inferred at this location. These methods practise your Geology and Excavation proficiency.</p>` +
        form('inspect', select('form', 'Which form is visible?', forms));
      actions = submit('Record exposed form');
    } else if (active.phase === 'photographs') {
      body =
        '<p>Use the ordinary walking camera. Take a wider view of the layer from 2.3–5.5 m, then move closer for a clear orientation photograph from 0.7–2.25 m. Keep the cast intact.</p><ul>' +
        ['layer', 'orientation']
          .map(
            (slot) =>
              `<li>${slot === 'layer' ? 'Layer and surrounding sediment' : 'Cast axis against the north marker'} · ${active.captures[slot] ? 'Photograph saved' : 'Photograph required'}</li>`
          )
          .join('') +
        '</ul>';
      if (!active.captures.layer || !active.captures.orientation)
        actions =
          '<button type="button" class="research-primary" data-research-action="frame">Return to camera</button>';
      else {
        body += form(
          'orientation',
          `<label>Layer label<input name="layer" required maxlength="2" autocomplete="off"></label>` +
            select('orientation', 'Cast axis against the north marker', {
              'east-west': 'East–west',
              'north-south': 'North–south',
              'north-east-south-west': 'North-east–south-west'
            })
        );
        actions = submit('Save orientation card');
      }
    } else if (active.phase === 'preparation') {
      body = `<p>Both photographs and the orientation card are saved. Work only on the two bounded matrix patches; retain diagnostic ribs, veins and edges.</p><canvas class="fossil-specimen" aria-label="Magnified invented fossil form"></canvas>`;
      if (active.preparation.length < 2) {
        body +=
          `<p>${active.preparation.length === 0 ? 'Begin with the outer matrix.' : 'The outer matrix is exposed; the thin margin needs a soft tool.'}</p>` +
          form(
            'prepare',
            select('zone', 'Working zone', {
              'outer-matrix': 'Outer matrix',
              margin: 'Cast margin',
              'diagnostic-face': 'Diagnostic surface'
            }) +
              select('tool', 'Preparation tool', {
                'blunt-probe': 'Blunt matrix probe',
                'soft-brush': 'Soft brush',
                polisher: 'Surface polisher'
              })
          );
        actions = submit('Expose bounded patch');
      } else if (!active.support) {
        body +=
          `<p>${study.kind === 'leaf' ? 'The thin impression needs its supporting sediment block.' : 'The stable cast can travel in a padded tray with its surrounding matrix.'} Keep its layer and orientation label.</p>` +
          form(
            'support',
            select('support', 'Support for this specimen', {
              'padded-matrix-tray': 'Padded matrix tray',
              'supported-block': 'Retain supported sediment block',
              unsupported: 'Lift without support'
            })
          );
        actions = submit('Support and label specimen');
      } else {
        body += `<p>Support saved: ${escape(words(active.support.method))}. The unaltered surface, layer, orientation and photographs stay attached to the specimen.</p>`;
        actions =
          '<button type="button" class="research-primary" data-research-action="lift">Lift supported specimen</button>';
      }
    } else if (active.phase === 'comparison') {
      body =
        '<p>Use the actual prepared specimen in your Backpack. Compare features rather than rarity. Reference diagrams are original training illustrations, not museum scans.</p><div class="research-evidence-grid">' +
        Object.entries(forms)
          .map(
            ([id, label]) =>
              `<section class="research-evidence"><h3>${escape(label)}</h3><canvas class="fossil-reference" data-form="${id}" aria-label="${escape(label)} reference"></canvas></section>`
          )
          .join('') +
        '</div><div class="fossil-methods">';
      for (const [method, label] of [
        ['structure', 'Examine structure'],
        ['surface', 'Inspect surface'],
        ['sediment', 'Compare enclosing sediment']
      ])
        body += `<button type="button" data-research-action="examine" data-method="${method}"${active.tests[method] ? ' disabled' : ''}>${active.tests[method] ? 'Recorded' : label}</button>${active.tests[method] ? `<p>${escape(words(active.tests[method].result))}</p>` : ''}`;
      body +=
        '</div>' +
        form(
          'classify',
          select('structure', 'Diagnostic structure', structures) +
            select('surface', 'Diagnostic surface', surfaces) +
            select('classification', 'Supported identification', {
              'coiled-mollusc': 'Coiled mollusc form',
              'plant-impression': 'Plant impression',
              'bivalve-form': 'Bivalve form',
              uncertain: 'Uncertain'
            })
        );
      actions = submit('Save morphology comparison', Object.keys(active.tests).length !== 3);
    } else if (active.phase === 'interpretation') {
      body =
        `<p>Recorded sediment: ${escape(words(active.tests.sediment.result))}. Combine it with the fossil’s structure, surface and orientation. A burial site need not be the original living habitat.</p>` +
        form(
          'report',
          select('interpretation', 'Supported environment', {
            'marine-deposition': 'Marine deposition',
            'quiet-water-with-plant-input': 'Quiet water with plant input',
            'transported-in-moving-water': 'Transport in moving water',
            inconclusive: 'Inconclusive · retain the evidence'
          }) +
            select('limitation', 'Limit on this result', {
              'precise-depth-and-age-unknown': 'Exact depth and age remain unknown',
              'leaf-may-be-transported': 'The leaf may have been transported',
              'burial-not-living-habitat': 'Burial need not equal living habitat',
              'exact-species-and-year': 'Exact species and year established'
            })
        );
      actions = submit('Save fossil report and museum plate');
    } else {
      body = `<h3>${escape(study.label)} · complete</h3><p>${escape(active.report.conclusion)}</p><canvas class="fossil-plate" aria-label="Saved fossil context and palaeoenvironment plate"></canvas><p>Your nontradeable training specimen remains in Backpack. The photos and complete preparation record are saved with the Journal report; its plate can be displayed at your personal workspace.</p>`;
      actions =
        '<button type="button" data-research-journal>View Journal</button><button type="button" data-research-next>Choose next case</button>';
    }
    return { title: palaeontologyObjective(active), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'palaeontology',
    label: 'Palaeontologist',
    target: palaeontologyTarget,
    objective: palaeontologyObjective,
    stationLabel: (id) => (id === 'bed' ? 'Fossil bed' : 'Preparation bench'),
    view,
    afterRender(body, active) {
      const study = PALAEONTOLOGY_STUDIES[active.variantId];
      for (const canvas of body.querySelectorAll('.fossil-specimen,.fossil-reference')) {
        canvas.width = 360;
        canvas.height = 240;
        const c = canvas.getContext('2d');
        c.fillStyle = '#e5d9be';
        c.fillRect(0, 0, 360, 240);
        drawFossil(
          c,
          canvas.dataset.form === 'veined-leaf'
            ? 'leaf'
            : canvas.dataset.form === 'paired-valves'
              ? 'paired-shell'
              : canvas.dataset.form
                ? 'coiled-shell'
                : study.kind,
          180,
          110,
          220
        );
        c.fillStyle = '#243a32';
        c.font = '13px system-ui';
        c.fillText('Invented training representation · magnified', 12, 229);
      }
      const plate = body.querySelector('.fossil-plate');
      if (plate)
        drawFossilPlate(plate, {
          title: study.label,
          ...active,
          form: active.observation.form,
          ...active.report
        });
    },
    onCommand(type, fields, active, { perform, close }) {
      if (type === 'frame') {
        options.tools?.enter?.();
        close();
        return;
      }
      const command = { type, ...fields };
      delete command.researchAction;
      if (type === 'examine') command.method = fields.method;
      void perform(command);
    }
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar';
  toolbar.setAttribute('aria-label', 'Field camera');
  toolbar.innerHTML =
    '<strong>Field photographs · before preparation</strong><p>Centre the subject with a clear view, then press the shutter.</p><button type="button" data-field-eye-level>Eye-level camera</button><div></div><p role="status" aria-live="polite"></p>';
  shell.mountTools(toolbar);
  let disposed = false,
    cursor = '';
  const status = toolbar.querySelector('[role=status]');
  toolbar.onclick = async (event) => {
    if (event.target.closest('[data-field-eye-level]')) {
      options.tools?.enter?.();
      options.requestWorldFocus?.();
      return;
    }
    const button = event.target.closest('[data-field-shutter]');
    if (!button || options.tools?.busy) return;
    status.textContent = 'Taking photograph…';
    try {
      await options.tools.take(button.dataset.fieldShutter);
      status.textContent = 'Photograph saved with its field context.';
      shell.refresh();
    } catch (error) {
      status.textContent = error.message || 'The photograph could not save. Try again.';
    }
    update();
  };
  function update() {
    shell.update();
    const active = options.getState().active;
    toolbar.hidden = disposed || active.phase !== 'photographs' || shell.isOpen();
    if (toolbar.hidden) return;
    const next = Object.keys(active.captures).sort().join(',');
    if (next !== cursor || !toolbar.querySelector('[data-field-shutter]')) {
      toolbar.querySelector('div').innerHTML = ['layer', 'orientation']
        .map(
          (slot) =>
            `<button type="button" data-field-shutter="${slot}"${active.captures[slot] ? ' disabled' : ''}>${active.captures[slot] ? 'Saved' : slot === 'layer' ? 'Photograph layer · wider view' : 'Photograph orientation · close view'}</button>`
        )
        .join('');
      cursor = next;
    }
    for (const button of toolbar.querySelectorAll('button'))
      button.disabled = !!active.captures[button.dataset.fieldShutter] || !!options.tools?.busy;
  }
  return {
    ...shell,
    update,
    dispose() {
      disposed = true;
      shell.dispose();
      toolbar.remove();
    }
  };
}
