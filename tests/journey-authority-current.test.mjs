import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { buildJourneyFormat } from '../scripts/build-journey-format.mjs';
import { fixture, envelope } from './helpers/journey-service-fixture.mjs';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
async function begin(
  f,
  { uid = 'account-a', value = envelope(uid), revision = 0, id = crypto.randomUUID() } = {}
) {
  const bytes = Buffer.from(JSON.stringify(value)),
    input = {
      action: 'begin',
      uploadId: id,
      clientId: crypto.randomUUID(),
      expectedRevision: revision,
      totalBytes: bytes.length,
      digest: hash(bytes),
      encoding: 'json',
    };
  const result = await f.api.handle(uid, input);
  return { uid, bytes, input, result, id };
}
async function complete(f, u) {
  await f.api.handle(u.uid, {
    action: 'chunk',
    uploadId: u.id,
    index: 0,
    data: u.bytes.toString('base64'),
  });
  return f.api.handle(u.uid, { action: 'commit', uploadId: u.id });
}
test('generated browser/server snapshot format remains byte-identical', async () => {
  const result = await buildJourneyFormat({ write: false });
  assert.equal(
    await fs.readFile(
      new URL('../functions/generated/journey-format.cjs', import.meta.url),
      'utf8'
    ),
    result.outputFiles[0].text
  );
});
test('a complete private save publishes once; same upload/chunk/commit retries are idempotent', async () => {
  const f = fixture(),
    u = await begin(f);
  assert.deepEqual(await f.api.handle(u.uid, u.input), u.result);
  assert.equal((await complete(f, u)).current.revision, 1);
  const first = await f.api.handle(u.uid, { action: 'commit', uploadId: u.id });
  assert.equal(first.current.revision, 1);
  assert.equal((await f.api.handle(u.uid, u.input)).committed, true);
  const head = await f.api.handle(u.uid, { action: 'head' });
  assert.equal(head.current.summary.name, 'River');
  const downloaded = await f.api.handle(u.uid, { action: 'download', snapshotId: u.id, index: 0 });
  assert.equal(downloaded.data, u.bytes.toString('base64'));
  assert.equal((await f.api.handle('account-b', { action: 'head' })).current, null);
  await assert.rejects(
    f.api.handle('account-b', { action: 'download', snapshotId: u.id, index: 0 }),
    (error) => error.status === 404
  );
});
test('incomplete, corrupt, wrong-owner and unsupported snapshots cannot replace the last good save', async () => {
  const f = fixture(),
    u = await begin(f);
  await assert.rejects(
    f.api.handle(u.uid, { action: 'commit', uploadId: u.id }),
    (error) => error.reason === 'journey_chunk_missing'
  );
  const changed = Buffer.from(u.bytes);
  changed[0] = 91;
  await f.api.handle(u.uid, {
    action: 'chunk',
    uploadId: u.id,
    index: 0,
    data: changed.toString('base64'),
  });
  await assert.rejects(
    f.api.handle(u.uid, {
      action: 'chunk',
      uploadId: u.id,
      index: 0,
      data: u.bytes.toString('base64'),
    }),
    (error) => error.reason === 'journey_chunk_identity_reused'
  );
  await assert.rejects(
    f.api.handle(u.uid, { action: 'commit', uploadId: u.id }),
    (error) => error.reason === 'journey_checksum_mismatch'
  );
  assert.equal((await f.api.handle(u.uid, { action: 'head' })).revision, 0);
  const g = fixture(),
    wrong = await begin(g, { value: envelope('account-b') });
  await assert.rejects(complete(g, wrong), (error) => error.reason === 'journey_format_invalid');
});
test('base revisions protect concurrent devices and uploaded state never makes an online score', async () => {
  const f = fixture(),
    u = await begin(f);
  await assert.rejects(begin(f), (error) => error.reason === 'journey_save_in_progress');
  await complete(f, u);
  f.advance(3000);
  await assert.rejects(begin(f), (error) => error.reason === 'journey_revision_changed');
  const second = await begin(f, { revision: 1 });
  await complete(f, second);
  const head = await f.api.handle(u.uid, { action: 'head' });
  assert.equal(head.previous.snapshotId, u.id);
  assert.deepEqual([...f.docs.keys()], ['users/account-a/gameplay/personalJourney']);
});
test('expired partial uploads and displaced third snapshots are collected; account cleanup is scoped', async () => {
  const f = fixture(),
    first = await begin(f);
  await complete(f, first);
  f.advance(3000);
  const second = await begin(f, { revision: 1 });
  await complete(f, second);
  f.advance(3000);
  const third = await begin(f, { revision: 2 });
  await complete(f, third);
  assert.ok(![...f.files.keys()].some((path) => path.includes(first.id)));
  const other = await begin(f, { uid: 'account-b' });
  await complete(f, other);
  await f.api.cleanup('account-a');
  assert.equal(f.files.size, 1);
  assert.ok(
    [...f.files.keys()][0].startsWith('player-journeys/' + hash(Buffer.from('account-b')) + '/')
  );
});
test('cloud payload allowlist rejects credential storage and unsupported personal wallets', async () => {
  const f = fixture(),
    value = envelope();
  value.deviceState.local.providerApiKey = 'never-sync';
  const u = await begin(f, { value });
  await assert.rejects(complete(f, u), (error) => error.reason === 'journey_format_invalid');
  const g = fixture(),
    v = envelope();
  v.deviceState.backpack = {
    schemaVersion: 3,
    items: [],
    commerce: { schemaVersion: 99, credits: 100 },
  };
  await assert.rejects(
    complete(g, await begin(g, { value: v })),
    (error) => error.reason === 'journey_format_invalid'
  );
});

test('future manifest schemas are protected and a future payload cannot replace the current save', async () => {
  const f = fixture();
  f.docs.set('users/account-a/gameplay/personalJourney', { schemaVersion: 99, revision: 7 });
  await assert.rejects(
    f.api.handle('account-a', { action: 'head' }),
    (error) => error.reason === 'journey_update_required'
  );
  assert.equal(f.docs.get('users/account-a/gameplay/personalJourney').schemaVersion, 99);
  const g = fixture(),
    first = await begin(g);
  await complete(g, first);
  g.advance(3000);
  const value = envelope();
  value.schemaVersion = 99;
  await assert.rejects(
    complete(g, await begin(g, { revision: 1, value })),
    (error) => error.reason === 'journey_format_invalid'
  );
  assert.equal((await g.api.handle('account-a', { action: 'head' })).current.snapshotId, first.id);
});
