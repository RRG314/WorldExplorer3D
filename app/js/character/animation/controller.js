// Presentation only. Gameplay, inventory and damage remain with their owners.
// Split locomotion by bone mask so an upper-body action cannot halve leg motion.
export function createCharacterAnimationController(THREE, visual, clips, mapping = {}) {
  const mixer = new THREE.AnimationMixer(visual);
  const upperBones = new Set();
  visual.traverse(node => {
    if (node.isBone && /^(Torso|Chest)$/i.test(node.name)) {
      node.traverse(child => { if (child.isBone) upperBones.add(child.name); });
    }
  });
  const upperTrack = track => upperBones.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName);
  const roles = {
    idle: 'Idle', walk: 'Walk', run: 'Run', backward: 'Run_Back',
    left: 'Run_Left', right: 'Run_Right', aim: 'Idle_Gun_Pointing',
    fire: 'Gun_Shoot', melee: 'Sword_Slash', punch: 'Punch_Right', interact: 'Interact',
    wave: 'Wave', hit: 'HitRecieve', down: 'Death', ...mapping
  };
  const base = {}, upper = {}, actions = {}, reactions = {};
  const entries = [];
  const add = (role, clip, filter, oneShot = false) => {
    const tracks = filter ? clip.tracks.filter(filter) : clip.tracks;
    if (!tracks.length) return null;
    const copy = new THREE.AnimationClip(`${clip.name}:${role}`, clip.duration, tracks);
    const action = mixer.clipAction(copy);
    action.setEffectiveWeight(0);
    if (oneShot) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    action.play(); action.paused = oneShot;
    entries.push({ action, weight: 0, target: 0 });
    return action;
  };
  for (const role of ['idle', 'walk', 'run', 'backward', 'left', 'right']) {
    const clip = clips.find(clip => clip.name === roles[role]);
    if (!clip) continue;
    base[role] = add(`${role}:lower`, clip, track => !upperTrack(track));
    upper[role] = add(`${role}:upper`, clip, upperTrack);
  }
  for (const role of ['aim', 'fire', 'melee', 'punch', 'interact', 'wave']) {
    const clip = clips.find(clip => clip.name === roles[role]);
    if (clip) actions[role] = add(role, clip, upperTrack, role !== 'aim');
  }
  for (const role of ['hit', 'down']) {
    const clip = clips.find(clip => clip.name === roles[role]);
    if (clip) reactions[role] = add(role, clip, null, true);
  }
  let activeAction = null, reaction = null, disposed = false, lastSequence = -1;
  let initialized = false;
  function play(role, sequence) {
    if (disposed || !Number.isSafeInteger(sequence) || sequence <= lastSequence) return false;
    const action = reactions[role] || actions[role];
    if (!action || role === 'aim') return false;
    lastSequence = sequence;
    action.reset().play();
    if (reactions[role]) reaction = { role, action };
    else activeAction = { role, action };
    return true;
  }
  function update(state = {}, deltaTime = 0) {
    if (disposed) return false;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, Math.min(.1, deltaTime)) : 0;
    let locomotion = state.moving ? state.running ? 'run' : 'walk' : 'idle';
    if (state.moving && state.aiming && ['left', 'right', 'backward'].includes(state.direction)) locomotion = state.direction;
    if (!base[locomotion]) locomotion = base.walk && state.moving ? 'walk' : 'idle';
    if (activeAction?.action.time >= activeAction?.action.getClip().duration) activeAction = null;
    if (reaction?.role === 'hit' && reaction.action.time >= reaction.action.getClip().duration) reaction = null;
    if (reaction?.role === 'down' && state.incapacitated === false) reaction = null;
    const selectedUpper = activeAction?.action || (state.aiming ? actions.aim : null) || upper[locomotion];
    for (const entry of entries) {
      entry.target = reaction ? Number(entry.action === reaction.action)
        : Number(entry.action === base[locomotion] || entry.action === selectedUpper);
      entry.weight = initialized ? entry.weight + (entry.target - entry.weight) * (1 - Math.exp(-dt / .085)) : entry.target;
      if (Math.abs(entry.weight - entry.target) < .001) entry.weight = entry.target;
      entry.action.setEffectiveWeight(entry.weight);
    }
    initialized = true;
    mixer.update(dt);
    return true;
  }
  function snapshot() {
    return { action: activeAction?.role || null, reaction: reaction?.role || null,
      upperBoneCount: upperBones.size, lastSequence, disposed,
      weights: Object.fromEntries(entries.filter(e => e.weight > .001).map(e => [e.action.getClip().name, e.weight])) };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    mixer.stopAllAction(); mixer.uncacheRoot(visual);
  }
  function playEquipmentAction(definition = {}) {
    const role = { sidearm: 'fire', melee: 'melee', unarmed: 'punch', utility: 'interact' }[definition.category];
    // Missing throw/reload clips are not replaced by an unrelated gesture.
    return role ? play(role, lastSequence + 1) : false;
  }
  function cancelEquipmentAction() {
    if (['fire', 'melee', 'punch', 'interact'].includes(activeAction?.role)) activeAction = null;
  }
  return { mixer, actions: { ...base, ...actions, ...reactions }, update, play, playEquipmentAction, cancelEquipmentAction, snapshot, dispose };
}
