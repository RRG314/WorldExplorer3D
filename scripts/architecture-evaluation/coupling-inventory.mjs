// Development-only source analysis. Never imported by the game.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const tooling = process.env.WE3D_ANALYSIS_TOOLS || 'output/architecture-evaluation/tooling/node_modules';
const { parse } = await import(pathToFileURL(`${process.cwd()}/${tooling}/@babel/parser/lib/index.js`));
const { default: traverse } = await import(pathToFileURL(`${process.cwd()}/${tooling}/@babel/traverse/lib/index.js`));
const inventory = JSON.parse(await readFile('docs/architecture-evaluation/evidence/source-inventory.json', 'utf8'));
const rows = [];
for (const [file, lexical] of Object.entries(inventory.records)) {
  if (!lexical.sharedContext && !lexical.threeReferences) continue;
  const source = await readFile(file, 'utf8');
  const ast = parse(source, { sourceType: 'module', allowReturnOutsideFunction: false });
  const events = [], three = new Map(), bindings = new Map();
  function record(path, kind, name, detail) {
    events.push({ line: path.node.loc.start.line, kind, path: name, ...(detail ? { detail } : {}) });
  }
  function memberName(node) {
    if (!node.computed && node.property.type === 'Identifier') return node.property.name;
    if (['StringLiteral', 'NumericLiteral'].includes(node.property.type)) return String(node.property.value);
    return '[computed]';
  }
  function resolve(path) {
    if (!path?.node) return null;
    if (path.isIdentifier()) return bindings.get(path.scope.getBinding(path.node.name)) ?? null;
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      const root = resolve(path.get('object'));
      return root === null ? null : `${root}.${memberName(path.node)}`;
    }
    return null;
  }
  traverse(ast, { ImportDeclaration(path) {
    if (!path.node.source.value.includes('shared-context')) return;
    for (const spec of path.node.specifiers) {
      if (spec.type === 'ImportSpecifier' && spec.imported.name === 'ctx') {
        bindings.set(path.scope.getBinding(spec.local.name), 'ctx');
      }
    }
  }});
  // Follow lexical aliases and destructuring. Mutable/reassigned aliases are not assumed stable.
  for (let pass = 0; pass < 6; pass++) {
    let added = 0;
    traverse(ast, { VariableDeclarator(path) {
      const base = resolve(path.get('init'));
      if (base === null) return;
      const bind = (name, value) => {
        const binding = path.scope.getBinding(name);
        if (binding?.constant && !bindings.has(binding)) { bindings.set(binding, value); added++; }
      };
      const id = path.node.id;
      if (id.type === 'Identifier') bind(id.name, base);
      if (id.type === 'ObjectPattern') for (const prop of id.properties) {
        if (prop.type !== 'ObjectProperty' || prop.computed) continue;
        const value = prop.value.type === 'AssignmentPattern' ? prop.value.left : prop.value;
        if (value.type === 'Identifier') bind(value.name, `${base}.${prop.key.name ?? prop.key.value}`);
      }
    }});
    if (!added) break;
  }
  traverse(ast, {
    ReferencedIdentifier(path) {
      const name = resolve(path);
      if (name === null) return;
      const parent = path.parentPath;
      if ((parent.isMemberExpression() || parent.isOptionalMemberExpression()) && parent.node.object === path.node) return;
      record(path, 'read', name, 'Root or constant alias reference; see escapes for indirect effects.');
    },
    'MemberExpression|OptionalMemberExpression'(path) {
      const object = path.node.object;
      const directThree = object.type === 'Identifier' && object.name === 'THREE';
      const globalThree = ['MemberExpression', 'OptionalMemberExpression'].includes(object.type) && object.property.name === 'THREE';
      if (directThree || globalThree) {
        const name = memberName(path.node);
        if (!three.has(name)) three.set(name, []);
        three.get(name).push(path.node.loc.start.line);
      }
      const name = resolve(path);
      if (name === null) return;
      const parent = path.parentPath;
      // Outermost path is more informative than every intermediate prefix.
      if ((parent.isMemberExpression() || parent.isOptionalMemberExpression()) && parent.node.object === path.node) return;
      if (parent.isAssignmentExpression() && parent.node.left === path.node) {
        record(path, 'write', name);
        if (parent.node.operator !== '=') record(path, 'read', name);
      } else if (parent.isUpdateExpression()) {
        record(path, 'read', name); record(path, 'write', name);
      } else if (parent.isUnaryExpression({ operator: 'delete' })) record(path, 'delete', name);
      else if ((parent.isCallExpression() || parent.isOptionalCallExpression()) && parent.node.callee === path.node) {
        record(path, 'call', name, 'Callee effects are not inferred; method may mutate receiver.');
      } else record(path, 'read', name);
    },
    'CallExpression|OptionalCallExpression'(path) {
      const callee = path.node.callee;
      if (callee.type === 'MemberExpression' && callee.object.name === 'Object' && ['assign', 'defineProperty', 'defineProperties'].includes(callee.property.name)) {
        const target = resolve(path.get('arguments.0'));
        if (target !== null) {
          const arg = path.node.arguments[1];
          if (callee.property.name === 'defineProperty') record(path, 'write', `${target}.${arg?.value ?? '[computed]'}`);
          else if (arg?.type === 'ObjectExpression') for (const prop of arg.properties) {
            record(path, 'write', `${target}.${prop.type === 'SpreadElement' || prop.computed ? '[computed]' : prop.key.name ?? prop.key.value}`);
          } else record(path, 'write', `${target}.[computed]`);
        }
      }
      path.get('arguments').forEach(arg => {
        const name = resolve(arg);
        if (name !== null) record(arg, 'escape', name, 'Passed to a function; transitive reads/writes require callee review.');
      });
    }
  });
  const unique = kind => [...new Set(events.filter(e => e.kind === kind).map(e => e.path))].sort();
  rows.push({ file, sha256: createHash('sha256').update(source).digest('hex'), lines: source.split('\n').length,
    sharedContext: lexical.sharedContext, lexicalThreeCount: lexical.threeReferences,
    reads: unique('read'), writes: unique('write'), deletes: unique('delete'), calls: unique('call'), escapes: unique('escape'),
    three: Object.fromEntries([...three].sort()), events });
}
const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  method: 'Babel AST, binding-aware context imports and constant member aliases. Direct reads/writes/calls/deletes and function escapes. Dynamic properties remain computed. Calls, closures, reflective access and aliased mutation require manual transitive review. This is source evidence, not a runtime profile or completed module classification.',
  counts: { modules: rows.length, context: rows.filter(x => x.sharedContext).length, lexicalThree: rows.filter(x => x.lexicalThreeCount).length, astThree: rows.filter(x => Object.keys(x.three).length).length }, rows };
const { rows: moduleRows, ...metadata } = result;
// One record per module keeps generated evidence diffable without an 80,000-line dump.
await writeFile('docs/architecture-evaluation/evidence/coupling-accesses.json', JSON.stringify(metadata).slice(0, -1) + ',\n"rows":[\n' + moduleRows.map(row => JSON.stringify(row)).join(',\n') + '\n]}\n');
console.log(JSON.stringify(result.counts));
