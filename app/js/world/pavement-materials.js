import {createRoadMarkingMaterial} from '../road-render.js?v=4';
import {createConcretePavementTexture} from './pavement-texture.js';

const owners = new WeakMap();

// A replacement starts using these resources before the previous publication
// retires. Keep their material identities (and linked renderer programs) alive
// across that handover, then release everything when the last owner leaves.
export function acquirePavementMaterials(appCtx) {
  const sequence = appCtx._worldLoadSequence;
  const normalMap = appCtx.pavementNormal || null;
  const roughnessMap = appCtx.pavementRoughness || null;
  let entry = owners.get(appCtx);
  if (!entry || entry.sequence !== sequence || entry.normalMap !== normalMap || entry.roughnessMap !== roughnessMap) {
    const materials = [];
    let texture;
    try {
      texture = createConcretePavementTexture(THREE);
      const material = new THREE.MeshStandardMaterial({color: 0xffffff, map: texture,
        normalMap, roughnessMap, roughness: .96, metalness: 0});
      materials.push(material);
      material.normalScale?.set(.12, .12);
      const markingMaterial = createRoadMarkingMaterial({color: 0xeee9df, roughness: .9, emissive: 0, emissiveIntensity: 0});
      materials.push(markingMaterial);
      const curbMaterial = new THREE.MeshStandardMaterial({color: 0x99978f, roughness: .96, side: THREE.DoubleSide});
      materials.push(curbMaterial);
      entry = {sequence, normalMap, roughnessMap, texture, materials,
        material, markingMaterial, curbMaterial, references: 0};
    } catch (error) {
      for (const material of materials) material.dispose();
      texture?.dispose();
      throw error;
    }
    owners.set(appCtx, entry);
  }
  entry.references++;
  let released = false;
  return {
    material: entry.material, markingMaterial: entry.markingMaterial, curbMaterial: entry.curbMaterial,
    release() {
      if (released) return;
      released = true;
      if (--entry.references !== 0) return;
      for (const material of entry.materials) material.dispose();
      entry.texture.dispose();
      // Normal/roughness textures are borrowed from the world's asset owner.
      if (owners.get(appCtx) === entry) owners.delete(appCtx);
    }
  };
}
