const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const words = value => escape(String(value || 'Not recorded').replaceAll('-', ' '));
// Read the saved report, never a current site lookup or a fresh case answer.
export function archaeologyReportMarkup(report) {
  if (report?.truthType !== 'fictional-training-site' || !report.contexts || !report.artifacts) return '';
  const measures = Object.entries(report.measurements || {}).map(([id, row]) => `<div><dt>${id === 'feature' ? 'Visible feature' : 'Catalog bench'}</dt><dd>${Number(row.distanceMeters).toFixed(1)} m · ${Number(row.bearingDegrees).toFixed(0)}° · ${words(row.relation)}</dd></div>`).join('');
  const contexts = Object.entries(report.contexts).map(([id, context]) => `<article><strong>Context ${escape(id)} · ${escape(context.cell)}</strong><p>${words(context.fabric)} · ${words(context.orientation)}<br>${words(context.relationship)} · ${Number(context.depthCm)} cm</p><p>Material: ${words(report.classifications?.[id])}<br>Wear: ${words(report.tests?.[`${id}:wear`]?.result)}<br>Packing: ${words(report.artifacts[id]?.packing)}</p></article>`).join('');
  return `<details class="archaeology-report"><summary>Site plan, contextual catalog and conservation</summary><p>Fictional training site · ${escape(report.grid?.unit === 'metre' ? 'one-metre grid' : 'recorded grid')} · north aligned</p><dl>${measures}</dl><div class="research-evidence-grid">${contexts}</div><p>Alternative retained: ${words(report.alternative)}<br>Conservation: ${words(report.conservation)}</p><p>This plate can be displayed at your personal workspace. Real heritage visits remain observation-only.</p></details>`;
}
