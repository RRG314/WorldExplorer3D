export function createGlobeSelectorLaunch({
  applyCoordinateSelection,
  close,
  getSelection,
  hasDirtyCoordinates,
  isOpen,
  onStartHere,
  prepareSelection,
  setShortcutButtonsBusy,
  setStartButtonBusy,
  setStatus
}) {
  let activeLaunch = null;
  let generation = 0;

  function cancel() {
    generation += 1;
    activeLaunch = null;
    setStartButtonBusy(false);
    setShortcutButtonsBusy(false);
  }

  function startHere() {
    if (activeLaunch) return activeLaunch;
    if (hasDirtyCoordinates() && !applyCoordinateSelection()) return Promise.resolve(false);
    const selection = getSelection();
    if (!selection) {
      setStatus('Select a point on the globe or enter valid coordinates first.', '#dc2626');
      return Promise.resolve(false);
    }
    if (typeof onStartHere !== 'function') {
      setStatus('World launch is unavailable. Return to the main menu and try again.', '#dc2626');
      return Promise.resolve(false);
    }

    prepareSelection(selection);
    const launchGeneration = ++generation;
    setStartButtonBusy(true);
    setStatus(`Starting at ${selection.name || 'selected location'}...`, '#334155');
    const launch = Promise.resolve(onStartHere({ ...selection }))
      .then((launched) => {
        if (launched === false) throw new Error('The world did not accept this location.');
        return true;
      })
      .catch((error) => {
        if (launchGeneration === generation) {
          setStatus(`Could not start here: ${error?.message || error}`, '#dc2626');
        }
        return false;
      })
      .finally(() => {
        if (activeLaunch === launch) activeLaunch = null;
        if (launchGeneration === generation && isOpen()) setStartButtonBusy(false);
      });
    activeLaunch = launch;
    return launch;
  }

  function startEnvironment(callback, label) {
    if (activeLaunch || typeof callback !== 'function') return Promise.resolve(false);
    const launchGeneration = ++generation;
    setShortcutButtonsBusy(true);
    setStatus(`Starting ${label}...`, '#334155');
    const launch = Promise.resolve(callback())
      .then((launched) => {
        if (launched === false) throw new Error(`${label} did not accept the launch request.`);
        if (launchGeneration === generation) close();
        return true;
      })
      .catch((error) => {
        if (launchGeneration === generation) {
          setStatus(`Could not start ${label}: ${error?.message || error}`, '#dc2626');
        }
        return false;
      })
      .finally(() => {
        if (activeLaunch === launch) activeLaunch = null;
        if (launchGeneration === generation) setShortcutButtonsBusy(false);
      });
    activeLaunch = launch;
    return launch;
  }

  return { cancel, startEnvironment, startHere };
}
