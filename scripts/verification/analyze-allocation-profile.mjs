import { readFile, writeFile } from 'node:fs/promises';
const [input, output] = process.argv.slice(2);
const capture = JSON.parse(await readFile(input, 'utf8'));
const rows = [];
function visit(node, callers = []) {
  const frame = node.callFrame;
  let bytes = node.selfSize;
  for (const child of node.children || []) bytes += visit(child, [frame.functionName, ...callers].slice(0, 9));
  rows.push({ name: frame.functionName, url: frame.url, line: frame.lineNumber, column: frame.columnNumber,
    selfMiB: node.selfSize / 1048576, subtreeMiB: bytes / 1048576, callers });
  return bytes;
}
const totalMiB = visit(capture.profile.head) / 1048576;
const result = { totalMiB, scope: 'Estimated allocated bytes including collected objects; not resident memory',
  topSelf: [...rows].sort((a, b) => b.selfMiB - a.selfMiB).slice(0, 45),
  topSubtrees: [...rows].sort((a, b) => b.subtreeMiB - a.subtreeMiB).slice(0, 35) };
if (output) await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
