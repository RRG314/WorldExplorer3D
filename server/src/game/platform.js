import {
  COMMAND_TYPES,
  MISSION_DEFINITIONS,
  PLAYER_MAX_HEALTH,
  WEAPON_DEFINITIONS
} from '@we3d/mmo-contracts';
import { ProjectileState } from '../state.js';
import {
  awardProfile,
  createPlayerProfile,
  leaderboardRow,
  missionEligibility,
  profileForStorage,
  recordMissionCompletion
} from './player-profile.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function distance3d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function targetInAimCone(attacker, target, degrees) {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return true;
  const forwardX = Math.sin(attacker.yaw);
  const forwardZ = Math.cos(attacker.yaw);
  const dot = (dx / length) * forwardX + (dz / length) * forwardZ;
  return dot >= Math.cos((Math.max(1, degrees) * Math.PI / 180) / 2);
}

class AuthoritativeGamePlatform {
  constructor(options) {
    this.state = options.state;
    this.store = options.store;
    this.manifest = options.manifest;
    this.emit = options.emit || (() => {});
    this.cellKeyForPosition = options.cellKeyForPosition;
    this.onProjectileAdded = options.onProjectileAdded || (() => {});
    this.onProjectileMoved = options.onProjectileMoved || (() => {});
    this.onProjectileRemoved = options.onProjectileRemoved || (() => {});
    this.now = options.now || (() => Date.now());
    this.profiles = new Map();
    this.displayNames = new Map();
    this.cooldowns = new Map();
    this.projectileBornAt = new Map();
    this.dirty = new Set();
    this.projectileSequence = 0;
  }

  async addPlayer(player) {
    const saved = await this.store.loadPlayerProgression(this.manifest.id, player.uid);
    const profile = createPlayerProfile(player.uid, saved || {});
    profile.displayName = player.displayName;
    this.profiles.set(player.uid, profile);
    this.displayNames.set(player.uid, player.displayName);
    this.syncPlayer(player, profile);
    return this.snapshot(player.uid);
  }

  syncPlayer(player, profile = this.profiles.get(player.uid)) {
    if (!player || !profile) return;
    player.maxHealth = PLAYER_MAX_HEALTH;
    player.health = clamp(player.health || PLAYER_MAX_HEALTH, 1, PLAYER_MAX_HEALTH);
    player.level = profile.level;
    player.xp = profile.xp;
    player.credits = profile.credits;
    player.equippedWeapon = profile.equippedWeapon;
    player.activeMissionId = profile.activeMission?.id || '';
    player.missionProgress = profile.activeMission?.progress || 0;
  }

  snapshot(uid) {
    const profile = this.profiles.get(String(uid || ''));
    return profile ? structuredClone(profile) : null;
  }

  catalog(uid = '') {
    const profile = this.profiles.get(String(uid || ''));
    return {
      version: 2,
      missions: Object.values(MISSION_DEFINITIONS).map((mission) => ({
        ...mission,
        eligibility: missionEligibility(profile, mission, this.now())
      })),
      weapons: Object.values(WEAPON_DEFINITIONS).map((weapon) => ({ ...weapon })),
      activityResults: {
        trust: 'client_verified',
        authoritativeRewards: false
      }
    };
  }

  markDirty(uid) {
    if (this.profiles.has(uid)) this.dirty.add(uid);
  }

  async savePlayer(uid) {
    const profile = this.profiles.get(String(uid || ''));
    if (!profile) return;
    this.dirty.delete(profile.uid);
    await this.store.savePlayerProgression(this.manifest.id, profile.uid, profileForStorage(profile));
  }

  async removePlayer(player) {
    if (!player) return;
    await this.savePlayer(player.uid);
    this.profiles.delete(player.uid);
    this.displayNames.delete(player.uid);
    this.cooldowns.delete(player.uid);
  }

  flushDirty() {
    const dirty = Array.from(this.dirty);
    this.dirty.clear();
    for (const uid of dirty) {
      this.savePlayer(uid).catch(() => this.dirty.add(uid));
    }
  }

  award(uid, reward, reason) {
    const profile = this.profiles.get(uid);
    const player = this.state.players.get(uid);
    if (!profile || !player) return null;
    const previousLevel = profile.level;
    awardProfile(profile, reward);
    this.syncPlayer(player, profile);
    this.markDirty(uid);
    const event = {
      type: 'progression.reward', uid, reason,
      xp: Math.max(0, Number(reward?.xp) || 0),
      credits: Math.max(0, Number(reward?.credits) || 0),
      level: profile.level,
      levelUp: profile.level > previousLevel
    };
    this.emit(event);
    return event;
  }

