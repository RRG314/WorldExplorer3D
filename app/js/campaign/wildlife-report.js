export const wildlifeText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const words = (value) => wildlifeText(String(value || 'Not recorded').replaceAll('-', ' '));
export function wildlifeChecklistMarkup(surveys, identifications = {}) {
  return (
    '<div class="wildlife-checklists">' +
    ['a', 'b']
      .map((id) => {
        const row = surveys?.[id];
        if (!row) return '';
        const observations = row.observations || [],
          ident = identifications[id];
        return `<section><h3>${id === 'a' ? 'A · Wooded edge' : 'B · Open edge'}</h3><p>${words(row.method)} · ${Number(row.activeSeconds).toFixed(1)} active seconds · ${Number(row.distanceMeters).toFixed(1)} m${row.excludedSeconds > 0 ? ` · ${Number(row.excludedSeconds).toFixed(1)} s excluded` : ''}</p><ul>${observations.length ? observations.map((o) => `<li>${words(o.taxon)}${row.method === 'trail-camera' ? ` · ${o.detections} detection events` : ' · observed'}<br><small>${words(o.source)} · ${words(o.behavior)}</small></li>`).join('') : '<li>Not observed during this effort. Absence is not established.</li>'}</ul>${ident ? `<p>Review: ${words(ident.taxon)} · ${words(ident.confidence)}</p>` : ''}${row.sensor?.truthType === 'virtual-motion-sensor' ? `<p>Mounted virtual sensor · ${row.sensor.horizontalFovDegrees}° cone · ${row.sensor.rangeMeters} m range. Events can repeat for one model.</p>` : ''}</section>`;
      })
      .join('') +
    '</div>'
  );
}
function photographs(captures) {
  return Object.entries(captures || {})
    .map(
      ([slot, ref]) =>
        `<figure class="field-photo-record"><button type="button" data-research-photo="${wildlifeText(ref.id)}">View ${slot === 'habitat-a' ? 'wooded' : 'open'} sign photograph</button><figcaption>Diagnostic training sign · ${words(slot)}</figcaption><span role="status"></span></figure>`
    )
    .join('');
}
export function wildlifeReportMarkup(report) {
  if (report?.truthType !== 'authored-virtual-habitats' || !report.surveys) return '';
  return `<details class="wildlife-report"><summary>Paired habitat checklists and effort</summary><p>Virtual training plots and animated models; no real wildlife sighting is claimed at this place.</p>${wildlifeChecklistMarkup(report.surveys, report.identifications)}<p>Effort: ${words(report.comparison?.status)}. Cover: wooded versus open.</p><p>${wildlifeText(report.conclusion)}</p><p>Limit: ${words(report.limitation)}<br>Follow-up: ${words(report.followUp)}</p>${photographs(report.captures)}</details>`;
}
export function wildlifeArchiveMarkup(record) {
  if (record?.site?.truthType !== 'virtual-training-site' || !record.runId) return '';
  return `<details class="wildlife-archive"><summary>Earlier habitat attempt · records retained</summary><p>${wildlifeText(record.site.name)}. This attempt ended before its paired report; its original observations are separate from the moved course.</p>${wildlifeChecklistMarkup(record.surveys, record.identifications)}${photographs(record.captures)}</details>`;
}
