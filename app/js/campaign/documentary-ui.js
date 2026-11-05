import { documentThemeCss } from '../ui/document-theme.js';
import { prepareDocumentaryMedia } from './documentary-media.js';
import { THREE_VIEWS } from './three-views-config.js';
import { documentaryStory, documentaryStoryReport } from './documentary-story.js';
const escape = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    ),
  names = { context: 'Street view', detail: 'Facade detail', setting: 'District setting' };
function figures(source, order, captions, album, lazy = false) {
  return order
    .map((kind) => {
      const ref = source?.photographs?.find((p) => p.kind === kind),
        photo = album?.photos?.find((p) => p.id === ref?.id);
      return `<figure>${photo ? `<img src="${photo.dataUrl}" width="${photo.width}" height="${photo.height}" alt="${escape(names[kind])} of ${escape(source.subject.name)}" loading="lazy" style="max-width:100%;height:auto">` : lazy ? '' : '<p>Original image unavailable on this device.</p>'}<figcaption><strong>${escape(names[kind])}</strong> · ${escape(captions[kind] || 'Caption this view in your story.')}</figcaption></figure>`;
    })
    .join('');
}
export function documentaryReportMarkup(
  report,
  album,
  { lazy = false, mediaAvailable = false } = {}
) {
  try {
    if (
      report?.schemaVersion !== 1 ||
      report.id !== 'read-the-street' ||
      !report.source?.subject ||
      !Array.isArray(report.order) ||
      report.order.length !== 3 ||
      new Set(report.order).size !== 3 ||
      report.order.some((k) => !THREE_VIEWS.kinds.includes(k)) ||
      typeof report.title !== 'string' ||
      typeof report.question !== 'string' ||
      typeof report.conclusion !== 'string' ||
      !report.captions
    )
      return '';
    return `<details class="discoveryGeologyEvidence documentary-story-report"><summary>${escape(report.title)}</summary><p><strong>Visual question</strong> · ${escape(report.question)}</p><div class="discoveryPhotoAlbum" data-documentary-images>${figures(report.source, report.order, report.captions, album, lazy)}</div>${lazy ? `<div>${mediaAvailable ? `<button type="button" data-documentary-photos="${escape(report.source.photographs.map((p) => p.fingerprint).join(':'))}">Load original photographs</button>` : '<p>Original photographs are unavailable on this device.</p>'}<p role="status" data-documentary-photo-status></p></div>` : ''}<p><strong>What the photographs show</strong> · ${escape(report.conclusion)}</p><small>In-game photographs of ${escape(report.source.subject.name)} · ${escape(report.source.regionLabel)}. Original capture records are retained with the album.</small></details>`;
  } catch {
    return '';
  }
}
const field = (name, label, value, { min = 0, max = 280, rows = 3 } = {}) =>
  `<label class="discoveryDocumentaryField">${escape(label)}<textarea name="${name}" rows="${rows}" minlength="${min}" maxlength="${max}" ${min ? 'required' : ''}>${escape(value)}</textarea></label>`;
