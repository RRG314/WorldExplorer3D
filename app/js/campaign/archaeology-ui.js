import {ARCHAEOLOGY_STUDIES, archaeologyMeasurements, archaeologyTarget} from './archaeology-career.js';
import {createResearchStationShell} from './research-station-shell.js';
import {drawArchaeologySection, drawArchaeologyPlate, drawTrainingArtifact} from './archaeology-illustration.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const words = value => String(value || '').replaceAll('-', ' ');
const select = (name, label, choices) => `<label>${escape(label)}<select name="${name}" required><option value="">Choose…</option>${Object.entries(choices).map(([id, title]) => `<option value="${escape(id)}">${escape(title)}</option>`).join('')}</select></label>`;
const form = (type, content) => `<form id="archaeologyFormActive" data-research-form="${type}">${content}</form>`;
const submit = (label, disabled = false) => `<button class="research-primary" type="submit" form="archaeologyFormActive"${disabled ? ' disabled' : ''}>${escape(label)}</button>`;
const methodButton = (contextId, method, done) => `<button type="button" data-research-action="test" data-context-id="${contextId}" data-method="${method}"${done ? ' disabled' : ''}>${done ? 'Recorded' : method === 'material' ? 'Examine material' : 'Inspect wear'}</button>`;
const labels = {feature: 'the visible feature', survey: 'the survey instrument', trench: 'the training trench', bench: 'the catalog bench'};
export const archaeologyObjective = active => ({brief: 'Inspect the visible feature', survey: 'Lay a grid and measure two relationships', excavate: `Expose and document Context ${ARCHAEOLOGY_STUDIES[active.variantId].layers[active.layerIndex]?.id || ''}`, lab: 'Examine both contextual finds', interpretation: 'Interpret the site and plan conservation', complete: 'Site report and exhibition plate saved'})[active.phase];

