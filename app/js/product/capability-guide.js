import { CAPABILITY_GROUPS, CAPABILITY_STATUS, findProductCapabilities } from './capabilities.js?v=1';

export function mountCapabilityGuide(host = document.getElementById('tab-controls')) {
  if (!host || host.querySelector('#capabilityGuide')) return;
  const guide = document.createElement('details'); guide.id = 'capabilityGuide'; guide.className = 'capabilityGuide';
  const summary = document.createElement('summary'); summary.textContent = 'What can I do in World Explorer?';
  const intro = document.createElement('p'); intro.textContent = 'Available means you can use it now. Limited features have the boundaries described below. Experimental features are still being developed. Planned features are not available yet.';
  const filters = document.createElement('div'); filters.className = 'capabilityFilters';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find a feature, such as swimming'; search.setAttribute('aria-label', 'Search game capabilities');
  const group = document.createElement('select'); group.setAttribute('aria-label', 'Feature category');
  for (const [value, label] of [['', 'All features'], ...Object.entries(CAPABILITY_GROUPS)]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; group.append(option);
  }
  group.value = 'worlds';
  const count = document.createElement('p'); count.setAttribute('role', 'status');
  const list = document.createElement('ul'); list.className = 'capabilityList';
  function render() {
    const entries = findProductCapabilities({ group: group.value, query: search.value });
    list.replaceChildren(); count.textContent = `${entries.length} matching features`;
    for (const entry of entries) {
      const item = document.createElement('li'); item.dataset.capability = entry.id;
      const title = document.createElement('strong'); title.textContent = entry.label;
      const status = document.createElement('span'); status.className = 'capabilityStatus'; status.dataset.status = entry.status; status.textContent = CAPABILITY_STATUS[entry.status];
      const description = document.createElement('p'); description.textContent = entry.summary;
      const save = document.createElement('p'); save.className = 'capabilitySave'; save.textContent = `Saving: ${entry.persistence}`;
      item.append(title, status, description, save); list.append(item);
    }
  }
  search.addEventListener('input', () => { group.value = ''; render(); }); group.addEventListener('change', render);
  filters.append(search, group); guide.append(summary, intro, filters, count, list); host.prepend(guide); render();
}
