import { SPACE_CRAFT_IDENTITY } from './craft-identity.js?v=1';
import { createExpeditionSpacecraftMesh } from './expedition-spacecraft-mesh.js?v=6';

function dockMaterial(color, emissive = 0x000000) {
  return new THREE.MeshPhongMaterial({
    color,
    emissive,
    emissiveIntensity: emissive ? 1.1 : 0,
    shininess: 72,
    specular: 0x6f8794
  });
}

function createSolisReachExteriorMesh() {
  // The orbital target and the flyable vessel share one exterior recipe. The
  // former ring ship competed with the flyable ship even though both
  // represented the same expedition vessel.
  const ship = createExpeditionSpacecraftMesh();
  ship.name = `${SPACE_CRAFT_IDENTITY.starship.name} Orbital Starship`;
  ship.userData.authority = 'interstellar-expedition';
  ship.userData.playerFacingName = SPACE_CRAFT_IDENTITY.starship.name;
  ship.userData.dockingRadius = 48;
  ship.scale.setScalar(3.8);

  const dock = new THREE.Group();
  dock.name = `${SPACE_CRAFT_IDENTITY.starship.name} Pathfinder Dock`;
  dock.position.set(0, -5.55, 1.42);
  ship.add(dock);

  const bay = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 1.46, 1.8, 28),
    dockMaterial(0x344b59)
  );
  bay.name = 'starship-dock-bay';
  bay.rotation.x = Math.PI / 2;
  dock.add(bay);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(1.22, 0.14, 10, 40),
    dockMaterial(0x6fe8ff, 0x1b95b2)
  );
  collar.name = 'solis-reach-docking-collar';
  collar.position.z = 0.98;
  dock.add(collar);

  const door = new THREE.Mesh(
    new THREE.CylinderGeometry(1.08, 1.08, 0.18, 28),
    dockMaterial(0x162732)
  );
  door.name = 'starship-docking-door';
  door.rotation.x = Math.PI / 2;
  door.position.z = 1.03;
  dock.add(door);

  [-1, 1].forEach((side) => {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff516b : 0x58ffc0 })
    );
    light.position.set(side * 1.55, 0, 1.05);
    dock.add(light);
  });

  return ship;
}

export { createSolisReachExteriorMesh };