  recordMetric(uid, metric, amount) {
    const profile = this.profiles.get(uid);
    const player = this.state.players.get(uid);
    if (!profile || !player || !Object.hasOwn(profile.stats, metric)) return null;
    const delta = Math.max(0, Number(amount) || 0);
    if (delta <= 0) return null;
    profile.stats[metric] += delta;
    profile.updatedAtMs = this.now();
    const mission = profile.activeMission;
    const definition = mission ? MISSION_DEFINITIONS[mission.id] : null;
    let completed = null;
    if (definition?.metric === metric) {
      mission.progress = Math.min(definition.target, profile.stats[metric] - mission.baseline);
      if (mission.progress >= definition.target) {
        profile.stats.missionsCompleted += 1;
        recordMissionCompletion(profile, definition.id, this.now());
        profile.activeMission = null;
        completed = definition;
        this.award(uid, { xp: definition.rewardXp, credits: definition.rewardCredits }, `mission:${definition.id}`);
        this.emit({ type: 'mission.completed', uid, missionId: definition.id });
      }
    }
    this.syncPlayer(player, profile);
    this.markDirty(uid);
    return completed;
  }

  recordMovement(player, distance, inVehicle) {
    this.recordMetric(player.uid, inVehicle ? 'distanceDrivenM' : 'distanceWalkedM', distance);
  }

  recordObjectPlaced(uid) {
    this.recordMetric(uid, 'objectsPlaced', 1);
  }

  acceptMission(player, missionId) {
    const profile = this.profiles.get(player.uid);
    const definition = MISSION_DEFINITIONS[String(missionId || '')];
    if (!profile || !definition) {
      throw Object.assign(new Error('Mission is not in the server catalog.'), { code: 'unknown_mission' });
    }
    if (profile.activeMission) {
      throw Object.assign(new Error('Finish the active mission before starting another.'), { code: 'mission_active' });
    }
    const eligibility = missionEligibility(profile, definition, this.now());
    if (!eligibility.available) {
      throw Object.assign(new Error(
        definition.cadence === 'daily' ? 'This daily mission is complete for today.' : 'This mission is already complete.'
      ), {
        code: 'mission_not_available',
        retryAfterMs: Math.max(0, eligibility.nextAvailableAtMs - this.now())
      });
    }
    profile.activeMission = {
      id: definition.id,
      baseline: profile.stats[definition.metric],
      progress: 0
    };
    profile.updatedAtMs = this.now();
    this.syncPlayer(player, profile);
    this.markDirty(player.uid);
    this.emit({ type: 'mission.accepted', uid: player.uid, missionId: definition.id });
    return this.snapshot(player.uid);
  }

  equipWeapon(player, weaponId) {
    const profile = this.profiles.get(player.uid);
    const weapon = WEAPON_DEFINITIONS[String(weaponId || '')];
    if (!profile || !weapon) throw Object.assign(new Error('Weapon is not in the server catalog.'), { code: 'unknown_weapon' });
    if (!profile.unlockedWeapons.includes(weapon.id)) {
      throw Object.assign(new Error(`Weapon unlocks at level ${weapon.unlockLevel}.`), { code: 'weapon_locked' });
    }
    profile.equippedWeapon = weapon.id;
    profile.updatedAtMs = this.now();
    this.syncPlayer(player, profile);
    this.markDirty(player.uid);
    return this.snapshot(player.uid);
  }

  validateAttack(player, weapon) {
    if (!this.manifest.rules.allowCombat) {
      throw Object.assign(new Error('Combat is disabled in this room.'), { code: 'room_rule_denied' });
    }
    const active = Array.from(this.state.projectiles.values())
      .filter((projectile) => projectile.ownerUid === player.uid).length;
    if (weapon.category === 'projectile' && active >= this.manifest.budget.maxProjectilesPerActor) {
      throw Object.assign(new Error('Projectile budget reached.'), { code: 'projectile_budget_reached' });
    }
    const readyAt = this.cooldowns.get(player.uid) || 0;
    if (this.now() < readyAt) {
      throw Object.assign(new Error('Weapon is cooling down.'), { code: 'weapon_cooldown', retryAfterMs: readyAt - this.now() });
    }
    this.cooldowns.set(player.uid, this.now() + weapon.cooldownMs);
  }

  resolveTarget(player, targetId, weapon) {
    const target = this.state.players.get(String(targetId || ''));
    if (!target || !target.connected || target.uid === player.uid) {
      throw Object.assign(new Error('A valid nearby target is required.'), { code: 'invalid_target' });
    }
    if (distance3d(player, target) > weapon.rangeM) {
      throw Object.assign(new Error('Target is outside weapon range.'), { code: 'out_of_range' });
    }
    if (!targetInAimCone(player, target, weapon.aimDegrees)) {
      throw Object.assign(new Error('Target is outside the aim cone.'), { code: 'invalid_aim' });
    }
    return target;
  }

