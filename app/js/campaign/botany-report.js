export const botanyText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const esc = botanyText,
  words = (value) => esc(String(value || 'Not recorded').replaceAll('-', ' '));
export function botanyPlantPlate(plants, captures) {
  return `<div class="botany-plate">${Object.entries(plants || {})
    .filter(
      ([, p]) =>
        p &&
        Number.isFinite(p.reading?.light) &&
        Number.isFinite(p.reading?.moisture) &&
        Number.isFinite(p.reading?.depthCm)
    )
    .map(
      ([id, p]) =>
        `<section><h3>Plant ${esc(id.toUpperCase())}</h3><p>${words(p.form)}<br>Light ${p.reading.light} · moisture ${p.reading.moisture}<br><small>Relative virtual indices · probe depth ${p.reading.depthCm} cm</small></p>${captures?.['plant-' + id] ? `<figure class="field-photo-record"><button type="button" data-research-photo="${esc(captures['plant-' + id].id)}">View diagnostic photograph</button><figcaption>Training plant ${esc(id.toUpperCase())} · not a wild species identification</figcaption><span role="status"></span></figure>` : ''}</section>`
    )
    .join('')}</div>`;
}
export function botanyCoverTable(readings) {
  return `<div class="botany-table"><table><caption>Fixed plot · 16 points per quadrat · 1.6 m side</caption><thead><tr><th>Visit</th><th>Untreated</th><th>Treatment</th></tr></thead><tbody>${Object.entries(
    readings || {}
  )
    .filter(
      ([, r]) =>
        r &&
        ['control', 'treatment'].every(
          (id) => Number.isFinite(r[id]?.coverPercent) && Number.isFinite(r[id]?.vegetationHits)
        )
    )
    .map(
      ([phase, r]) =>
        `<tr><th>${words(phase)}<br><small>${words(r.virtualSeason)}</small></th>${['control', 'treatment'].map((id) => `<td>${r[id].coverPercent}%<br><small>${r[id].vegetationHits}/16 hits</small></td>`).join('')}</tr>`
    )
    .join('')}</tbody></table></div>`;
}
export function botanyReportMarkup(report) {
  if (
    report?.truthType !== 'declared-season-plant-study' ||
    !report.plants ||
    typeof report.planting?.variety !== 'string'
  )
    return '';
  return `<details class="botany-report"><summary>Plant plate and restoration record</summary><p>Authored training varieties and declared virtual seasons. No real occurrence, plant care or edible-plant advice is inferred.</p>${botanyPlantPlate(report.plants, report.captures)}${botanyCoverTable(report.plotReadings)}<p>Planting: ${words(report.planting.variety.toUpperCase())} · treatment point ${report.planting.cell + 1}.</p><p>${esc(report.conclusion)}</p><p>Limit: ${words(report.limitation)}<br>Follow-up: ${words(report.followUp)}</p></details>`;
}
export function botanyArchiveMarkup(record) {
  if (record?.site?.truthType !== 'virtual-training-site' || !record.runId) return '';
  return `<details><summary>Earlier plant-study attempt · records retained</summary><p>${esc(record.site.name)}. The earlier plot is separate from the moved training site.</p>${botanyPlantPlate(record.plants, record.captures)}${botanyCoverTable(record.plotReadings)}</details>`;
}
