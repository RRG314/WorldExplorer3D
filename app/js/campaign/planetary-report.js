import { lunarStudyReport } from '../planetary/lunar-study-records.js';
import { LUNAR_STUDIES, LUNAR_SURVEY_SOURCES } from '../planetary/lunar-survey.js';
import { researchText as esc } from '../ui/research-markup.js';
export function planetaryReportMarkup(event) {
  const accepted = lunarStudyReport(event);
  if (!accepted) return '';
  const m = accepted.metadata,
    id = m.surveyVariantId || 'campaign',
    method =
      m.strategy === 'observe'
        ? 'Optical record · no material removed'
        : 'Sealed virtual analog returned';
  return `<details class="planetary-report"><summary>Lunar comparison · ${esc(LUNAR_STUDIES[id].label)}</summary><p>Two authored field sites on the existing LROC-derived Apollo 11 terrain. ${esc(method)}. The field descriptions compare game analogs; they do not identify a real Apollo specimen.</p><div class="research-field-plate"><article><h3>Site A · mare context</h3><p>Dark, fine-grained basalt analog. The working volcanic interpretation is consistent with cooled material. Composition and age remain unmeasured.</p></article><article><h3>Site B · fragment field</h3><p>Fragments in a finer matrix in the breccia analog. Compare impact reworking with Site A; appearance alone cannot establish age or exact composition.</p></article></div><section><h3>Matched method and return</h3><p>${esc(method)} at both sites. ${id === 'planned-return' ? 'The records from both sorties were recovered to Solis Reach.' : 'All four station records and the final Pathfinder recovery are retained at Solis Reach.'} ${id === 'alternate-method' ? 'This assignment uses the other method from the original comparison; the first report remains saved.' : id === 'planned-return' ? 'Site A was recovered and the kit recharged before a separate sortie to Site B. Both recovery identities are retained.' : 'The two sites form a cautious baseline, with unresolved questions kept in the report.'}</p><p>Analysis: ${esc(String(m.outcomeId || 'cautious-baseline').replaceAll('-', ' '))}. Virtual mineral names describe authored analogs, and do not imply chemical analysis or an Apollo collection.</p></section><section><h3>Orbital and collection context</h3><p><a href="${esc(LUNAR_SURVEY_SOURCES[0])}" target="_blank" rel="noopener">LROC Apollo 11 digital terrain model</a> supplies orbital topography. The individual station rocks are authored game objects. <a href="${esc(LUNAR_SURVEY_SOURCES[1])}" target="_blank" rel="noopener">NASA Astromaterials 3D sample catalog</a> is a separate comparison resource; no real sample was collected or identified by this game.</p></section><p>Return to Earth through the Pod Bay and display this field book at your personal workspace. Reviewing it beside the desk records this assignment’s homecoming.</p></details>`;
}
export function drawPlanetaryPlate(canvas, event) {
  if (!lunarStudyReport(event)) return false;
  const c = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    m = event.metadata,
    scale = w / 512;
  c.save();
  c.scale(scale, scale);
  c.fillStyle = '#eee8d7';
  c.fillRect(0, 0, 512, h / scale);
  c.fillStyle = '#213b3e';
  c.font = 'bold 25px system-ui';
  c.fillText('LUNAR COMPARISON', 26, 39);
  c.font = '15px system-ui';
  c.fillText(LUNAR_STUDIES[m.surveyVariantId || 'campaign'].label, 26, 65);
  for (const [i, label] of ['A · FINE GRAINS', 'B · FRAGMENT RICH'].entries()) {
    const x = 28 + i * 245;
    c.strokeStyle = '#6f8580';
    c.strokeRect(x, 84, 224, 181);
    c.fillStyle = '#213b3e';
    c.font = 'bold 16px system-ui';
    c.fillText(label, x + 10, 108);
    c.fillStyle = i ? '#8a8980' : '#525d60';
    c.beginPath();
    c.moveTo(x + 35, 218);
    c.lineTo(x + 60, 144);
    c.lineTo(x + 143, 132);
    c.lineTo(x + 190, 207);
    c.closePath();
    c.fill();
    c.fillStyle = i ? '#d4c7a2' : '#a1afb0';
    for (let j = 0; j < (i ? 9 : 28); j++) {
      const a = x + 70 + ((j * 31) % 90),
        b = 157 + ((j * 19) % 42);
      c.fillRect(a, b, i ? 12 : 2, i ? 8 : 2);
    }
    c.fillStyle = '#213b3e';
    c.font = '13px system-ui';
    c.fillText(i ? 'Compare impact reworking' : 'Compare volcanic cooling', x + 10, 253);
  }
  c.fillStyle = '#213b3e';
  c.font = '15px system-ui';
  c.fillText(
    m.strategy === 'observe'
      ? 'Optical records · sites left untouched'
      : 'Sealed virtual analogs · matched sites',
    26,
    295,
  );
  c.fillText('Composition and ages unmeasured', 26, 320);
  c.font = '13px system-ui';
  c.fillText('Authored analog diagrams · LROC terrain context', 26, 347);
  c.restore();
  return true;
}
