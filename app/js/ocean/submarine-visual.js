export function createSubmarineMesh(deps = {}) {
  const submarine = new THREE.Group();
  submarine.name = "MiniSub";

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead9,
    roughness: 0.38,
    metalness: 0.16
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2f8ab8,
    roughness: 0.52,
    metalness: 0.14
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaee4ff,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.65, 9.0, 24), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  submarine.add(hull);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.38, 2.2, 22), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 5.45;
  nose.castShadow = true;
  submarine.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 18), hullMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -5.45;
  tail.castShadow = true;
  submarine.add(tail);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 16), glassMat);
  cockpit.position.set(0, 1.05, 1.65);
  cockpit.castShadow = true;
  submarine.add(cockpit);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.55, 1.45), accentMat);
  tower.position.set(0, 1.45, -0.4);
  tower.castShadow = true;
  submarine.add(tower);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.7), accentMat);
  wingL.position.set(-1.4, -0.52, -2.4);
  wingL.rotation.z = 0.18;
  submarine.add(wingL);

  const wingR = wingL.clone();
  wingR.position.x = 1.4;
  wingR.rotation.z = -0.18;
  submarine.add(wingR);

  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.78, 8), accentMat);
  dorsalFin.rotation.z = Math.PI;
  dorsalFin.position.set(0, 0.95, -4.2);
  submarine.add(dorsalFin);

  const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 10), accentMat);
  propellerHub.rotation.x = Math.PI / 2;
  propellerHub.position.set(0, 0, -6.1);
  submarine.add(propellerHub);

  const propeller = new THREE.Group();
  propeller.position.copy(propellerHub.position);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.22), accentMat);
    blade.position.y = 0.37;
    blade.rotation.z = (Math.PI * 2 * i) / 3;
    propeller.add(blade);
  }
  submarine.add(propeller);

  const lamp = new THREE.SpotLight(0xc8efff, 2.2, 170, Math.PI / 8, 0.5, 1.1);
  lamp.position.set(0, 0.5, 4.8);
  lamp.target.position.set(0, 0.1, 32);
  submarine.add(lamp);
  submarine.add(lamp.target);

  submarine.scale.setScalar(deps.OCEAN_CONSTANTS.SUB_SCALE);
  submarine.userData.propeller = propeller;
  return submarine;
}
