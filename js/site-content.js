import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { hasFirebaseConfig, initFirebase } from './firebase-init.js';

export const LANDING_PAGE_ENTRY_ID = 'landingPage';

function sanitizeText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeLongText(value, max = 1200) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function normalizeHighlight(item = {}, index = 0) {
  return {
    id: sanitizeText(item.id || `highlight_${index + 1}`, 48) || `highlight_${index + 1}`,
    title: sanitizeText(item.title || '', 80),
    body: sanitizeLongText(item.body || '', 280)
  };
}

export function normalizeLandingContent(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  const announcement = source.announcement && typeof source.announcement === 'object' ? source.announcement : {};
  const hero = source.hero && typeof source.hero === 'object' ? source.hero : {};
  const sections = source.sections && typeof source.sections === 'object' ? source.sections : {};
  const highlights = Array.isArray(source.highlights) ? source.highlights : [];

  return {
    meta: {
      title: sanitizeText(meta.title || '', 160),
      description: sanitizeText(meta.description || '', 320)
    },
    announcement: {
      enabled: announcement.enabled === true,
      eyebrow: sanitizeText(announcement.eyebrow || '', 48),
      title: sanitizeText(announcement.title || '', 120),
      body: sanitizeLongText(announcement.body || '', 300),
      linkLabel: sanitizeText(announcement.linkLabel || '', 48),
      linkHref: sanitizeText(announcement.linkHref || '', 320),
      tone: sanitizeText(announcement.tone || 'info', 20).toLowerCase() || 'info'
    },
    hero: {
      brand: sanitizeText(hero.brand || '', 80),
      headline: sanitizeText(hero.headline || '', 220),
      lead: sanitizeLongText(hero.lead || '', 420),
      primaryCtaLabel: sanitizeText(hero.primaryCtaLabel || '', 48),
      secondaryCtaLabel: sanitizeText(hero.secondaryCtaLabel || '', 56),
      tertiaryCtaLabel: sanitizeText(hero.tertiaryCtaLabel || '', 40),
      performanceNote: sanitizeLongText(hero.performanceNote || '', 220)
    },
    sections: {
      highlightsTitle: sanitizeText(sections.highlightsTitle || '', 80)
    },
    highlights: highlights.slice(0, 8).map((item, index) => normalizeHighlight(item, index))
  };
}

export function cloneLandingContent(raw = {}) {
  return JSON.parse(JSON.stringify(normalizeLandingContent(raw)));
}

