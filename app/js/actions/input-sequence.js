// One receipt owner per admitted session, independent of replaceable pose records.
// The gateway supplies the session epoch and owns its retention/rotation policy.
export function createInputSequenceLedger({ maxSessions = 32, maxReceipts = 64 } = {}) {
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 32 ||
      !Number.isInteger(maxReceipts) || maxReceipts < 1 || maxReceipts > 128) throw new RangeError('Invalid receipt budget');
  const sessions = new Map();
  return Object.freeze({
    lookup(uid, epoch, sequence) {
      if (typeof uid !== 'string' || !uid || typeof epoch !== 'string' || !epoch ||
          !Number.isSafeInteger(sequence) || sequence < 0 || sequence > 0x7fffffff) return { reason: 'invalid_sequence' };
      let session = sessions.get(uid);
      if (session && session.epoch !== epoch) return { reason: 'session_epoch_conflict' };
      if (!session) {
        if (sessions.size >= maxSessions) return { reason: 'session_budget' };
        session = { epoch, highest: -1, receipts: new Map() }; sessions.set(uid, session);
      }
      if (session.receipts.has(sequence)) return { receipt: session.receipts.get(sequence) };
      if (sequence <= session.highest) return { reason: 'stale_sequence' };
      return { commit(result) {
        // Resolution is synchronous. Recheck so even a mistakenly reused ticket
        // cannot replace a receipt or move the high-water mark backward.
        if (session.receipts.has(sequence)) return session.receipts.get(sequence);
        if (sequence <= session.highest) return Object.freeze({ accepted: false, reason: 'stale_sequence' });
        const receipt = Object.freeze({ ...result, sequence, epoch });
        session.highest = sequence; session.receipts.set(sequence, receipt);
        if (session.receipts.size > maxReceipts) session.receipts.delete(session.receipts.keys().next().value);
        return receipt;
      } };
    },
    // Only the admitted-session owner may release a departed actor. Never call
    // on a transient socket disconnect: retries must retain their receipt.
    release(uid, epoch) {
      if (sessions.get(uid)?.epoch !== epoch) return false;
      return sessions.delete(uid);
    },
    clear() { sessions.clear(); },
    snapshot() { return { sessions: sessions.size, receipts: [...sessions.values()].reduce((n,s) => n+s.receipts.size,0) }; }
  });
}
