function createWalkingCharacterHelpers({ THREE, scene }) {
  function createCharacterMesh() {
    const grp = new THREE.Group();
    const shirtMat = new THREE.MeshStandardMaterial({
      color: 0x3b6d9c,
      roughness: 0.82,
      metalness: 0.02
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xe0c2a8,
      roughness: 0.74,
      metalness: 0.0
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x2f3746,
      roughness: 0.88,
      metalness: 0.02
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
      metalness: 0.02
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x3a2f25,
      roughness: 0.9,
      metalness: 0.0
    });

    const scale = 1.1;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.44 * scale, 0.66 * scale, 0.26 * scale), shirtMat);
    body.position.y = 1.0 * scale;
    body.castShadow = true;
    grp.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 16, 16), headMat);
    head.position.y = 1.52 * scale;
    head.castShadow = true;
    grp.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19 * scale, 14, 12), hairMat);
    hair.position.set(0, 1.62 * scale, -0.02 * scale);
    hair.scale.set(1.0, 0.65, 1.0);
    hair.castShadow = true;
    grp.add(hair);

    const leg1Group = new THREE.Group();
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.62 * scale, 0.14 * scale), pantsMat);
    leg1.position.y = -0.31 * scale;
    leg1.castShadow = true;
    leg1Group.add(leg1);
    const shoe1 = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.08 * scale, 0.24 * scale), shoeMat);
    shoe1.position.set(0, -0.64 * scale, 0.04 * scale);
    shoe1.castShadow = true;
    leg1Group.add(shoe1);
    leg1Group.position.set(-0.11 * scale, 0.71 * scale, 0);
    grp.add(leg1Group);

    const leg2Group = new THREE.Group();
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.62 * scale, 0.14 * scale), pantsMat);
    leg2.position.y = -0.31 * scale;
    leg2.castShadow = true;
    leg2Group.add(leg2);
    const shoe2 = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.08 * scale, 0.24 * scale), shoeMat);
    shoe2.position.set(0, -0.64 * scale, 0.04 * scale);
    shoe2.castShadow = true;
    leg2Group.add(shoe2);
    leg2Group.position.set(0.11 * scale, 0.71 * scale, 0);
    grp.add(leg2Group);

    const arm1Group = new THREE.Group();
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), shirtMat);
    arm1.position.y = -0.26 * scale;
    arm1.castShadow = true;
    arm1Group.add(arm1);
    arm1Group.position.set(-0.26 * scale, 1.21 * scale, 0);
    grp.add(arm1Group);

    const arm2Group = new THREE.Group();
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), shirtMat);
    arm2.position.y = -0.26 * scale;
    arm2.castShadow = true;
    arm2Group.add(arm2);
    arm2Group.position.set(0.26 * scale, 1.21 * scale, 0);
    grp.add(arm2Group);

    grp.castShadow = true;
    grp.receiveShadow = false;
    grp.userData.limbs = {
      leg1: leg1Group,
      leg2: leg2Group,
      arm1: arm1Group,
      arm2: arm2Group,
      body,
      scale
    };
    grp.userData.walkTime = 0;
    grp.traverse((obj) => {
      if (obj !== grp) obj.userData.fallbackPart = true;
    });
    grp.userData.characterLod = null;
    grp.userData.characterMixer = null;
    grp.userData.characterActions = null;
    grp.userData.characterRoot = null;

    grp.visible = false;
    scene.add(grp);
    return grp;
  }

  function animateCharacterWalk(characterMesh, isMoving, deltaTime) {
    if (!characterMesh || !characterMesh.userData.limbs) return;

    const mixer = characterMesh.userData.characterMixer;
    if (mixer) {
      mixer.update(deltaTime);
      const actions = characterMesh.userData.characterActions || {};
      const idleAction = actions.idle || null;
      const walkAction = actions.walk || null;
      if (idleAction && walkAction) {
        const blend = isMoving ? 1 : 0;
        walkAction.enabled = true;
        idleAction.enabled = true;
        walkAction.setEffectiveWeight(blend);
        idleAction.setEffectiveWeight(1 - blend);
      }
      return;
    }

    const limbs = characterMesh.userData.limbs;
    const scale = limbs.scale;

    if (isMoving) {
      characterMesh.userData.walkTime += deltaTime * 8;
      const t = characterMesh.userData.walkTime;
      const legSwing = Math.sin(t) * 0.5;
      const armSwing = Math.sin(t) * 0.4;

      limbs.leg1.rotation.x = legSwing;
      limbs.leg2.rotation.x = -legSwing;
      limbs.arm1.rotation.x = -armSwing;
      limbs.arm2.rotation.x = armSwing;
      limbs.body.position.y = 1.0 * scale + Math.abs(Math.sin(t * 2)) * 0.05 * scale;
    } else {
      const resetSpeed = deltaTime * 5;
      limbs.leg1.rotation.x *= 1 - resetSpeed;
      limbs.leg2.rotation.x *= 1 - resetSpeed;
      limbs.arm1.rotation.x *= 1 - resetSpeed;
      limbs.arm2.rotation.x *= 1 - resetSpeed;
      limbs.body.position.y = 1.0 * scale;
    }
  }

  function normalizeCharacterModel(root) {
    if (!root) return;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const sourceHeight = Math.max(0.01, size.y);
    const targetHeight = 1.72;
    const scale = targetHeight / sourceHeight;
    root.scale.multiplyScalar(scale);
    root.updateMatrixWorld(true);
    box.setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
  }

  function applyCharacterMaterialBudget(root, tier = "high") {
    const high = {
      skin: new THREE.MeshStandardMaterial({ color: 0xe0c2a8, roughness: 0.62, metalness: 0.02 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x5e7489, roughness: 0.84, metalness: 0.04 }),
      gear: new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.76, metalness: 0.08 })
    };
    const low = {
      skin: new THREE.MeshStandardMaterial({ color: 0xd6b79c, roughness: 0.75, metalness: 0 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0x667684, roughness: 0.9, metalness: 0 }),
      gear: new THREE.MeshStandardMaterial({ color: 0x32363b, roughness: 0.88, metalness: 0.02 })
    };
    const mats = tier === "low" ? low : high;
    root.traverse((obj) => {
      if (!obj || !obj.isMesh) return;
      const id = String(obj.name || "").toLowerCase();
      let bucket = "cloth";
      if (id.includes("head") || id.includes("face") || id.includes("skin") || id.includes("hand")) {
        bucket = "skin";
      } else if (id.includes("shoe") || id.includes("boot") || id.includes("belt") || id.includes("bag") || id.includes("helmet")) {
        bucket = "gear";
      }
      obj.material = mats[bucket];
      obj.castShadow = tier !== "low";
      obj.receiveShadow = false;
    });
  }

  function attachHeroCharacter(characterMesh) {
    if (!characterMesh || typeof THREE.GLTFLoader === "undefined") return;
    const loader = new THREE.GLTFLoader();
    if (typeof THREE.DRACOLoader !== "undefined") {
      try {
        const draco = new THREE.DRACOLoader();
        draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/");
        loader.setDRACOLoader(draco);
      } catch (err) {
        console.warn("Character DRACO loader unavailable:", err);
      }
    }

    const onLoaded = (gltf) => {
      const root = gltf?.scene || gltf?.scenes?.[0];
      if (!root) return;
      normalizeCharacterModel(root);
      applyCharacterMaterialBudget(root, "high");

      const lod1 = root.clone(true);
      applyCharacterMaterialBudget(lod1, "low");

      const lod = new THREE.LOD();
      lod.addLevel(root, 0);
      lod.addLevel(lod1, 24);
      lod.autoUpdate = true;

      characterMesh.add(lod);
      characterMesh.userData.characterLod = lod;
      characterMesh.userData.characterRoot = root;

      characterMesh.traverse((obj) => {
        if (obj?.userData?.fallbackPart) obj.visible = false;
      });

      if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(root);
        const pickClip = (token) =>
          gltf.animations.find((clip) => String(clip.name || "").toLowerCase().includes(token));
        const idleClip = pickClip("idle") || gltf.animations[0];
        const walkClip = pickClip("walk") || pickClip("run") || gltf.animations[Math.min(1, gltf.animations.length - 1)] || idleClip;
        const idleAction = mixer.clipAction(idleClip);
        const walkAction = mixer.clipAction(walkClip);
        idleAction.play();
        walkAction.play();
        walkAction.setEffectiveWeight(0);
        characterMesh.userData.characterMixer = mixer;
        characterMesh.userData.characterActions = { idle: idleAction, walk: walkAction };
      }
    };

    const tryUrls = ["assets/models/soldier.glb", "assets/models/Astronaut.glb"];
    const tryNext = (idx) => {
      if (idx >= tryUrls.length) return;
      loader.load(tryUrls[idx], onLoaded, undefined, () => tryNext(idx + 1));
    };
    tryNext(0);
  }

  return {
    animateCharacterWalk,
    attachHeroCharacter,
    createCharacterMesh
  };
}

export { createWalkingCharacterHelpers };