  applyDamage(attacker, target, weapon) {
    target.health = Math.max(0, target.health - weapon.damage);
    this.emit({
      type: 'combat.hit', attackerUid: attacker.uid, targetUid: target.uid,
      weaponId: weapon.id, damage: weapon.damage, health: target.health
    });
    if (target.health > 0) return false;
    this.recordMetric(attacker.uid, 'eliminations', 1);
    this.recordMetric(target.uid, 'deaths', 1);
    this.award(attacker.uid, { xp: 75, credits: 25 }, 'combat:elimination');
    target.health = PLAYER_MAX_HEALTH;
    target.x = 0;
    target.y = 0;
    target.z = 0;
    target.vx = 0;
    target.vy = 0;
    target.vz = 0;
    this.emit({ type: 'combat.respawn', uid: target.uid, defeatedByUid: attacker.uid });
    return true;
  }

  spawnProjectile(player, weapon, payload = {}) {
    const pitch = clamp(payload.pitch, -0.75, 0.75);
    const horizontal = Math.cos(pitch);
    const projectile = new ProjectileState();
    projectile.id = `projectile-${player.uid}-${++this.projectileSequence}`;
    projectile.weaponId = weapon.id;
    projectile.ownerUid = player.uid;
    projectile.cellKey = this.cellKeyForPosition(projectile);
    projectile.x = player.x;
    projectile.y = player.y + 1.2;
    projectile.z = player.z;
    projectile.vx = Math.sin(player.yaw) * horizontal * weapon.projectileSpeedMps;
    projectile.vy = Math.sin(pitch) * weapon.projectileSpeedMps;
    projectile.vz = Math.cos(player.yaw) * horizontal * weapon.projectileSpeedMps;
    projectile.ttl = weapon.lifetimeSec;
    this.state.projectiles.set(projectile.id, projectile);
    this.projectileBornAt.set(projectile.id, this.now());
    this.onProjectileAdded(projectile);
    return projectile;
  }

  useWeapon(player, command) {
    const profile = this.profiles.get(player.uid);
    const requested = String(command.assetId || profile?.equippedWeapon || '');
    const weapon = WEAPON_DEFINITIONS[requested];
    if (!profile || !weapon || !profile.unlockedWeapons.includes(requested)) {
      throw Object.assign(new Error('Weapon is not unlocked for this player.'), { code: 'weapon_locked' });
    }
    this.validateAttack(player, weapon);
    if (weapon.category === 'projectile') {
      const projectile = this.spawnProjectile(player, weapon, command.payload);
      this.emit({ type: 'combat.fired', uid: player.uid, weaponId: weapon.id, projectileId: projectile.id });
      return { weaponId: weapon.id, projectileId: projectile.id };
    }
    const target = this.resolveTarget(player, command.targetId, weapon);
    const eliminated = this.applyDamage(player, target, weapon);
    return { weaponId: weapon.id, targetUid: target.uid, eliminated, health: target.health };
  }

  execute(player, command) {
    if (command.type === COMMAND_TYPES.ACCEPT_MISSION) return { progression: this.acceptMission(player, command.assetId) };
    if (command.type === COMMAND_TYPES.EQUIP_WEAPON) return { progression: this.equipWeapon(player, command.assetId) };
    if (command.type === COMMAND_TYPES.USE_WEAPON) return { combat: this.useWeapon(player, command) };
    return null;
  }

  tick(dt) {
    const gravity = Math.max(0, Number(this.manifest.worldProfile?.gravityMps2) || 0);
    for (const projectile of Array.from(this.state.projectiles.values())) {
      const previousCellKey = projectile.cellKey;
      projectile.ttl -= dt;
      projectile.vy -= gravity * dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;
      projectile.cellKey = this.cellKeyForPosition(projectile);
      if (projectile.cellKey !== previousCellKey) this.onProjectileMoved(projectile, previousCellKey);
      let hit = false;
      if (this.now() - (this.projectileBornAt.get(projectile.id) || 0) >= 80) {
        for (const target of this.state.players.values()) {
          if (!target.connected || target.uid === projectile.ownerUid) continue;
          if (distance3d(projectile, target) > 1.25) continue;
          const attacker = this.state.players.get(projectile.ownerUid);
          const weapon = WEAPON_DEFINITIONS[projectile.weaponId];
          if (attacker && weapon) this.applyDamage(attacker, target, weapon);
          hit = true;
          break;
        }
      }
      if (projectile.ttl <= 0 || hit) {
        this.onProjectileRemoved(projectile);
        this.state.projectiles.delete(projectile.id);
        this.projectileBornAt.delete(projectile.id);
      }
    }
  }

  async leaderboard(limit = 25) {
    const stored = await this.store.loadProgressionLeaderboard(this.manifest.id, limit);
    const active = Array.from(this.profiles.values()).map((profile) => (
      leaderboardRow(profile, this.displayNames.get(profile.uid))
    ));
    const rows = new Map(stored.map((row) => [row.uid, row]));
    active.forEach((row) => rows.set(row.uid, row));
    return Array.from(rows.values()).sort((a, b) => b.xp - a.xp || a.uid.localeCompare(b.uid)).slice(0, limit);
  }
}

export { AuthoritativeGamePlatform, distance3d, targetInAimCone };
