'use strict';

function millis(value) {
  const n = typeof value?.toMillis === 'function' ? value.toMillis() : NaN;
  return Number.isFinite(n) ? n : NaN;
}

function activeExpeditionPresence(player, uid, nowMs) {
  if (!player || player.uid !== uid) return false;
  const seen = millis(player.lastSeenAt), expires = millis(player.expiresAt);
  // Admission owns expiry. A recent heartbeat alone cannot revive an expired
  // seat, and missing legacy expiry must go through normal room admission.
  return Number.isFinite(seen) && Number.isFinite(expires) &&
    seen <= nowMs + 5000 && nowMs - seen <= 120000 && expires > nowMs;
}

function requireExpeditionMembership(room, player, uid, nowMs) {
  if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
  if (!player) throw Object.assign(new Error('Join this room before using its Expedition.'), { status: 403 });
  if (!activeExpeditionPresence(player, uid, nowMs)) {
    throw Object.assign(new Error('Room presence expired. Rejoin the room and try again.'), { status: 409 });
  }
}

module.exports = { activeExpeditionPresence, requireExpeditionMembership };
