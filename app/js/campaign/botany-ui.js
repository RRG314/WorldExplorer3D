import { showResearchPhoto } from './research-photo-viewer.js';
import {
  BOTANY_PLANTS,
  BOTANY_STUDIES,
  botanyTarget,
  botanyPlotComparison
} from './botany-career.js';
import { createResearchStationShell } from './research-station-shell.js';
import { botanyText as esc, botanyPlantPlate, botanyCoverTable } from './botany-report.js';
export const botanyStationLabel = (id) =>
  id === 'bench'
    ? 'Comparison bench'
    : id === 'plot'
      ? 'Marked plant plot'
      : 'Plant bed ' + id.toUpperCase();
export const botanyObjective = (a) =>
  ({
    photographs: 'Photograph the first plant’s structures',
    plants: `Compare plant ${['A', 'B', 'C'][a.plantIndex] || ''} and its sensors`,
    'mark-plot': 'Mark and sample the fixed plot',
    'choose-season': 'Declare the return season',
    revisit: 'Return and sample the same points',
    planting: 'Match a planting to measured conditions',
    'choose-followup': 'Declare the follow-up season',
    followup: 'Sample the planted and untreated plots',
    report: 'Review the restoration result',
    complete: 'Plant plate and plot saved'
  })[a.phase];
