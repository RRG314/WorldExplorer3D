import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'we3d-reality-capture-rules-test';
const OWNER = 'capture-owner';
const ATTACKER = 'capture-attacker';
const CAPTURE_ID = 'capture_0123456789abcdef0123456789abcdef';
const FILE_NAME = '0123456789abcdef0123456789abcdef.jpg';
let environment;
const denied = (error) => error?.code === 'storage/unauthorized';

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await fs.readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: await fs.readFile(new URL('../storage.rules', import.meta.url), 'utf8') }
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'realityCaptures', CAPTURE_ID), {
      captureId: CAPTURE_ID,
      ownerUid: OWNER,
      captureKind: 'exterior',
      status: 'draft',
      uploadSlots: { [FILE_NAME]: true, ['2'.repeat(32) + '.jpg']: true, ['3'.repeat(32) + '.jpg']: true }
    });
  });
});

test.after(async () => environment?.cleanup());

function photoMetadata(ownerUid = OWNER, captureId = CAPTURE_ID) {
  return {
    contentType: 'image/jpeg',
    customMetadata: {
      ownerUid,
      captureId,
      captureSchemaVersion: '1',
      width: '3024',
      height: '4032'
    }
  };
}

test('capture owner can create one normalized quarantine photo but cannot read or overwrite it', async () => {
  const ownerStorage = environment.authenticatedContext(OWNER).storage();
  const object = ref(ownerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/originals/${FILE_NAME}`);
  await uploadBytes(object, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), photoMetadata());
  await assert.rejects(() => getBytes(object), denied);
  await assert.rejects(() => uploadBytes(object, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), photoMetadata()), denied);
});

test('another account, wrong metadata, unsafe type, and processed path are denied', async () => {
  const attackerStorage = environment.authenticatedContext(ATTACKER).storage();
  const attackerPath = ref(attackerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/originals/11111111111111111111111111111111.jpg`);
  await assert.rejects(() => uploadBytes(attackerPath, new Uint8Array([1, 2, 3]), photoMetadata(ATTACKER)), denied);

  const ownerStorage = environment.authenticatedContext(OWNER).storage();
  const unreserved = ref(ownerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/originals/${'4'.repeat(32)}.jpg`);
  await assert.rejects(() => uploadBytes(unreserved, new Uint8Array([1, 2, 3]), photoMetadata()), denied);
  const wrongMetadata = ref(ownerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/originals/22222222222222222222222222222222.jpg`);
  await assert.rejects(() => uploadBytes(wrongMetadata, new Uint8Array([1, 2, 3]), photoMetadata(ATTACKER)), denied);

  const svg = ref(ownerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/originals/33333333333333333333333333333333.jpg`);
  await assert.rejects(() => uploadBytes(svg, new TextEncoder().encode('<svg/>'), { ...photoMetadata(), contentType: 'image/svg+xml' }), denied);

  const processed = ref(ownerStorage, `reality-captures/${OWNER}/${CAPTURE_ID}/processed/fake.glb`);
  await assert.rejects(() => uploadBytes(processed, new Uint8Array([1, 2, 3]), { contentType: 'model/gltf-binary' }), denied);
});
