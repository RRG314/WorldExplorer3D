import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PRODUCT_CAPABILITIES, CAPABILITY_STATUS } from '../../app/js/product/capabilities.js';
import { capabilityAuditEvidence } from './product-capability-evidence.mjs';
const capabilities = PRODUCT_CAPABILITIES.map(entry => ({ ...entry, ...capabilityAuditEvidence(entry.id) }));
const root = new URL('../../', import.meta.url);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const owners = {};
for (const entry of capabilities) owners[entry.owner] ||= hash(await fs.readFile(new URL(entry.owner, root)));
const payload = { schemaVersion: 1, scope: 'Local source capability descriptions; not production or full journey certification',
  registrySha256: hash(await fs.readFile(new URL('app/js/product/capabilities.js', root))),
  evidenceSha256: hash(await fs.readFile(new URL('./product-capability-evidence.mjs', import.meta.url))), owners, capabilities };
const directory = new URL('docs/product-audit/2026-10-01/', root);
await fs.writeFile(new URL('capabilities.json', directory), JSON.stringify(payload, null, 2) + '\n');
const lines = ['# Current capability ownership and persistence', '',
  'Generated from `app/js/product/capabilities.js`. Quick Start uses only the player descriptions. Contributor ownership and evidence notes are kept separately in `scripts/audits/product-capability-evidence.mjs`. Status describes implemented scope, not release certification. Owner paths identify runtime entrypoints; this registry does not grant permissions or replace their state authorities.', '',
  'Catalog families are included individually: authored route templates, field activities, equipment and Live Earth layers. Adding catalog content gives it conservative Limited status until reviewed. Regenerate with `node scripts/audits/product-capabilities.mjs`.', '',
  '| Capability | Status | Runtime owner | Persistence | Evidence boundary |', '|---|---|---|---|---|'];
for (const e of capabilities) lines.push(`| ${e.label} (${e.id}) | ${CAPABILITY_STATUS[e.status]} | \`${e.owner}\` | ${e.persistence} | ${e.acceptance} |`);
await fs.writeFile(new URL('CAPABILITIES.md', directory), lines.join('\n') + '\n');
console.log(`Wrote ${PRODUCT_CAPABILITIES.length} capabilities and ${Object.keys(owners).length} owner hashes.`);
