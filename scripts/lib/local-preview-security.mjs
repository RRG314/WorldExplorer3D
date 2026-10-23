import fs from 'node:fs/promises';
import path from 'node:path';

const denied = statusCode => Object.assign(new Error(statusCode === 400 ? 'Invalid preview request' : 'Forbidden preview request'), {statusCode});

export function assertPreviewRequest(request, port, host = '127.0.0.1') {
  const hosts = new Set(['127.0.0.1', 'localhost', '[::1]', host].map(value => `${value}:${port}`));
  if (!hosts.has(String(request.headers.host || '').toLowerCase())) throw denied(403);
  const origin = request.headers.origin;
  if (origin && ![...hosts].some(value => origin === `http://${value}`)) throw denied(403);
  if (request.headers['sec-fetch-site'] === 'cross-site') throw denied(403);
}

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

const protectedPath = value => value.split(/[\\/]/).some(segment =>
  segment.startsWith('.') || ['node_modules', 'output'].includes(segment));

export async function resolvePreviewFile(rootDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname).replaceAll('\\', '/'); }
  catch { throw denied(400); }
  if (decoded.includes('\0')) throw denied(400);
  // Generated research can contain private operational records. Hidden files
  // include .env, .git, and local credential/configuration directories.
  if (protectedPath(decoded)) throw denied(403);
  const root = await fs.realpath(rootDir);
  let candidate = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`);
  if (!containedBy(root, candidate)) throw denied(403);
  try {
    candidate = await fs.realpath(candidate);
    if (!containedBy(root, candidate) || protectedPath(path.relative(root, candidate))) throw denied(403);
    if ((await fs.stat(candidate)).isDirectory()) candidate = await fs.realpath(path.join(candidate, 'index.html'));
    if (!containedBy(root, candidate) || protectedPath(path.relative(root, candidate))) throw denied(403);
    return (await fs.stat(candidate)).isFile() ? candidate : null;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}
