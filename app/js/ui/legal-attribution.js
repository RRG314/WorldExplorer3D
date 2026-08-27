function setupLegalAttribution() {
  const dialog = document.getElementById('dataLicensesDialog');
  const openButtons = [...document.querySelectorAll('[data-open-data-licenses]')];
  const closeButton = document.getElementById('dataLicensesCloseBtn');
  if (!(dialog instanceof HTMLDialogElement) || !openButtons.length || !closeButton) return false;

  openButtons.forEach((openButton) => openButton.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  }));
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupLegalAttribution, { once: true });
} else {
  setupLegalAttribution();
}

export { setupLegalAttribution };
