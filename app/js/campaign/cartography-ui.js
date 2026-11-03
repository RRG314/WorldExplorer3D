import { createResearchStationShell } from './research-station-shell.js';
import { researchText as esc, researchSelect as select } from '../ui/research-markup.js';
import { CARTOGRAPHY_STUDIES, cartographyTarget } from './cartography-career.js';
import {
  cartographyMapMarkup,
  cartographyLegMarkup,
  cartographyAccessMarkup,
  cartographyReportMarkup,
} from './cartography-report.js';
export const cartographyStationLabel = (id) =>
  ({
    origin: 'Origin O',
    a: 'Survey control A',
    b: 'Survey control B',
    entry: 'Entrance approach E',
  })[id] || 'Survey control';
const objective = (a) =>
  ({
    controls: 'Establish the visible controls',
    'leg-one': 'Measure O → A',
    'leg-two': 'Measure A → B',
    access: 'Inspect the entrance approach',
    reconcile: 'Compare the map with the loaded route',
    publish: 'Publish the reusable route sheet',
    complete: 'Route sheet saved',
  })[a.phase];
export function createCartographyUI(options) {
  const form = (type, body) =>
      `<form id="cartographyFormActive" data-research-form="${type}">${body}</form>`,
    submit = (label) =>
      `<button type="submit" form="cartographyFormActive" class="research-primary">${esc(label)}</button>`;
  function view(a) {
    let body = `<p>${esc(CARTOGRAPHY_STUDIES[a.variantId].question)}</p>`,
      actions = '';
    if (a.phase === 'controls') {
      body +=
        cartographyMapMarkup(a.site) +
        `<p>Stand at O. The virtual range instrument checks both real rendered control markers and intervening geometry. O, A and B are annotations on the existing loaded route; they do not change its streets or access.</p>` +
        form(
          'controls',
          select('north', 'Bearing reference', {
            'true-north': 'True north, clockwise from 0°',
            'magnetic-north': 'Device magnetic north',
          })
        );
      actions = submit('Sight and save controls');
    } else if (['leg-one', 'leg-two'].includes(a.phase)) {
      const r = options.tools.snapshot().window,
        index = a.phase === 'leg-one' ? 0 : 1;
      body +=
        cartographyMapMarkup(a.site, a.legs) +
        `<p>Recording starts within 0.8 m of ${index ? 'A' : 'O'} after closing the panel. Follow the teal mapped route to ${index ? 'B' : 'A'}, finishing within 0.7 m of its marker. The recorder uses your actual supported walk; pausing stops effort. A reload keeps saved legs and requires restarting only the unfinished leg.</p>`;
      if (r?.ready) {
        body +=
          cartographyLegMarkup(r, index, a.site.plan.legs[index]) +
          form(
            'measure',
            select('unit', 'Distance unit', { m: 'Metres', ft: 'Feet' }) +
              select('bearingReference', 'Bearing reference', {
                'true-north': 'True north',
                'magnetic-north': 'Magnetic north',
              })
          );
        actions = submit('Save measured leg');
      } else {
        body += `<p>${esc(r?.reason || 'Return to the previous control to begin this leg.')} ${r ? `${r.activeSeconds.toFixed(1)} active seconds · ${r.samples.length} samples.` : ''}</p>`;
        actions =
          '<button type="button" data-research-action="previous">Guide to previous control</button><button type="button" data-research-close class="research-primary">Continue walking</button>';
      }
    } else if (a.phase === 'access') {
      const r = options.tools.inspection();
      body +=
        cartographyAccessMarkup(r) +
        form(
          'access',
          select('accessClaim', 'What is established?', {
            'virtual-only': 'The loaded virtual approach only',
            'public-access': 'Real public access',
          }) +
            select('limit', 'Access limit', {
              'no-step-free-or-public-access-proof':
                'No proof of step-free travel or real public access',
              'step-free-guaranteed': 'Step-free travel guaranteed',
            })
        );
      actions = submit('Save access inspection');
    } else if (a.phase === 'reconcile') {
      body +=
        cartographyMapMarkup(a.site, a.legs) +
        a.legs.map((r, i) => cartographyLegMarkup(r, i, a.site.plan.legs[i])).join('') +
        form(
          'reconcile',
          select('heightSource', 'Where did the measured heights come from?', {
            'loaded-surface-not-mapped-height': 'Loaded surfaces; mapped elevation not established',
            'mapped-elevation': 'Independent mapped elevations',
          }) +
            select('geometryLimit', 'Does agreement prove map accuracy?', {
              'same-source-not-independent-survey':
                'No: map and rendered streets may share a source',
              'independent-accuracy-proof': 'Yes: it is an independent accuracy test',
            }) +
            select('routeMeaning', 'What should route distance represent?', {
              'connected-route-not-chord': 'The connected route, distinct from the chord',
              'chord-only': 'Always the straight chord',
            })
        );
      actions = submit('Save map comparison');
    } else if (a.phase === 'publish') {
      body +=
        cartographyMapMarkup(a.site, a.legs) +
        cartographyAccessMarkup(a.access) +
        form(
          'publish',
          select('use', 'Route sheet use', {
            'personal-virtual-route': 'Personal virtual route',
            'gps-public-route': 'Verified public GPS route',
          }) +
            select('followUp', 'Before reuse', {
              'recheck-loaded-access': 'Recheck loaded support and access',
              'assume-unchanged': 'Assume nothing changes',
            })
        );
      actions = submit('Publish route sheet');
    } else {
      body += cartographyReportMarkup(a.report).replace(
        'class="cartography-report"',
        'class="cartography-report" open'
      );
      actions =
        '<button type="button" data-research-journal>View Journal</button><button type="button" data-research-next class="research-primary">Choose next study</button>';
    }
    return { title: objective(a), body, actions };
  }
  const shell = createResearchStationShell({
    ...options,
    careerId: 'cartography',
    label: 'Cartographer',
    siteLabel: 'Virtual route survey',
    target: cartographyTarget,
    stationLabel: cartographyStationLabel,
    objective,
    view,
    onCommand(type, fields, a, { perform, close, feedback }) {
      if (type === 'previous') {
        options.tools.guide(a.phase === 'leg-one' ? 'origin' : 'a');
        close();
        return;
      }
      void perform(() => options.tools.prepare({ type, ...fields }));
    },
  });
  const toolbar = document.createElement('div');
  toolbar.className = 'research-instrument-tools';
  toolbar.innerHTML =
    '<button type="button" data-cartography-guide>Guide to control</button><button type="button" data-cartography-previous>Previous control</button><p role="status"></p>';
  toolbar.querySelector('[data-cartography-guide]').onclick = () => {
    options.tools.guide();
    options.requestWorldFocus?.();
  };
  toolbar.querySelector('[data-cartography-previous]').onclick = () => {
    const a = options.getState().active;
    options.tools.guide(a.phase === 'leg-two' ? 'a' : 'origin');
    options.requestWorldFocus?.();
  };
  shell.mountTools(toolbar);
  return {
    ...shell,
    update() {
      shell.update();
      const a = options.getState().active,
        r = options.tools.snapshot().window;
      toolbar.querySelector('p').textContent =
        r?.reason ||
        (['leg-one', 'leg-two'].includes(a.phase)
          ? 'Move close to the previous control to start recording.'
          : 'Control markers stay on the saved route.');
      toolbar.querySelector('[data-cartography-previous]').hidden = ![
        'leg-one',
        'leg-two',
      ].includes(a.phase);
    },
  };
}
