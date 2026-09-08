import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
const directory = new URL('../app/vendor/qrcode/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({ entryPoints: ['node_modules/qrcode/lib/browser.js'], bundle: true, format: 'esm',
  platform: 'browser', minify: true, outfile: new URL('qrcode.js', directory).pathname });
await copyFile(new URL('../node_modules/qrcode/license', import.meta.url), new URL('LICENSE', directory));
