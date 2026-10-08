import test from 'node:test';
import assert from 'node:assert/strict';
import { codeReferences } from '../scripts/verification/runtime-dependencies.mjs';

test('inventory discovers unfamiliar extensionless modules and ignores comments and data URLs', () => {
  assert.deepEqual(codeReferences(`
    // import 'https://ignored.invalid/comment.js';
    import 'https://unreviewed.invalid/module@2';
    export * from 'https://another.invalid/other@1';
    import('https://runtime.invalid/lazy@3');
    const library = 'https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm';
    const tile = 'https://data.invalid/tiles.json';
  `), ['https://another.invalid/other@1','https://cdn.jsdelivr.net/npm/pbf@3.2.1/+esm','https://runtime.invalid/lazy@3','https://unreviewed.invalid/module@2']);
});
test('inline modules, classic scripts and import maps are included in the executable inventory', () => {
  assert.deepEqual(codeReferences(`<script src="https://classic.invalid/runtime"></script>
    <script type="module">import 'https://inline.invalid/package@1';</script>
    <script type="importmap">{"imports":{"a":"https://maps.invalid/a"},"scopes":{"/":{"b":"https://maps.invalid/b"}}}</script>
    <script type="application/ld+json">{"url":"https://not-code.invalid/about"}</script>`, '.html'),
    ['https://classic.invalid/runtime','https://inline.invalid/package@1','https://maps.invalid/a','https://maps.invalid/b']);
});
