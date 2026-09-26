// A missing cached profile is not permission to merge creation fields over a
// concurrently provisioned account. The transaction retries that race as a read.
export async function ensureRoomUserProfile({ db, userRef, profile, runTransaction, serverTimestamp, getDocFromServer }) {
  const existing = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.exists()) return snapshot;
    transaction.set(userRef, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return null;
  });
  return existing || getDocFromServer(userRef);
}