export function createArchaeologyUI(options) {
  const {getState} = options;
  function view(active) {
    const study = ARCHAEOLOGY_STUDIES[active.variantId], layer = study.layers[active.layerIndex];
    let title = archaeologyObjective(active), body = '', actions = '';
    if (active.phase === 'brief') {
      body = `<p>${escape(study.brief)}</p><p>This freestanding training trench does not cut the real terrain. Mapped heritage sites remain observation-only.</p><p>These field methods practise your character’s Surveying and Excavation proficiency.</p>` +
        form('inspect', select('feature', 'What visible feature are you inspecting?', {'stone-line': 'A low stone line', 'cut-profile': 'A cut with contrasting fill', drain: 'A stone-lined channel'}));
      actions = submit('Record feature observation');
    } else if (active.phase === 'survey') {
      body = '<p>Use a one-metre grid. Tape and compass readings describe this virtual site’s actual station positions.</p>';
      if (!active.grid) {
        body += form('grid', select('orientation', 'Grid orientation', {north: 'North aligned', east: 'East aligned'}) + select('unit', 'Grid interval', {metre: 'One metre', foot: 'One foot'}));
        actions = submit('Lay the survey grid');
      } else {
        const target = active.measurements.feature ? 'bench' : 'feature', reading = archaeologyMeasurements(active.site)[target];
        body += `<section class="research-map"><h3>Tape and compass</h3><p>${target === 'feature' ? escape(study.featureLabel) : 'Catalog bench'} relative to the trench</p><p class="archaeology-reading"><strong>${reading.distanceMeters.toFixed(1)} m</strong><span>${reading.bearingDegrees.toFixed(0)}° from north</span></p><small>Virtual station survey · one-metre grid · north arrow is fixed to the site plan</small></section>`;
        body += form('measure', `<input type="hidden" name="target" value="${target}">` + select('relation', 'Record the measured relationship', {'north-of': 'North of the trench', 'east-of': 'East of the trench', 'south-east-of': 'South-east of the trench', 'south-of': 'South of the trench', 'west-of': 'West of the trench'}));
        actions = submit('Measure and record relationship');
      }
    } else if (active.phase === 'excavate') {
      const depth = active.excavation[layer.id] || 0, context = active.contexts[layer.id];
      title = `Context ${layer.id} · ${layer.name}`;
      body = `<canvas class="archaeology-section" aria-label="Training section with two contexts and grid cells"></canvas><p>${escape(layer.name)} · ${escape(words(layer.fabric))} · ${escape(words(layer.colour))}</p>`;
      if (depth < layer.thicknessCm) {
        body += `<p>${depth} of ${layer.thicknessCm} cm exposed in this context. Remove one bounded 5 cm spit. Use a brush as the find becomes exposed.</p>` +
          form('excavate', select('tool', 'Controlled excavation tool', {trowel: 'Trowel · bounded spit', brush: 'Soft brush · final exposure'}));
        actions = submit('Expose the next 5 cm');
      } else if (!context) {
        body += `<p>The ${escape(layer.artifact.name.toLowerCase())} is exposed. Record its context before lifting it. Grid cell ${layer.cell}; orientation ${escape(words(layer.orientation))}.</p>` +
          form('context', `<label>Context number<input name="contextId" inputmode="numeric" required maxlength="3" autocomplete="off"></label>` +
            select('cell', 'Grid cell', {A1: 'A1', B1: 'B1'}) + select('fabric', 'Sediment description', Object.fromEntries(study.layers.map(row => [row.fabric, words(row.fabric)]))) +
            select('orientation', 'Find orientation', {'east-west': 'East–west', 'north-south': 'North–south'}) + select('relationship', 'Stratigraphic relationship', {'above-next': 'Covers the next context', 'below-previous': 'Underlies the recorded upper context'}));
        actions = submit('Save context before lifting');
      } else {
        body += `<p>Context ${layer.id} is recorded with its grid, layer relationship and orientation.</p>` +
          form('collect', select('packing', 'Prepare the find for lifting', {'labelled-box': 'Padded box with context label', 'supported-block': 'Retain sediment in a supported block cradle'}));
        actions = submit('Pack and lift contextual find');
      }
    } else if (active.phase === 'lab') {
      body = '<p>Keep each find with its context. Examine material and wear before identifying it. A find alone does not establish the date or function of the site.</p><div class="research-evidence-grid">';
      for (const row of study.layers) {
        body += `<section class="research-evidence"><h3>Context ${row.id} · ${row.cell}</h3><canvas class="archaeology-artifact" data-kind="${row.artifact.kind}" data-wear="${row.artifact.wear}" aria-label="Magnified virtual ${escape(row.artifact.name)}"></canvas><p>${escape(row.artifact.name)}</p>`;
        for (const method of ['material', 'wear']) body += methodButton(row.id, method, !!active.tests[`${row.id}:${method}`]) + (active.tests[`${row.id}:${method}`] ? `<p>${escape(words(active.tests[`${row.id}:${method}`].result))}</p>` : '');
        body += '</section>';
      }
      body += '</div>' + form('classify', study.layers.map(row => select('material' + row.id, `Material · Context ${row.id}`, {ceramic: 'Ceramic', glass: 'Glass', wood: 'Wood', metal: 'Metal', uncertain: 'Uncertain'})).join(''));
      actions = submit('Save contextual catalog', !study.layers.every(row => ['material', 'wear'].every(method => active.tests[`${row.id}:${method}`])));
    } else if (active.phase === 'interpretation') {
      body = '<p>Use your measured plan, recorded sequence and contextual catalog. Keep the supported alternative; “need more evidence” is a valid result.</p>' +
        `<canvas class="archaeology-section" aria-label="Recorded training stratigraphy and catalog"></canvas>` +
        form('report', select('interpretation', 'Site interpretation', {
          'later-cover-over-use': 'Later rubble covers a previously used surface', 'mixed-fill-limits-dating': 'Mixed fill limits dating of the earlier surface',
          'different-preservation-conditions': 'Different contexts preserved different materials', 'exact-year-and-owner': 'An exact year and owner are established', 'need-more-evidence': 'Need more evidence · retain an inconclusive interpretation'
        }) + select('alternative', 'Keep an alternative explanation', {
          'household-or-workshop': 'Household or workshop use remains possible', 'displacement-or-reuse': 'Displacement or reuse remains possible', 'function-remains-uncertain': 'The object’s function remains uncertain'
        }) + select('conservation', 'Conservation plan for these virtual finds', {
          'dry-padded-separate': 'Keep stable finds dry, padded, labelled and separate', 'supported-block-specialist-care': 'Retain the fragile block and support for specialist care', 'scrub-and-mix': 'Scrub and mix all finds together'
        }));
      actions = submit('Save site report and conservation plan');
    } else {
      title = 'Site report saved';
      body = `<h3>${escape(study.label)} · complete</h3><p>${escape(active.report.conclusion)}</p><canvas class="archaeology-plate" aria-label="Saved contextual catalog and exhibition plate"></canvas><p>Your plate is ready to display at your personal workspace. The original context records and supported finds remain in Journal and Backpack.</p>`;
      actions = '<button type="button" data-research-journal>View Journal</button><button type="button" class="research-primary" data-research-next>Choose next case</button>';
    }
    return {title, body, actions};
  }
  function afterRender(body, active) {
    const section = body.querySelector('.archaeology-section'); if (section) drawArchaeologySection(section, active);
    const plate = body.querySelector('.archaeology-plate'); if (plate) drawArchaeologyPlate(plate, {title: ARCHAEOLOGY_STUDIES[active.variantId].label, contexts:active.contexts,classifications:active.classifications,tests:active.tests,...active.report});
    for (const canvas of body.querySelectorAll('.archaeology-artifact')) {
      canvas.width = 360; canvas.height = 150; const c = canvas.getContext('2d'); c.fillStyle = '#e5ddc8'; c.fillRect(0, 0, 360, 150); drawTrainingArtifact(c, canvas.dataset.kind, 180, 75, 180,canvas.dataset.wear);
    }
  }
  function onCommand(type, fields, active, {perform}) {
    const study = ARCHAEOLOGY_STUDIES[active.variantId];
    if (type === 'measure') {const reading=archaeologyMeasurements(active.site)[fields.target];void perform({type, target: fields.target, relation: fields.relation,distanceMeters:reading?.distanceMeters,bearingDegrees:reading?.bearingDegrees});}
    else if (type === 'classify') void perform({type, classifications: Object.fromEntries(study.layers.map(row => [row.id, fields['material' + row.id]]))});
    else if (type === 'test') void perform({type, contextId: fields.contextId, method: fields.method});
    else void perform({type, ...fields});
  }
  return createResearchStationShell({...options, careerId: 'archaeology', label: 'Archaeologist', target: archaeologyTarget, objective: archaeologyObjective,
    stationLabel: id => labels[id], view, onCommand, afterRender});
}
