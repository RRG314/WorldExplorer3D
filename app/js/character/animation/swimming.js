// Authored motion for the existing explorer skeletons; no replacement avatar.
// Capture the rest transforms before the animation mixer binds the rig.
export function createSwimmingClips(THREE, visual) {
  const bones = [];
  visual.traverse(node => { if (node.isBone) bones.push(node); });
  if (!bones.some(bone => /^UpperArm\.?L$/.test(bone.name))) return [];
  return ['Swim', 'Tread'].map(kind => {
    const duration = kind === 'Swim' ? 1.5 : 2.4;
    const times = Array.from({length:25}, (_, i) => i * duration / 24);
    const tracks = bones.map(bone => {
      const values = [];
      const side = bone.name.endsWith('L') ? 1 : -1;
      for (const time of times) {
        const phase = time / duration * Math.PI * 2 + (side < 0 ? Math.PI : 0);
        const stroke = Math.sin(phase), kick = Math.sin(phase * 2);
        let x = 0, y = 0, z = 0;
        if (bone.name.startsWith('UpperArm')) {
          x = kind === 'Swim' ? stroke * 1.05 : .25 + stroke * .2;
          z = side * (kind === 'Swim' ? -.55 : -.85);
          y = side * Math.cos(phase) * .25;
        } else if (bone.name.startsWith('LowerArm')) x = -.35 - Math.max(0, stroke) * .65;
        else if (bone.name.startsWith('UpperLeg')) x = (kind === 'Swim' ? .22 : .16) * kick;
        else if (bone.name.startsWith('LowerLeg')) x = .15 + Math.max(0, -kick) * .25;
        else if (bone.name === 'Head' && kind === 'Swim') x = -.3;
        const q = bone.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,y,z)));
        values.push(q.x,q.y,q.z,q.w);
      }
      return new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, values);
    });
    return new THREE.AnimationClip(`Explorer_${kind}`, duration, tracks);
  });
}
