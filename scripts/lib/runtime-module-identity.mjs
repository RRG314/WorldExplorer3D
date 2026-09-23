import path from 'node:path';

// Version queries invalidate browser caches. Within one immutable bundle they
// must not create a second module instance beside an unversioned entry point.
export function canonicalBundledModule(importPath, resolveDir) {
  const match = /^(\..*\.m?js)\?v=\d+$/.exec(importPath);
  return match ? path.resolve(resolveDir, match[1]) : null;
}

export function rewritePackagedModuleReference(source, sourcePath, packagedPath) {
  const escaped = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(['"])${escaped}(?:\\?v=\\d+)?\\1`, 'g');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected one runtime import for ${sourcePath}, found ${matches.length}`);
  return source.replace(pattern, (_, quote) => `${quote}${packagedPath}${quote}`);
}
