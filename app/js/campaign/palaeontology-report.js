import { validateResearchMediaRecord } from './research-media.js';
const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const words = (value) => escape(String(value || 'Not recorded').replaceAll('-', ' '));
export function palaeontologyReportMarkup(report) {
  if (report?.truthType !== 'invented-training-fossil' || !report.orientation || !report.specimen)
    return '';
  return `<details class="fossil-report"><summary>Fossil context, photographs and preparation</summary><p>Original invented training cast · ${escape(report.orientation.layer)} · ${words(report.orientation.axis)}</p><dl><dt>Structure</dt><dd>${words(report.tests?.structure?.result)}</dd><dt>Surface</dt><dd>${words(report.tests?.surface?.result)}</dd><dt>Enclosing sediment</dt><dd>${words(report.tests?.sediment?.result)}</dd><dt>Identification</dt><dd>${words(report.classification?.kind)}</dd><dt>Support</dt><dd>${words(report.support?.method)}</dd><dt>Limit retained</dt><dd>${words(report.limitation)}</dd></dl><p>Preparation: outer matrix exposed with a blunt probe, margin brushed, diagnostic surface retained; labelled support recorded before lifting.</p>${fieldPhotoFigures(report.captures)}<p>The saved museum plate can be displayed at your personal workspace.</p></details>`;
}

function fieldPhotoFigures(captures) {
  return Object.entries(captures || {})
    .map(
      ([slot, ref]) =>
        `<figure class="field-photo-record"><button type="button" data-research-photo="${escape(ref.id)}">View ${slot === 'layer' ? 'layer' : 'orientation'} photograph</button><figcaption>${escape(slot)} · in-game photograph taken before preparation</figcaption><span role="status"></span></figure>`
    )
    .join('');
}
export function palaeontologyArchiveMarkup(record) {
  if (record?.site?.truthType !== 'virtual-training-site' || !record.runId) return '';
  return `<details class="fossil-archive"><summary>Earlier training attempt · records retained</summary><p>This attempt ended before its fossil report was complete. Its original location, observations and images are retained separately from the moved course.</p><p>${escape(record.site.name)}<br>Observed form: ${words(record.observation?.form)}<br>Layer: ${words(record.orientation?.layer)} · Axis: ${words(record.orientation?.axis)}</p><p>Preparation: ${(record.preparation || []).map((row) => words(row.zone) + ' · ' + words(row.tool)).join('; ') || 'Not started'}<br>Support: ${words(record.support?.method)}</p>${record.specimen ? '<p>The labelled specimen from this attempt remains in your collection.</p>' : ''}${fieldPhotoFigures(record.captures)}</details>`;
}

export async function showResearchPhoto(button, store) {
  const host = button.closest('.field-photo-record'),
    status = host?.querySelector('[role=status]');
  if (!host || !status || button.disabled) return;
  button.disabled = true;
  status.textContent = 'Loading photograph…';
  try {
    const row = await store.getResearchPhoto(button.dataset.researchPhoto);
    validateResearchMediaRecord(row);
    if (row.schemaVersion !== 1)
      throw Error('This photograph needs a newer version of World Explorer.');
    if (!button.isConnected) return;
    const image = document.createElement('img');
    image.src = row.photo.dataUrl;
    image.alt = 'Saved in-game ' + row.slot + ' field photograph';
    image.width = row.photo.width;
    image.height = row.photo.height;
    image.style.cssText = 'display:block;max-width:100%;height:auto';
    host.insertBefore(image, host.firstChild);
    button.hidden = true;
    status.textContent = 'Photograph restored from this device’s Journal.';
  } catch (error) {
    if (status.isConnected)
      status.textContent = error.message || 'The photograph could not load. Try again.';
  } finally {
    button.disabled = false;
  }
}
