import initializeManifold from '/app/vendor/manifold/manifold.js';
import { compileTunnelSolid } from './tunnel-solid-kernel.js';
// Root-hosted binary is unchanged when this module becomes a hashed bundle.
const ready = fetch(new URL('/app/vendor/manifold/manifold.wasm', import.meta.url))
  .then(response => { if (!response.ok) throw new Error('Tunnel kernel unavailable'); return response.arrayBuffer(); })
  .then(wasmBinary => initializeManifold({ wasmBinary }))
  .then(kernel => { kernel.setup(); return kernel; });
self.onmessage = async ({ data }) => {
  try {
    const result = compileTunnelSolid(await ready, data.input);
    self.postMessage({ id: data.id, result }, [result.positions.buffer, result.indices.buffer]);
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
};
