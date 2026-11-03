import { validateResearchMediaRecord } from './research-media.js';
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
