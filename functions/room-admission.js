const { Timestamp } = require('firebase-admin/firestore');

// All admission decisions share one transaction lock per room. Heartbeats can
// renew an unexpired lease, but only this authority can issue a new lease.
async function admitRoomPlayer({ db, uid, roomCode, displayName }) {
  if (!uid) throw Object.assign(new Error('Sign in before joining a room.'), { status: 401 });
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    throw Object.assign(new Error('Enter a valid 6-character room code.'), { status: 400 });
  }
  const roomRef = db.collection('rooms').doc(roomCode);
  const lockRef = roomRef.collection('admission').doc('current');
  const playerRef = roomRef.collection('players').doc(uid);
  return db.runTransaction(async transaction => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists) throw Object.assign(new Error('Room not found.'), { status: 404 });
    const room = roomSnapshot.data();
    await transaction.get(lockRef);
    const now = Date.now();
    const current = await transaction.get(playerRef);
    const active = await transaction.get(roomRef.collection('players').where('expiresAt', '>', Timestamp.fromMillis(now)));
    const cap = Math.max(2, Math.min(32, Math.trunc(Number(room.maxPlayers) || 10)));
    const alreadyActive = current.exists && current.data().expiresAt?.toMillis?.() > now;
    if (!alreadyActive && active.size >= cap) {
      throw Object.assign(new Error(`Room is full (${cap} players max). Try another room or retry shortly.`), { status: 409 });
    }
    const previous = current.exists ? current.data() : {};
    const world = room.world || {};
    const kind = ['earth', 'moon', 'space'].includes(world.kind) ? world.kind : 'earth';
    const role = room.ownerUid === uid ? 'owner' : room.mods?.[uid] === true ? 'mod' : 'member';
    transaction.set(playerRef, {
      uid, displayName: String(displayName || 'Explorer').trim().slice(0, 48) || 'Explorer',
      joinedAt: previous.joinedAt || Timestamp.fromMillis(now),
      lastSeenAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + 90_000),
      role, mode: kind === 'earth' ? 'walk' : kind,
      frame: { kind, locLat: Number(world.lat) || 0, locLon: Number(world.lon) || 0 },
      pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 },
      joinCode: roomCode
    });
    transaction.set(lockRef, { updatedAt: Timestamp.fromMillis(now) });
    return { joined: true, roomCode, role };
  });
}
module.exports = { admitRoomPlayer };
