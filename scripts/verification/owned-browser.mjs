export async function withinDeadline(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
      })
    ]);
  } finally { clearTimeout(timer); }
}

// Accept only the BrowserServer created by the caller. Never search for or
// terminate unrelated Chrome processes when a WebGL renderer stops responding.
export async function closeOwnedBrowser(server, timeoutMs = 8000, terminateMs = 4000) {
  const child = server.process();
  try {
    await withinDeadline(() => server.close(), timeoutMs, 'Owned browser close');
    return;
  } catch (error) {
    if (!child || child.exitCode !== null || child.signalCode) return;
    const waitForExit = (duration) => new Promise(resolve => {
      let timer;
      const exited = () => { clearTimeout(timer); resolve(true); };
      child.once('exit', exited);
      timer = setTimeout(() => { child.off('exit', exited); resolve(false); }, duration);
    });
    const terminated = waitForExit(terminateMs);
    child.kill('SIGTERM');
    if (!await terminated) {
      const killed = waitForExit(2000);
      child.kill('SIGKILL');
      if (!await killed) throw new Error('Owned browser process did not terminate', { cause: error });
    }
  }
}
