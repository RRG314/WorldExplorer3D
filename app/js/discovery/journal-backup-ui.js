// Explicit Profile actions only. The existing profile store owns the snapshot;
// this binding adds no storage, pruning, image encoder or frame work.
const leases = new WeakMap();
const photoBytes = (photo) => {
  const value = photo?.dataUrl;
  if (typeof value !== 'string' || !value.startsWith('data:image/jpeg;base64,')) return 0;
  const body = value.slice(value.indexOf(',') + 1);
  return Math.max(
    0,
    Math.floor((body.length * 3) / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0)
  );
};
export function journalBackupSummary(data) {
  const photos = [
    ...(data.albums || []).flatMap((album) => album.photos || []),
    ...(data.researchMedia || []).map((row) => row.photo).filter(Boolean),
  ];
  return {
    memories: data.events?.length || 0,
    photographs: photos.length,
    photoBytes: photos.reduce((n, photo) => n + photoBytes(photo), 0),
  };
}
export function storageSize(bytes) {
  if (!(Number.isFinite(bytes) && bytes >= 0)) return 'unknown';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function bindJournalBackupExport({
  store,
  exportButton,
  storageButton,
  status,
  otherButtons = [],
  listen,
  isActive = () => true,
  host = globalThis,
}) {
  const lease = {},
    nodes = [exportButton, storageButton, ...otherButtons].filter(Boolean),
    initial = new Map(nodes.map((node) => [node, node.disabled])),
    downloads = new Map();
  let disposed = false,
    busy = false;
  for (const node of [...nodes, status].filter(Boolean)) leases.set(node, lease);
  const current = () => !disposed && isActive() && (!status || leases.get(status) === lease);
  const message = (text) => {
    if (current() && status) status.textContent = text;
  };
  const disable = (value) => {
    for (const node of nodes)
      if (leases.get(node) === lease) node.disabled = value || initial.get(node);
  };
  async function run(task) {
    if (busy || !current()) return false;
    busy = true;
    disable(true);
    try {
      return await task();
    } catch {
      message(
        'Your Journal backup could not be prepared. Saved records and photographs are kept. Try again.'
      );
      return false;
    } finally {
      busy = false;
      disable(false);
    }
  }
  function download(data) {
    const blob = new host.Blob([JSON.stringify(data)], { type: 'application/json' }),
      url = host.URL.createObjectURL(blob),
      link = host.document.createElement('a');
    link.href = url;
    link.download = `world-explorer-journal-${new Date().toISOString().slice(0, 10)}.json`;
    link.hidden = true;
    try {
      host.document.body.append(link);
      link.click();
    } catch (error) {
      host.URL.revokeObjectURL(url);
      throw error;
    } finally {
      link.remove();
    }
    const timer = host.setTimeout(() => {
      host.URL.revokeObjectURL(url);
      downloads.delete(url);
    }, 1000);
    downloads.set(url, timer);
    return blob.size;
  }
  const exportBackup = () =>
    run(async () => {
      message('Preparing Journal backup with saved photographs…');
      const data = await store.exportData();
      if (!current()) return false;
      const summary = journalBackupSummary(data),
        bytes = download(data);
      message(
        `Journal backup prepared: ${summary.memories} memories and ${summary.photographs} photographs (${storageSize(bytes)}). Keep the JSON file from Downloads.`
      );
      return true;
    });
  const checkStorage = () =>
    run(async () => {
      message('Checking browser storage…');
      let estimate;
      try {
        estimate = await host.navigator?.storage?.estimate?.();
      } catch {}
      if (!current()) return false;
      if (
        Number.isFinite(estimate?.usage) &&
        Number.isFinite(estimate?.quota) &&
        estimate.quota > 0
      )
        message(
          `This site uses about ${storageSize(estimate.usage)} of its ${storageSize(estimate.quota)} browser allowance, including downloaded world data. Download a Journal backup to keep your saved photographs.`
        );
      else
        message(
          'A storage estimate is unavailable in this browser. Download a Journal backup to keep your saved records and photographs.'
        );
      return true;
    });
  listen(exportButton, 'click', () => void exportBackup());
  listen(storageButton, 'click', () => void checkStorage());
  return {
    exportBackup,
    checkStorage,
    dispose() {
      disposed = true;
      disable(false);
      for (const [url, timer] of downloads) {
        host.clearTimeout(timer);
        host.URL.revokeObjectURL(url);
      }
      downloads.clear();
    },
  };
}
