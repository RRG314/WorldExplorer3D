import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const bundlePath = value => /^app\/js\/bundles\/[A-Za-z0-9_-]+\.js$/.test(value);
const rootModulePath = value => /^js\/[A-Za-z0-9_./-]+\.js$/.test(value) && !value.split('/').includes('..');
const sharedContext = 'app/js/shared-context.js';

export function runtimeGeneration(fingerprint, environment) {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !['staging', 'production'].includes(environment)) throw Error('Invalid runtime generation inputs');
  // Staging and production use the same code URLs on different origins. Only
  // the generated Firebase configuration changes during promotion.
  const id = hash(fingerprint).slice(0, 24);
  return Object.freeze({ id, prefix: `/runtime/${id}` });
}

export function generationModulePath(generation, modulePath) {
  if (!/^\/runtime\/[a-f0-9]{24}$/.test(generation.prefix) ||
      !(rootModulePath(modulePath.split('?', 1)[0].slice(1)) || modulePath.split('?', 1)[0] === `/${sharedContext}`)) throw Error('Invalid shared runtime module path');
  return generation.prefix + modulePath;
}

// Only script/module references are changed. Navigation, assets, API URLs and
// Firebase's app identity still belong to the page's ordinary origin and path.
export function pinHtmlRootModules(html, htmlPath, generation, modules) {
  const pinned = html.replace(/(["'])([^"'<>\s]+\.js(?:\?[^"'<>\s]*)?)\1/g, (match, quote, reference) => {
    const url = new URL(reference, `https://artifact.invalid/${htmlPath}`);
    if (url.origin !== 'https://artifact.invalid' || !modules.has(url.pathname.slice(1))) return match;
    return `${quote}${generation.prefix}${url.pathname}${url.search}${url.hash}${quote}`;
  });
  return pinned.replace(/<html\b([^>]*)>/i, (_, attributes) => `<html${attributes} data-runtime-module-prefix="${generation.prefix}">`);
}

export async function snapshotRootModules(output, sourcePaths, generation, captureEntry) {
  const modules = sourcePaths.filter(rootModulePath).concat(sharedContext).sort();
  const files = {};
  for (const relative of modules) {
    let bytes = await fs.readFile(path.join(output, relative));
    if (relative === 'js/admin-dashboard.js') {
      // This one dynamic import crosses back to the content-hashed bundle tree.
      const source = bytes.toString(), reference = `../app/${captureEntry}`;
      if (!source.includes(reference)) throw Error('Capture viewer reference is missing from the shared module snapshot');
      bytes = Buffer.from(source.replace(reference, `/app/${captureEntry}`));
    }
    const target = `${generation.prefix.slice(1)}/${relative}`;
    await fs.mkdir(path.dirname(path.join(output, target)), { recursive: true });
    await fs.writeFile(path.join(output, target), bytes);
    files[target] = hash(bytes);
  }
  return { ...generation, files };
}

function retainedPath(relative, generation) {
  if (bundlePath(relative)) return true;
  if (!generation || !relative.startsWith(`runtime/${generation.id}/`)) return false;
  const modulePath = relative.slice(`runtime/${generation.id}/`.length);
  return rootModulePath(modulePath) || modulePath === sharedContext;
}

async function regularFile(root, relative) {
  if (path.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Unsafe retained runtime path');
  let current = path.resolve(root);
  if ((await fs.realpath(current)) !== current) throw Error('Retained artifact must not contain symlinks');
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const info = await fs.lstat(current);
    if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw Error('Retained runtime must contain ordinary files');
  }
  return fs.readFile(current);
}