export function documentaryEditorMarkup({
  base,
  album,
  busy = false,
  pending = null,
  values = null,
  button,
}) {
  const s = documentaryStory(base),
    v = values || s;
  if (s.schemaVersion !== 1)
    return '<p>This saved story needs a newer version of World Explorer. Your album is kept.</p>';
  if (s.phase === 'complete')
    return (
      documentaryReportMarkup(documentaryStoryReport(base), album).replace(
        '<details ',
        '<details open '
      ) +
      button(
        'story-export',
        album?.photos?.length === 3 ? 'Export story with photographs' : 'Export story text'
      ) +
      button('journal', 'View Journal record')
    );
  if (base.mediaDeleted || base.mode !== 'photo' || base.phase !== 'complete')
    return '<p>Complete your three-view photo album before editing this story. Restore its Journal backup if the original photographs were deleted.</p>';
  const submit = (label) =>
    `<button type="submit"${busy ? ' disabled' : ''}>${escape(label)}</button>`;
  let body = '';
  if (s.phase === 'available')
    body = `<p>Ask a visual question about your saved place, then turn its three contrasting photographs into a short field story.</p><form class="discoveryDocumentaryForm" data-documentary-form="story-start">${field('title', 'Story title', v.title, { min: 4, max: 100, rows: 1 })}${field('question', 'What do you want these photographs to explain?', v.question, { min: 10, max: 240 })}${submit('Choose the story photographs')}</form>`;
  if (s.phase === 'select') {
    const order = v.order || THREE_VIEWS.kinds;
    body =
      '<p>Use each original view once. Choose the opening, middle and closing image for your story.</p><form class="discoveryDocumentaryForm" data-documentary-form="story-select">' +
      order
        .map(
          (kind, i) =>
            `<label class="discoveryDocumentaryField">${['Opening image', 'Middle image', 'Closing image'][i]}<select name="order-${i}">${THREE_VIEWS.kinds.map((k) => `<option value="${k}"${k === kind ? ' selected' : ''}>${names[k]}</option>`).join('')}</select></label>`
        )
        .join('') +
      submit('Use this sequence') +
      '</form><div class="discoveryPhotoAlbum">' +
      album.photos
        .map(
          (p) =>
            `<figure><img src="${p.dataUrl}" alt="${names[p.kind]}" width="${p.width}" height="${p.height}" loading="lazy" style="max-width:100%;height:auto"><figcaption>${names[p.kind]}</figcaption></figure>`
        )
        .join('') +
      '</div>';
  }
  if (s.phase === 'edit')
    body = `<form class="discoveryDocumentaryForm" data-documentary-form="story-draft">${field('title', 'Story title', v.title, { min: 4, max: 100, rows: 1 })}${field('question', 'Visual question', v.question, { min: 10, max: 240 })}${s.order.map((kind) => `${figures(s.source, [kind], {}, album)}${field('caption-' + kind, `${names[kind]} · what does this image show?`, v.captions?.[kind])}`).join('')}${field('conclusion', 'What do the views show together, and what remains uncertain?', v.conclusion, { max: 600, rows: 4 })}${submit('Save draft')}<button type="submit" data-story-submit="story-review"${busy ? ' disabled' : ''}>Review story</button></form><p>Save drafts as you work. Review saves your current captions and shows the finished story.</p>`;
  if (s.phase === 'review')
    body =
      documentaryReportMarkup({ ...s, id: 'read-the-street', schemaVersion: 1 }, album).replace(
        '<details ',
        '<details open '
      ) +
      `<p>Check the actual images, captions and conclusion. This saves a finished local Journal record.</p>${button('story-publish', 'Save finished story')}${button('story-edit', 'Edit draft')}`;
  if (pending)
    body += `<p role="status">The last save did not finish. Your saved album is safe; the same draft is ready to retry.</p>${button('story-retry', 'Retry last save')}${button('story-reload', 'Discard unsaved edits and reload')}`;
  if (pending || busy)
    body = body
      .replace(/<textarea /g, '<textarea readonly ')
      .replace(/<select /g, '<select disabled ')
      .replace(/<button type="submit"/g, '<button disabled type="submit"');
  return body;
}
export function documentaryStoryHtml(base, album) {
  const report = documentaryStoryReport(base);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(report.title)} · World Explorer</title><style>${documentThemeCss()}body{max-width:900px;margin:32px auto;padding:0 20px;font:calc(1rem * var(--wx-text-scale,1))/1.5 var(--wx-font-ui,Arial,sans-serif);background:var(--wx-panel-solid,#fff);color:var(--wx-text,#111)}img{display:block;max-width:100%;height:auto}figure{margin:24px 0}figcaption{padding:10px 0}h1,h2,h3,summary{font-family:var(--wx-font-display,Arial,sans-serif);font-weight:500}a{color:var(--wx-action,#76310e)}small{color:var(--wx-text)}summary{font-size:1.6rem;font-weight:bold}</style><main>${documentaryReportMarkup(report, album).replace('<details ', '<details open ')}</main></html>`;
}

export async function showDocumentaryStoryPhotos(button, store) {
  const host = button.closest('.documentary-story-report'),
    status = host?.querySelector('[data-documentary-photo-status]');
  if (!host || !status || button.disabled) return;
  button.disabled = true;
  status.textContent = 'Loading original photographs…';
  try {
    const [profile, album] = await Promise.all([store.getProfile(), store.getThreeViewsAlbum()]),
      base = profile.threeViews,
      story = documentaryStory(base);
    if (story.schemaVersion !== 1 || story.phase !== 'complete' || base.mediaDeleted)
      throw Error(
        'The original photographs are unavailable. Restore the complete album backup to view them.'
      );
    const key = story.source.photographs.map((p) => p.fingerprint).join(':');
    if (key !== button.dataset.documentaryPhotos)
      throw Error('This album changed. Reopen the Journal before loading its photographs.');
    await prepareDocumentaryMedia(base, album);
    const current = (await store.getProfile()).threeViews;
    if (
      current.revision !== base.revision ||
      current.mediaDeleted ||
      current.story?.schemaVersion !== 1 ||
      current.story.source.photographs.map((p) => p.fingerprint).join(':') !== key
    )
      throw Error('This album changed. Reopen the Journal before loading its photographs.');
    if (!button.isConnected) return;
    host.querySelector('[data-documentary-images]').innerHTML = figures(
      story.source,
      story.order,
      story.captions,
      album
    );
    button.hidden = true;
    status.textContent = 'Original in-game photographs loaded from this device’s album.';
  } catch (error) {
    if (status.isConnected)
      status.textContent = error.message || 'The photographs could not load. Try again.';
  } finally {
    button.disabled = false;
  }
}
