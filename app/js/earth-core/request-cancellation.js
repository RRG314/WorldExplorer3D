export function worldLoadAbortError(signal, fallback = 'World load request aborted') {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException(String(signal?.reason || fallback), 'AbortError');
}

export function throwIfWorldLoadAborted(signal, fallback) {
  if (signal?.aborted) throw worldLoadAbortError(signal, fallback);
}

export function waitForWorldLoadDelay(ms, signal, fallback) {
  throwIfWorldLoadAborted(signal, fallback);
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const finish = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(worldLoadAbortError(signal, fallback));
    };
    timeoutId = globalThis.setTimeout(finish, Math.max(0, Number(ms) || 0));
    signal?.addEventListener?.('abort', abort, { once: true });
  });
}
