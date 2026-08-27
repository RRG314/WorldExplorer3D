import { createUnderwaterSchoolPlan } from '../fishing/population-authority.js?v=2';

export function createOceanFishLifeApi({ oceanMode, disposeObject3D }) {
  const _tmpVecA = new THREE.Vector3();
  const _tmpVecB = new THREE.Vector3();

  function createFishTemplate(options = {}) {
    const group = new THREE.Group();

    const bodyColor = options.bodyColor || 0xffb88f;
    const finColor = options.finColor || bodyColor;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.48,
      metalness: 0.03
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: finColor,
      roughness: 0.52,
      metalness: 0.02
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 11), bodyMat);
    body.scale.set(1.9, 0.86, 0.92);
    group.add(body);

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5f0e4, roughness: 0.62, metalness: 0.0 })
    );
    belly.scale.set(1.3, 0.6, 0.84);
    belly.position.set(0.08, -0.22, 0.15);
    group.add(belly);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.05, 10), finMat);
    tail.name = "fishTail";
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -1.06;
    group.add(tail);

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), finMat);
    dorsal.rotation.z = Math.PI;
    dorsal.position.set(-0.06, 0.52, -0.05);
    group.add(dorsal);

    const pectoralL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), finMat);
    pectoralL.rotation.z = Math.PI * 0.52;
    pectoralL.rotation.x = Math.PI * 0.5;
    pectoralL.position.set(-0.14, -0.1, 0.34);
    group.add(pectoralL);

    const pectoralR = pectoralL.clone();
    pectoralR.rotation.z = -Math.PI * 0.52;
    pectoralR.position.x = 0.14;
    group.add(pectoralR);

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f1117, roughness: 0.25, metalness: 0.04 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
    eyeL.position.set(-0.22, 0.12, 0.68);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.22;
    group.add(eyeL);
    group.add(eyeR);

    return group;
  }

  function createSharkModel() {
    const group = new THREE.Group();
    group.name = "OceanShark";

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6f7f92,
      roughness: 0.5,
      metalness: 0.05
    });
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0xc8d0d8,
      roughness: 0.58,
      metalness: 0.01
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 6.0, 18), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.35, 14), bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 3.55;
    group.add(nose);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.66, 14, 10), bellyMat);
    belly.position.y = -0.24;
    belly.scale.set(1.18, 0.58, 2.24);
    group.add(belly);

    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.95, 10), bodyMat);
    dorsal.rotation.z = Math.PI;
    dorsal.position.set(0, 0.96, -0.05);
    group.add(dorsal);

    const pectoralL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.42), bodyMat);
    pectoralL.position.set(-0.76, -0.2, 0.25);
    pectoralL.rotation.z = 0.35;
    pectoralL.rotation.x = -0.18;
    group.add(pectoralL);

    const pectoralR = pectoralL.clone();
    pectoralR.position.x = 0.76;
    pectoralR.rotation.z = -0.35;
    group.add(pectoralR);

    const tailHub = new THREE.Group();
    tailHub.name = "sharkTailHub";
    tailHub.position.set(0, 0, -3.2);
    const tailUpper = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.2, 10), bodyMat);
    tailUpper.rotation.x = -Math.PI / 2;
    tailUpper.rotation.z = -0.5;
    tailUpper.position.y = 0.18;
    tailHub.add(tailUpper);
    const tailLower = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.95, 10), bodyMat);
    tailLower.rotation.x = -Math.PI / 2;
    tailLower.rotation.z = 0.42;
    tailLower.position.y = -0.12;
    tailHub.add(tailLower);
    group.add(tailHub);

    group.scale.setScalar(2.1);
    return group;
  }

  function clearFishLife(scene) {
    for (let i = 0; i < oceanMode.fishEntities.length; i++) {
      const fish = oceanMode.fishEntities[i];
      if (fish && fish.mesh && fish.mesh.parent === scene) scene.remove(fish.mesh);
      if (fish && fish.mesh) disposeObject3D(fish.mesh);
    }
    oceanMode.fishEntities = [];
    oceanMode.fishSchools = [];
    oceanMode.underwaterSchoolPlan = null;
    oceanMode.fishPopulationContext = null;

    if (oceanMode.sharkEntity && oceanMode.sharkEntity.mesh) {
      if (oceanMode.sharkEntity.mesh.parent === scene) scene.remove(oceanMode.sharkEntity.mesh);
      disposeObject3D(oceanMode.sharkEntity.mesh);
    }
    oceanMode.sharkEntity = null;
  }

  function initFishLife(scene, populationContext = null) {
    clearFishLife(scene);
    const schoolPlan = createUnderwaterSchoolPlan(populationContext, { maximumSchools: 5 });
    oceanMode.fishPopulationContext = populationContext;
    oceanMode.underwaterSchoolPlan = schoolPlan;
    if (!schoolPlan.playable) return;

    const anchors = [
      [34, -16, 124], [-30, -20, 88], [96, -28, 42], [-105, -45, 28], [22, -58, -88]
    ];
    const schoolDefs = schoolPlan.schools.map((school, index) => ({
      ...school,
      anchor: new THREE.Vector3(...anchors[index]),
      radius: 16 + index * 10,
      speed: Math.max(0.24, 0.6 - index * 0.09),
      verticalAmp: 2 + index * 0.8,
      scaleMin: 1 + index * 0.3,
      scaleMax: 1.8 + index * 0.55
    }));
    const templates = schoolDefs.map((school) => createFishTemplate({
      bodyColor: school.visual?.body || 0x8cdfff,
      finColor: school.visual?.fin || school.visual?.body || 0x67c7ea
    }));

    oceanMode.fishSchools = schoolDefs.map((def, idx) => ({
      ...def,
      center: def.anchor.clone(),
      driftPhase: Math.random() * Math.PI * 2,
      driftX: 4 + idx * 1.7,
      driftY: 1.4 + idx * 0.4,
      driftZ: 5 + idx * 1.5,
      driftSpeed: 0.06 + idx * 0.02
    }));

    oceanMode.fishSchools.forEach((school, schoolIndex) => {
      for (let i = 0; i < school.count; i++) {
        const template = templates[schoolIndex];
        const fish = template.clone(true);
        const fishScale = school.scaleMin + Math.random() * (school.scaleMax - school.scaleMin);
        fish.scale.setScalar(fishScale);
        fish.traverse((child) => {
          if (child && child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        scene.add(fish);

        oceanMode.fishEntities.push({
          mesh: fish,
          tail: fish.getObjectByName("fishTail") || null,
          schoolIndex,
          speciesId: school.speciesId,
          populationContextId: populationContext.contextId,
          livePresenceClaim: false,
          phase: Math.random() * Math.PI * 2,
          orbitScale: 0.58 + Math.random() * 0.9,
          drift: (Math.random() - 0.5) * 2.6,
          tailPhase: Math.random() * Math.PI * 2,
          tailSpeed: 7.0 + Math.random() * 4.0,
          tailAmp: 0.26 + Math.random() * 0.22
        });
      }
    });

    templates.forEach((template) => disposeObject3D(template));
  }

  function updateFishLife(t) {
    for (let i = 0; i < oceanMode.fishSchools.length; i++) {
      const school = oceanMode.fishSchools[i];
      const drift = t * school.driftSpeed + school.driftPhase;
      school.center.set(
        school.anchor.x + Math.sin(drift * 1.1) * school.driftX,
        school.anchor.y + Math.sin(drift * 1.6) * school.driftY,
        school.anchor.z + Math.cos(drift * 0.9) * school.driftZ
      );
    }

    for (let i = 0; i < oceanMode.fishEntities.length; i++) {
      const fish = oceanMode.fishEntities[i];
      const school = oceanMode.fishSchools[fish.schoolIndex];
      if (!fish || !fish.mesh || !school) continue;

      const orbit = t * school.speed + fish.phase;
      const wobble = Math.sin(orbit * 0.8 + fish.phase * 1.7) * 1.05;
      const radius = school.radius * fish.orbitScale;

      const x = school.center.x + Math.cos(orbit) * radius + wobble;
      const y = school.center.y + Math.sin(orbit * 1.45 + fish.phase) * school.verticalAmp + fish.drift;
      const z = school.center.z + Math.sin(orbit) * radius * 0.75 + Math.cos(orbit * 0.92 + fish.phase) * 2.4;

      fish.mesh.position.set(x, y, z);

      const nextOrbit = orbit + 0.07;
      _tmpVecA.set(
        school.center.x + Math.cos(nextOrbit) * radius,
        school.center.y + Math.sin(nextOrbit * 1.45 + fish.phase) * school.verticalAmp + fish.drift,
        school.center.z + Math.sin(nextOrbit) * radius * 0.75
      );
      fish.mesh.lookAt(_tmpVecA);

      const tail = fish.tail;
      if (tail) {
        tail.rotation.y = Math.sin(t * fish.tailSpeed + fish.tailPhase) * fish.tailAmp;
      }
    }

    if (oceanMode.sharkEntity && oceanMode.sharkEntity.mesh) {
      const shark = oceanMode.sharkEntity;
      const orbit = t * shark.speed + shark.phase;
      const x = shark.center.x + Math.cos(orbit) * shark.radiusX;
      const y = shark.center.y + Math.sin(orbit * 0.48) * shark.verticalAmp;
      const z = shark.center.z + Math.sin(orbit) * shark.radiusZ;

      shark.mesh.position.set(x, y, z);

      _tmpVecB.set(
        shark.center.x + Math.cos(orbit + 0.08) * shark.radiusX,
        shark.center.y + Math.sin((orbit + 0.08) * 0.48) * shark.verticalAmp,
        shark.center.z + Math.sin(orbit + 0.08) * shark.radiusZ
      );
      shark.mesh.lookAt(_tmpVecB);

      const tailHub = shark.tailHub;
      if (tailHub) {
        tailHub.rotation.y = Math.sin(t * 4.4 + shark.phase) * 0.38;
      }
    }
  }

  return {
    clearFishLife,
    initFishLife,
    updateFishLife
  };
}