function setText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function setButtonLabel(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

export function applyLandingContentToPage(content, root = document) {
  const data = normalizeLandingContent(content);
  if (!root) return data;

  if (data.meta.title) root.title = data.meta.title;
  const metaDescription = root.querySelector('meta[name="description"]');
  if (metaDescription && data.meta.description) {
    metaDescription.setAttribute('content', data.meta.description);
  }

  const announcementEl = root.querySelector('#landingAnnouncement');
  if (announcementEl) {
    announcementEl.hidden = !data.announcement.enabled;
    announcementEl.dataset.tone = data.announcement.tone || 'info';
    setText(root, '#landingAnnouncementEyebrow', data.announcement.eyebrow);
    setText(root, '#landingAnnouncementTitle', data.announcement.title);
    setText(root, '#landingAnnouncementBody', data.announcement.body);
    const announcementLink = root.querySelector('#landingAnnouncementLink');
    if (announcementLink) {
      const hasLink = !!(data.announcement.linkLabel && data.announcement.linkHref);
      announcementLink.hidden = !hasLink;
      if (hasLink) {
        announcementLink.textContent = data.announcement.linkLabel;
        announcementLink.href = data.announcement.linkHref;
      }
    }
  }

  setText(root, '#landingHeroBrand', data.hero.brand);
  setText(root, '#landingHeroHeadline', data.hero.headline);
  setText(root, '#landingHeroLead', data.hero.lead);
  setText(root, '#landingPerformanceNote', data.hero.performanceNote);
  setButtonLabel(root, '#landingPrimaryCta', data.hero.primaryCtaLabel);
  setButtonLabel(root, '#landingSecondaryCta', data.hero.secondaryCtaLabel);
  setButtonLabel(root, '#landingTertiaryCta', data.hero.tertiaryCtaLabel);
  setText(root, '#landingHighlightsTitle', data.sections.highlightsTitle);

  const highlightsEl = root.querySelector('#landingHighlights');
  if (highlightsEl && Array.isArray(data.highlights) && data.highlights.length) {
    highlightsEl.innerHTML = data.highlights.map((item) => `
      <article class="feature">
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        <p>${escapeHtml(item.body || '')}</p>
      </article>
    `).join('');
  }

  return data;
}

export function renderLandingContentPreview(container, content) {
  if (!container) return;
  const data = normalizeLandingContent(content);
  const announcementHtml = data.announcement.enabled
    ? `
      <section class="site-preview-announcement" data-tone="${escapeHtml(data.announcement.tone || 'info')}">
        <div class="site-preview-eyebrow">${escapeHtml(data.announcement.eyebrow || 'Announcement')}</div>
        <h4>${escapeHtml(data.announcement.title || 'Announcement title')}</h4>
        <p>${escapeHtml(data.announcement.body || 'Announcement copy will appear here.')}</p>
        ${data.announcement.linkLabel && data.announcement.linkHref
          ? `<a href="${escapeHtml(data.announcement.linkHref)}" target="_blank" rel="noreferrer">${escapeHtml(data.announcement.linkLabel)}</a>`
          : ''}
      </section>
    `
    : '';

  const highlights = Array.isArray(data.highlights) && data.highlights.length
    ? data.highlights
    : [{ title: 'No highlight cards yet', body: 'Add highlight blocks to preview landing-page messaging here.' }];

  container.innerHTML = `
    <div class="site-preview-shell">
      ${announcementHtml}
      <section class="site-preview-hero">
        <div class="site-preview-brand">${escapeHtml(data.hero.brand || 'World Explorer 3D')}</div>
        <h3>${escapeHtml(data.hero.headline || 'Landing headline')}</h3>
        <p>${escapeHtml(data.hero.lead || 'Landing lead copy preview.')}</p>
        <div class="site-preview-cta-row">
          <span>${escapeHtml(data.hero.primaryCtaLabel || 'Primary CTA')}</span>
          <span>${escapeHtml(data.hero.secondaryCtaLabel || 'Secondary CTA')}</span>
          <span>${escapeHtml(data.hero.tertiaryCtaLabel || 'Tertiary CTA')}</span>
        </div>
        <div class="site-preview-note">${escapeHtml(data.hero.performanceNote || '')}</div>
      </section>
      <section class="site-preview-highlights">
        <div class="site-preview-section-label">${escapeHtml(data.sections.highlightsTitle || 'Highlights')}</div>
        <div class="site-preview-grid">
          ${highlights.map((item) => `
            <article class="site-preview-card">
              <strong>${escapeHtml(item.title || 'Untitled')}</strong>
              <p>${escapeHtml(item.body || '')}</p>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

export async function fetchPublishedLandingContent(entryId = LANDING_PAGE_ENTRY_ID) {
  if (!hasFirebaseConfig()) return null;
  const services = initFirebase();
  if (!services?.db) return null;
  try {
    const snap = await getDoc(doc(services.db, 'siteContentPublished', entryId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return normalizeLandingContent(data.content || data);
  } catch (error) {
    console.warn('[site-content] Could not fetch published landing content:', error);
    return null;
  }
}

export async function hydrateLandingPageFromPublishedContent(root = document) {
  const content = await fetchPublishedLandingContent(LANDING_PAGE_ENTRY_ID);
  if (content) {
    applyLandingContentToPage(content, root);
  }
  return content;
}
