import { getOverlayPreset } from './preset-registry.js?v=1';
import { buildHelpTopic, listHelpTopics } from './help.js?v=1';

function helpTopicsForUi(ctx, presetId) {
  const topics = listHelpTopics();
  topics.push({ id: 'preset', label: `${getOverlayPreset(presetId).label} Guide` });
  topics.push({ id: 'advanced_mappings', label: 'Mapping' });
  if (ctx.state.helpTopic === 'validation_issue' && ctx.state.helpContext?.issue) {
    topics.push({ id: 'validation_issue', label: 'Current Issue' });
  }
  if (ctx.state.helpTopic === 'field' && ctx.state.helpContext?.fieldId) {
    topics.push({ id: 'field', label: 'Field Help' });
  }
  return topics;
}

function renderHelpDrawer(ctx, refs, feature) {
  if (!(refs.helpDrawer instanceof HTMLElement)) return;
  refs.helpDrawer.classList.toggle('show', ctx.state.helpOpen);
  refs.helpDrawer.setAttribute('aria-hidden', ctx.state.helpOpen ? 'false' : 'true');
  const topic = buildHelpTopic(ctx.state.helpTopic, {
    presetId: feature?.presetId || ctx.state.activePresetId,
    issue: ctx.state.helpContext?.issue || null,
    fieldId: ctx.state.helpContext?.fieldId || ''
  });
  if (refs.helpDrawerTitle) refs.helpDrawerTitle.textContent = topic.label || 'Guide';
  if (refs.helpDrawerSummary) refs.helpDrawerSummary.textContent = topic.summary || '';
  if (refs.helpTopicList) {
    refs.helpTopicList.innerHTML = helpTopicsForUi(ctx, feature?.presetId || ctx.state.activePresetId).map((entry) => `
      <button type="button" class="${entry.id === ctx.state.helpTopic ? 'active' : ''}" data-editor-help-topic="${ctx.escapeHtml(entry.id)}">${ctx.escapeHtml(entry.label)}</button>
    `).join('');
  }
  if (refs.helpContent) {
    const sections = Array.isArray(topic.sections) ? topic.sections : [];
    refs.helpContent.innerHTML = sections.map((section) => `
      <div class="editorHelpSection">
        <strong>${ctx.escapeHtml(section.title || '')}</strong>
        ${(Array.isArray(section.items) ? section.items : []).map((item) => `<div>${ctx.escapeHtml(item)}</div>`).join('')}
      </div>
    `).join('') || '<div class="editorEmptyState">No help content is available for this selection yet.</div>';
  }
}

export { renderHelpDrawer };
