const crypto = require('node:crypto');

// Scope operation identity to the authenticated owner. Legacy clients without an
// operation ID remain supported, but cannot request replay recovery.
async function saveContributionOnce({ db, uid, requestId, record, timestamp }) {
  const id = requestId == null ? '' : String(requestId);
  if (id && !/^[A-Za-z0-9_-]{16,128}$/.test(id)) {
    throw Object.assign(new Error('Invalid contribution request ID.'), { status: 400 });
  }
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  const collection = db.collection('editorSubmissions');
  const ref = id
    ? collection.doc(crypto.createHash('sha256').update(`${uid}:${id}`).digest('hex'))
    : collection.doc();
  const result = await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const saved = existing.data();
      if (saved.userId !== uid || saved.requestFingerprint !== fingerprint) {
        throw Object.assign(new Error('This request ID was already used for a different contribution.'), { status: 409 });
      }
      return { replayed: true, status: saved.status };
    }
    transaction.create(ref, {
      ...record, userId: uid, status: 'pending',
      ...(id ? { requestId: id, requestFingerprint: fingerprint } : {}),
      createdAt: timestamp, updatedAt: timestamp
    });
    return { replayed: false, status: 'pending' };
  });
  return { ref, ...result };
}
module.exports = { saveContributionOnce };
