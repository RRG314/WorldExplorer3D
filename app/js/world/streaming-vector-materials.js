import { applyFacadeWallMask } from '../engine/building-facade-shader.js?v=1';
import { createWindowTexture } from '../engine/procedural-textures.js?v=2';

let sharedMaterials = null;

function transportMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.94,
    metalness: 0.01,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2
  });
}

function transportSurfaceClass(kind = '') {
  const normalized = String(kind).toLowerCase();
  if (normalized.includes('cycleway')) return 'cycleway';
  if (/(?:footway|path|pedestrian|steps)/.test(normalized)) return 'pedestrian';
  return 'road';
}

function streamingVectorMaterials() {
  if (sharedMaterials) return sharedMaterials;
  const facadeStyles = ['office_grid', 'residential_punched', 'townhouse', 'industrial_panel'];
  const buildingColors = [0x9da5a8, 0xb4aa99, 0x879398, 0xc2b9aa];
  sharedMaterials = {
    transport: {
      road: transportMaterial(0x353b40),
      pedestrian: transportMaterial(0xb7b5ae),
      cycleway: transportMaterial(0x6f8f87)
    },
    buildings: buildingColors.map((color, index) => {
      const baseTexture = createWindowTexture(`#${new THREE.Color(color).getHexString()}`, 9101 + index, {
        style: facadeStyles[index]
      });
      const texture = baseTexture?.clone?.() || baseTexture || null;
      if (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(index === 2 ? 0.06 : 0.085, 1 / 42);
        texture.needsUpdate = true;
      }
      const material = new THREE.MeshStandardMaterial({
        color: texture ? 0xffffff : color,
        map: texture,
        roughness: 0.84,
        metalness: 0.04
      });
      applyFacadeWallMask(material, new THREE.Color(color).offsetHSL(0, -0.04, -0.12));
      return material;
    }),
    water: new THREE.MeshStandardMaterial({
      color: 0x2477ad,
      emissive: 0x0b2e4a,
      emissiveIntensity: 0.16,
      roughness: 0.3,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  };
  return sharedMaterials;
}

export { streamingVectorMaterials, transportSurfaceClass };