const select = (name, label, options) =>
  `<label>${esc(label)}<select name="${name}" required><option value="">Choose…</option>${Object.entries(
    options
  )
    .map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`)
    .join('')}</select></label>`;
const form = (type, body) =>
  `<form id="botanyFormActive" data-research-form="${type}">${body}</form>`;
const submit = (label) =>
  `<button type="submit" form="botanyFormActive" class="research-primary">${esc(label)}</button>`;
export function createBotanyUI(options) {
  function view(a) {
    const study = BOTANY_STUDIES[a.variantId],
      id = ['a', 'b', 'c'][a.plantIndex],
      savedPhoto = a.captures[`plant-${id}`];
    let body = `<p>${esc(study.question)}</p><p class="botany-season">Declared virtual season: <strong>${esc(a.currentSeason)}</strong></p>`,
      actions;
    if (['photographs', 'plants'].includes(a.phase)) {
      body += `<p>At bed ${esc(id.toUpperCase())}, frame the leaf arrangement and its supporting fronds, branches or blades. These are authored training varieties; this exercise makes no wild species or edibility identification.</p><p>${savedPhoto ? 'Diagnostic photograph saved.' : 'A clear diagnostic photograph is required.'} The five-centimetre probe and light sensor provide relative virtual indices.</p>`;
      const pending = options.tools.snapshot().reading;
      if (pending?.plantId === id)
        body += `<p>Last reading: light ${pending.light} · moisture ${pending.moisture}. Both are relative indices, not real weather or soil measurements.</p>`;
      if (savedPhoto) {
        body += form(
          'measure-plant',
          select('form', 'Visible plant structure', {
            'divided-fronds': 'Divided fronds',
            'branched-broadleaves': 'Branched stems with broad leaves',
            'linear-blades': 'Narrow linear blades'
          })
        );
        actions = submit('Read sensors and save comparison');
      } else
        actions =
          '<button type="button" class="research-primary" data-research-action="world">Use field camera</button>';
      if (Object.keys(a.plants).length) body += botanyPlantPlate(a.plants, a.captures);
    } else if (a.phase === 'mark-plot') {
      body +=
        botanyPlantPlate(a.plants, a.captures) +
        '<p>Retain this location and its sixteen fixed points on each 1.6 m quadrat. A pin records vegetation only when its ray meets an opaque leaf or blade; otherwise it records exposed soil. This sparse sample is not a complete plant census.</p>' +
        form(
          'mark-plot',
          select('comparison', 'Measured boundary', {
            'light-and-moisture-contrast': 'Light and moisture both differ',
            'light-only': 'Only light differs',
            'identical-conditions': 'Conditions are identical'
          })
        );
      actions = submit('Mark plot and lower point frames');
    } else if (['choose-season', 'choose-followup'].includes(a.phase)) {
      const follow = a.phase === 'choose-followup',
        season = follow ? study.afterSeason : study.visitSeason;
      body +=
        `<p>Return to the bench before declaring <strong>${esc(season)}</strong>. This changes only the training beds’ authored simulation. Your saved visits keep their original measurements.</p>` +
        form(
          follow ? 'declare-followup' : 'declare-season',
          select('virtualSeason', 'Declared return season', { [season]: season })
        );
      actions = submit('Declare virtual season');
    } else if (['revisit', 'followup'].includes(a.phase)) {
      body +=
        botanyCoverTable(a.plotReadings) +
        '<p>At the marked plot, lower the frames onto exactly the same sixteen points. Keep both the untreated comparison and treatment results, including zero hits.</p>';
      actions = `<button type="button" class="research-primary" data-research-action="${a.phase}">Lower point frames and save visit</button>`;
    } else if (a.phase === 'planting') {
      body +=
        '<p>Read the treatment bed’s instruments, then match a training variety to both of its stated tolerance bands. Place one virtual planting at a soil point inside the treatment quadrat; the comparison stays untreated.</p>';
      const pending = options.tools.snapshot().reading;
      if (pending?.virtualSeason === a.currentSeason)
        body += `<p>Last plot reading: light <strong>${pending.light}</strong> · moisture <strong>${pending.moisture}</strong> (relative indices). Probe depth ${pending.depthCm} cm.</p>`;
      body += `<ul>${Object.entries(BOTANY_PLANTS)
        .map(
          ([id, p]) =>
            `<li>${esc(id.toUpperCase())} · ${esc(p.label)}: light ${p.lightRange.join('–')}, moisture ${p.moistureRange.join('–')}</li>`
        )
        .join('')}</ul>`;
      body += form(
        'plant',
        select(
          'variety',
          'Training variety',
          Object.fromEntries(
            Object.entries(BOTANY_PLANTS).map(([id, p]) => [id, id.toUpperCase() + ' · ' + p.label])
          )
        ) +
          select(
            'cell',
            'Unoccupied treatment point',
            Object.fromEntries(
              a.plotReadings.visit.treatment.points
                .filter((p) => p.kind === 'soil')
                .map((p) => [
                  p.index,
                  `Point ${p.index + 1} · row ${Math.floor(p.index / 4) + 1}, column ${(p.index % 4) + 1}`
                ])
            )
          )
      );
      actions =
        '<button type="button" data-research-action="read">Read plot instruments</button>' +
        submit('Read conditions and place planting');
    } else if (a.phase === 'report') {
      const comparison = botanyPlotComparison(a);
      body +=
        botanyCoverTable(a.plotReadings) +
        `<p>Treatment change: ${comparison.treatmentDelta} percentage points. Untreated change: ${comparison.controlDelta}. Difference in change: ${comparison.differenceInChange} percentage points.</p>` +
        form(
          'report',
          select('result', 'Supported result', {
            'increased-relative-to-control': 'Cover increased relative to the untreated comparison',
            'no-demonstrated-gain': 'No demonstrated gain relative to the untreated comparison'
          }) +
            select('limitation', 'Limit on this study', {
              'one-virtual-plot-not-a-field-prediction':
                'One virtual plot cannot predict real restoration',
              'no-real-water-budget-measured': 'No real water budget was measured',
              'cover-is-not-species-diversity': 'Plant cover does not establish species diversity'
            }) +
            select('followUp', 'Reproducible follow-up', {
              'repeat-the-same-points': 'Repeat both quadrats at the same points',
              'move-the-grid': 'Move the grid to greener patches'
            })
        );
      actions = submit('Save plant plate and restoration report');
    } else {
      body +=
        `<p>${esc(a.report.conclusion)}</p>` +
        botanyPlantPlate(a.plants, a.captures) +
        botanyCoverTable(a.plotReadings) +
        '<p>This marked plot and its saved planting can be revisited from Activities. Your original measurements stay in Journal.</p>';
      actions =
        '<button type="button" data-research-journal>View Journal</button><button type="button" data-research-next>Choose next study</button>';
    }
    return { title: botanyObjective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'botany',
    label: 'Botanist',
    target: botanyTarget,
    objective: botanyObjective,
    stationLabel: botanyStationLabel,
    view,
    afterRender: (body) => {
      body.onclick = (event) => {
        const button = event.target.closest('[data-research-photo]');
        if (button) void showResearchPhoto(button, options.store);
      };
    },
    onCommand(type, fields, a, { perform, close, render, feedback }) {
      if (type === 'world') {
        options.tools.enter();
        close();
        return;
      }
      if (type === 'read') {
        try {
          options.tools.read();
          render();
        } catch (error) {
          feedback(error.message);
        }
        return;
      }
      void perform(() => options.tools.prepare({ type, ...fields }));
    }
  });
  const toolbar = document.createElement('aside');
  toolbar.className = 'field-photo-toolbar botany-instruments';
  toolbar.setAttribute('aria-label', 'Plant field instruments');
  toolbar.innerHTML =
    '<p data-botany-instruction></p><div><button type="button" data-botany-eye>Eye-level view</button><button type="button" data-botany-photo class="research-primary">Photograph plant</button><button type="button" data-botany-read>Read plant instruments</button></div><p role="status" aria-live="polite"></p>';
  shell.mountTools(toolbar);
  let disposed = false;
  toolbar.onclick = async (event) => {
    const button = event.target.closest('button');
    if (!button || options.tools.busy) return;
    const status = toolbar.querySelector('[role=status]');
    status.textContent = '';
    try {
      if (button.hasAttribute('data-botany-eye')) options.tools.enter();
      else if (button.hasAttribute('data-botany-read')) {
        const r = options.tools.read();
        status.textContent = `Light ${r.light} · moisture ${r.moisture} · relative indices · ${r.depthCm} cm probe depth.`;
      } else {
        const a = options.getState().active;
        await options.tools.photo(`plant-${['a', 'b', 'c'][a.plantIndex]}`);
        status.textContent = 'Diagnostic photograph saved.';
        shell.refresh();
      }
      options.requestWorldFocus?.();
    } catch (error) {
      status.textContent = error.message || 'The instrument could not save. Try again.';
    }
    update();
  };
  function update() {
    shell.update();
    const a = options.getState().active,
      id = ['a', 'b', 'c'][a.plantIndex];
    toolbar.hidden = disposed || !['photographs', 'plants'].includes(a.phase) || shell.isOpen();
    if (toolbar.hidden) return;
    toolbar.querySelector('[data-botany-instruction]').textContent =
      `Bed ${id.toUpperCase()} · frame its visible leaf, branch or blade structures.`;
    toolbar.querySelector('[data-botany-photo]').hidden = !!a.captures[`plant-${id}`];
    toolbar.querySelector('[data-botany-read]').hidden = !a.captures[`plant-${id}`];
    for (const button of toolbar.querySelectorAll('button')) button.disabled = options.tools.busy;
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
