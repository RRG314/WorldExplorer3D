import { startServer } from './lib/runtime-browser-harness.mjs';

const handle = await startServer();
const url = `${handle.baseUrl}/app/`;

console.log(`[serve-runtime-local] running at ${url}`);
console.log('[serve-runtime-local] local /api/overpass proxy is enabled');

const shutdown = async (signal = 'shutdown') => {
  console.log(`[serve-runtime-local] stopping (${signal})`);
  await handle.close();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

await new Promise(() => {});
