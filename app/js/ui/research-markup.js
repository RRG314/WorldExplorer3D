// Shared native form primitives. Domains own their field meanings and commands.
export const researchText = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const researchSelect = (name, label, choices) =>
  `<label>${researchText(label)}<select name="${researchText(name)}" required><option value="">Choose…</option>${Object.entries(
    choices
  )
    .map(([id, text]) => `<option value="${researchText(id)}">${researchText(text)}</option>`)
    .join('')}</select></label>`;
export const researchButton = (
  action,
  label,
  disabled = false,
  primary = false,
  attribute = 'data-research-action'
) =>
  `<button type="button"${primary ? ' class="research-primary"' : ''} ${attribute}="${researchText(action)}"${disabled ? ' disabled' : ''}>${researchText(label)}</button>`;
