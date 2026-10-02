// Only the receipt owner may see the state of its uploads. The browser Journal
// itself remains shared across sign-ins; receipts are not a full cloud backup.
export function summarizeReceiptState(items, rows, ownerUid) {
  const queuedInstances = new Set(rows.map(row => row.instanceId));
  const owned = ownerUid ? rows.filter(row => row.ownerUid === ownerUid) : [];
  const acknowledged = ownerUid ? items.filter(item => item.receiptOwnerUid === ownerUid && item.serverItemId).length : 0;
  return Object.freeze({
    pending: owned.filter(row => row.status === 'pending').length,
    blocked: owned.filter(row => row.status === 'blocked').length,
    acknowledged,
    deviceOnly: items.filter(item => !item.serverItemId && !queuedInstances.has(item.instanceId)).length
  });
}

export function discoverySaveMessage({ durable, signedIn, receipts = {}, backpackSaved = true, online = true }) {
  if (!durable) return 'Session only — browser storage is unavailable. Download a backup before leaving.';
  const lines = ['Journal saved on this device. Everyone using this browser profile shares this local Journal.'];
  if (signedIn) {
    lines.push(`${receipts.acknowledged || 0} collected-item ${receipts.acknowledged === 1 ? 'receipt' : 'receipts'} acknowledged by your account.`);
    if (receipts.pending) lines.push(`${receipts.pending} waiting to upload${online ? '; retrying automatically' : '; reconnect to retry'}.`);
    if (receipts.blocked) lines.push(`${receipts.blocked} could not be acknowledged. Local records are retained; download a backup.`);
  } else lines.push('Sign in for receipts on future collected items. Existing guest records stay local.');
  if (receipts.deviceOnly) lines.push(`${receipts.deviceOnly} collected items are device-only.`);
  if (!backpackSaved) lines.push('Backpack copy could not be saved. Collected items remain in the Journal and will be restored when storage is available.');
  lines.push('Observations and the full Journal are not backed up to your account.');
  return lines.join(' ');
}

export function persistBackpackProjection(appCtx) {
  let saved = false;
  try { saved = appCtx.playerBackpackStore?.save?.(appCtx.playerBackpackInventory?.exportState?.()) === true; } catch { /* Keep the durable Journal as recovery source. */ }
  appCtx.discoveryBackpackSaved = saved;
  return saved;
}