// Each predecessor is explicit and independently verified. Do not recursively
// carry its older compatibility set: a release must not grow without bound.
// Security releases can deliberately omit a revoked predecessor.
export async function retainRuntimeGenerations({ output, predecessors, environment, projectId }) {
  if (predecessors.length > 2 || new Set(predecessors.map(p => path.resolve(p))).size !== predecessors.length) throw Error('Select at most two distinct predecessor artifacts');
  const retained = [];
  const staged = new Map();
  for (const root of predecessors) {
    if (path.resolve(root) === path.resolve(output)) throw Error('Cannot retain the artifact being built');
    const build = JSON.parse(await regularFile(root, 'build-manifest.json'));
    const assetBytes = await regularFile(root, 'asset-manifest.json');
    const assets = JSON.parse(assetBytes).files;
    if (!assets || typeof assets !== 'object' || Array.isArray(assets) ||
        build.sourceDirty !== false || build.firebaseEnvironment !== environment || build.firebaseProjectId !== projectId ||
        !/^[a-f0-9]{40}$/.test(build.commit || '') || build.assetManifestSha256 !== hash(assetBytes) ||
        build.contentHash !== hash(json(assets)) || build.fileCount !== Object.keys(assets).length ||
        build.buildId !== `${build.version}+${build.commit.slice(0, 12)}.${build.contentHash.slice(0, 16)}.${environment}`) throw Error('Predecessor artifact identity or Firebase environment does not match');
    const generation = build.runtimePackaging?.generation;
    if (generation && (generation.prefix !== `/runtime/${generation.id}` || !/^[a-f0-9]{24}$/.test(generation.id))) throw Error('Invalid predecessor generation');
    if (retained.some(previous => previous.buildId === build.buildId)) throw Error('Duplicate predecessor identity');
    const files = {};
    const names = generation
      ? [...(build.runtimePackaging?.bundlePaths || []), ...Object.keys(generation.files || {})]
      : Object.keys(assets).filter(bundlePath);
    if (new Set(names).size !== names.length || names.some(relative => !retainedPath(relative, generation))) throw Error('Invalid predecessor runtime inventory');
    if (!names.some(bundlePath) || Object.values(build.runtimePackaging?.entries || {}).some(entry => !names.includes(`app/${entry}`))) throw Error('Predecessor runtime entry is missing');
    if (!generation) {
      // One transition from legacy packages: their root authorities must be
      // byte-identical. Never combine old chunks with changed auth/state code.
      for (const relative of [sharedContext, ...Object.keys(assets).filter(relative => rootModulePath(relative) && relative !== 'js/admin-dashboard.js')]) {
        const current = await fs.readFile(path.join(output, relative));
        if (hash(current) !== assets[relative]) throw Error(`Legacy predecessor has a changed root module: ${relative}`);
      }
    }
    for (const relative of names.sort()) {
      const bytes = await regularFile(root, relative);
      if (hash(bytes) !== assets[relative] || (generation?.files?.[relative] && generation.files[relative] !== assets[relative])) throw Error(`Predecessor runtime hash mismatch: ${relative}`);
      const existing = staged.get(relative) || await fs.readFile(path.join(output, relative)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (existing && !existing.equals(bytes)) throw Error(`Runtime URL collision: ${relative}`);
      staged.set(relative, bytes);
      files[relative] = assets[relative];
    }
    if (generation && (!Object.hasOwn(generation.files || {}, `${generation.prefix.slice(1)}/${sharedContext}`) || Object.entries(generation.files).some(([relative, digest]) => files[relative] !== digest))) throw Error('Predecessor root module snapshot is incomplete');
    retained.push({ buildId: build.buildId, generationId: generation?.id || null, files });
  }
  // Validate every input before writing; a rejected predecessor cannot partially
  // adopt an old generation into the new artifact.
  for (const [relative, bytes] of staged) {
    await fs.mkdir(path.dirname(path.join(output, relative)), { recursive: true });
    await fs.writeFile(path.join(output, relative), bytes);
  }
  return retained;
}

export function verifyRuntimeGenerations(packaging, assets) {
  const generation = packaging.generation;
  if (!generation || generation.prefix !== `/runtime/${generation.id}` || !/^[a-f0-9]{24}$/.test(generation.id)) throw Error('Missing current runtime generation');
  const retained = packaging.compatibility || [];
  if (!Array.isArray(retained) || retained.length > 2 || new Set(retained.map(r => r.buildId)).size !== retained.length) throw Error('Invalid retained runtime set');
  const current = generation.files || {}, allowed = new Map(Object.entries(current));
  if (!Object.keys(current).length || !Object.hasOwn(current, `${generation.prefix.slice(1)}/${sharedContext}`)) throw Error('Missing shared runtime context snapshot');
  for (const relative of Object.keys(current)) if (!retainedPath(relative, generation) || bundlePath(relative)) throw Error('Unexpected current shared runtime path');
  const retainedBundles = new Set();
  for (const predecessor of retained) {
    const previous = predecessor.generationId ? { id: predecessor.generationId } : null;
    for (const [relative, digest] of Object.entries(predecessor.files || {})) {
      if (!retainedPath(relative, previous)) throw Error('Unexpected retained runtime path');
      if (allowed.has(relative) && allowed.get(relative) !== digest) throw Error('Conflicting retained runtime digest');
      allowed.set(relative, digest);
      if (bundlePath(relative)) retainedBundles.add(relative);
    }
  }
  for (const [relative, digest] of allowed) if (!/^[a-f0-9]{64}$/.test(digest) || assets[relative] !== digest) throw Error(`Runtime manifest mismatch: ${relative}`);
  for (const relative of Object.keys(assets)) if (relative.startsWith('runtime/') && !allowed.has(relative)) throw Error('Unowned runtime generation in artifact');
  if (JSON.stringify([...retainedBundles].sort()) !== JSON.stringify([...(packaging.retainedBundlePaths || [])].sort())) throw Error('Retained bundle inventory does not match');
  return retainedBundles;
}
