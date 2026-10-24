const { Timestamp } = require('firebase-admin/firestore');
const { weeklyRoomDescriptor } = require('./generated/weekly-room-model.cjs');
const WEEKLY_OWNER = '__world_explorer_weekly__';

// All admission decisions share one transaction lock per room. Heartbeats can
// renew an unexpired lease, but only this authority can issue a new lease.
async function admitRoomPlayer({ db, uid, roomCode, displayName, weekly = false, now = Date.now }) {
  if (!uid) throw Object.assign(new Error('Sign in before joining a room.'), { status: 401 });
  const time=now(),featured=weekly?weeklyRoomDescriptor(new Date(time)):null;
  if(featured)roomCode=featured.code;
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
    throw Object.assign(new Error('Enter a valid 6-character room code.'), { status: 400 });
  }
  const roomRef = db.collection('rooms').doc(roomCode);
  const lockRef = roomRef.collection('admission').doc('current');
  const playerRef = roomRef.collection('players').doc(uid);
  return db.runTransaction(async transaction => {
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists&&!featured) throw Object.assign(new Error('Room not found.'), { status: 404 });
    const room = roomSnapshot.exists?roomSnapshot.data():{
      code:roomCode,createdAt:Timestamp.fromMillis(time),createdBy:WEEKLY_OWNER,ownerUid:WEEKLY_OWNER,
      name:`Weekly City • ${featured.city} (${featured.weekKey})`,visibility:'public',featured:true,
      maxPlayers:32,mods:{},cityKey:featured.cityKey,world:featured.world,
      locationTag:{label:`Weekly City: ${featured.city}`,city:featured.city,cityKey:featured.cityKey,kind:'earth'},
      rules:{allowChat:true,allowGhosts:true,paintTimeLimitSec:120,paintTouchMode:'any',allowPaintballGun:true,allowRoofAutoPaint:true},
      systemKind:'weekly',weekKey:featured.weekKey
    };
    if(featured&&(room.ownerUid!==WEEKLY_OWNER||room.weekKey!==featured.weekKey||room.systemKind!=='weekly')){
      throw Object.assign(new Error('The weekly room code is unavailable. Existing room data has been kept.'),{status:409});
    }
    await transaction.get(lockRef);
    const currentTime = now();
    const current = await transaction.get(playerRef);
    const active = await transaction.get(roomRef.collection('players').where('expiresAt', '>', Timestamp.fromMillis(currentTime)));
    const cap = Math.max(2, Math.min(32, Math.trunc(Number(room.maxPlayers) || 10)));
    const alreadyActive = current.exists && current.data().expiresAt?.toMillis?.() > currentTime;
    if (!alreadyActive && active.size >= cap) {
      throw Object.assign(new Error(`Room is full (${cap} players max). Try another room or retry shortly.`), { status: 409 });
    }
    const previous = current.exists ? current.data() : {};
    const world = room.world || {};
    const kind = ['earth', 'moon', 'space'].includes(world.kind) ? world.kind : 'earth';
    const role = room.ownerUid === uid ? 'owner' : room.mods?.[uid] === true ? 'mod' : 'member';
    if(!roomSnapshot.exists)transaction.create(roomRef,room);
    transaction.set(playerRef, {
      uid, displayName: String(displayName || 'Explorer').trim().slice(0, 48) || 'Explorer',
      joinedAt: previous.joinedAt || Timestamp.fromMillis(currentTime),
      lastSeenAt: Timestamp.fromMillis(currentTime), expiresAt: Timestamp.fromMillis(currentTime + 90_000),
      role, mode: kind === 'earth' ? 'walk' : kind,
      frame: { kind, locLat: Number(world.lat) || 0, locLon: Number(world.lon) || 0 },
      pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 },
      joinCode: roomCode
    });
    transaction.set(lockRef, { updatedAt: Timestamp.fromMillis(currentTime) });
    return { joined: true, roomCode, role };
  });
}
module.exports = { admitRoomPlayer };
