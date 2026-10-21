const token = location.hash.slice(1);
// Token stays out of request URLs, analytics and later navigation history.
history.replaceState(null, '', location.pathname);
const button = document.getElementById('confirmTester');
const status = document.getElementById('testerStatus');
if (!/^[a-f0-9]{64}$/.test(token)) {
  button.hidden = true; status.textContent = 'This link is invalid. Request a new confirmation email from the game.';
}
button.addEventListener('click', async () => {
  button.disabled = true; status.textContent = 'Confirming…';
  try {
    // The one-use emailed capability authorizes confirmation. No sign-in or
    // CAPTCHA initialization is needed on an email-link landing page.
    const response = await fetch('/registerAppTester', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'confirm',token}), signal:AbortSignal.timeout(20000)});
    const result = response.ok ? await response.json() : null;
    if (!result?.confirmed) throw new Error('Unconfirmed');
    try { localStorage.setItem('we3d.tester-invitation.v1','interested'); } catch { /* Optional device preference. */ }
    button.hidden = true;
    status.textContent = 'You’re on the tester interest list. We’ll email you when a suitable test is available. To remove your interest, email mail@worldexplorer3d.io.';
  } catch (_) {
    status.textContent = 'We couldn’t confirm this link. It may have expired. Try again, or request a new email from the game.';
    button.disabled = false;
  }
});
