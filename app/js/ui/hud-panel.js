// Sessions keep panel events and lifetime. ScreenLayout supplies the single
// bounded HUD lane, below menus and shared with the controls footer.
export function mountHudPanel(panel) {
  panel.removeAttribute('style');
  panel.classList.add('session-hud-panel');
  const host = document.getElementById('hudUtilities') || document.body;
  const footer = host.querySelector('.hudUtilityActions');
  host.insertBefore(panel, footer?.parentNode === host ? footer : null);
  return panel;
}
