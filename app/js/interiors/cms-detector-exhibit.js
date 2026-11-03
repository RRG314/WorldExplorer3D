import { loadModelAsset } from '../assets/model-asset-runtime.js?v=16';
import { CMS_DETECTOR_ASSETS } from '../assets/cms-detector-assets.js';
import { batchStaticModelTemplate } from '../assets/static-model-batching.js?v=1';

const COLORS = { tracking: 0x75b7b4, ecal: 0xd6ba79, hcal: 0xb66e3e, muon: 0xc2cbd2 };
const componentGroup = (id) =>
  id.startsWith('cms-pixel') || id.startsWith('cms-sistrip')
    ? 'tracking'
    : id.startsWith('cms-ecal')
      ? 'ecal'
      : id.startsWith('cms-hcal')
        ? 'hcal'
        : 'muon';

// Original metre-coordinate meshes use the existing model cache/instance lease.
// This owns no renderer, update loop, geographic access or physical collider.
// The facility's barriers remain solid even when outer layers are hidden.
export async function createCmsDetectorExhibit(
  T,
  parent,
  { metersPerUnit = 1, signal, isCurrent = () => true, applyLighting = () => {} } = {}
) {
  if (!(metersPerUnit > 0)) throw Error('The detector scale is unavailable.');
  const root = new T.Group(),
    leases = [],
    groups = new Map();
  root.name = 'CMS detector · pinned event-display geometry';
  root.scale.setScalar(1 / metersPerUnit);
  let disposed = false,
    layer = 'all';
  function dispose() {
    if (disposed) return;
    disposed = true;
    root.parent?.remove(root);
    for (const lease of leases) lease.dispose();
    leases.length = 0;
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  try {
    for (const asset of CMS_DETECTOR_ASSETS) {
      if (disposed || signal?.aborted || !isCurrent())
        throw new DOMException('The detector visit changed.', 'AbortError');
      const lease = await loadModelAsset(T, asset.id, { signal });
      if (disposed || !isCurrent()) {
        lease.dispose();
        throw new DOMException('The detector visit changed.', 'AbortError');
      }
      leases.push(lease);
      const group = componentGroup(asset.id),
        component = lease.root;
      component.name = asset.label;
      component.userData.detectorLayer = group;
      let hasMesh = false;
      component.traverse((o) => {
        if (o.isMesh) hasMesh = true;
      });
      const retiredMaterials = new Set(),
        solid = hasMesh
          ? new T.MeshStandardMaterial({
              color: COLORS[group],
              side: T.DoubleSide,
              roughness: 0.48,
              metalness: 0.25,
              fog: false,
            })
          : null;
      solid?.color.convertSRGBToLinear();
      component.traverse((o) => {
        if (o.isLine && hasMesh) o.visible = false; // Redundant solid-component outlines, not removed source data.
        if (!o.isMesh && !o.isLine) return;
        if (o.isMesh) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            retiredMaterials.add(m);
          o.material = solid;
          o.geometry.computeVertexNormals();
        }
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
          material.color?.setHex(COLORS[group]).convertSRGBToLinear();
          material.fog = false;
          if (o.isMesh) {
            material.side = T.DoubleSide;
            material.roughness = 0.48;
            material.metalness = 0.25;
          }
        }
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      retiredMaterials.forEach((material) => material.dispose());
      batchStaticModelTemplate(T, component);
      root.add(component);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(component);
    }
    if (disposed || !isCurrent())
      throw new DOMException('The detector visit changed.', 'AbortError');
    parent.add(root);
    applyLighting(root);
    return {
      root,
      dispose,
      setLayer(next) {
        if (disposed || !['all', ...Object.keys(COLORS)].includes(next))
          throw Error('Choose an available detector layer.');
        layer = next;
        for (const [id, components] of groups)
          for (const component of components) component.visible = next === 'all' || next === id;
      },
      snapshot() {
        let meshes = 0,
          lines = 0,
          vertices = 0;
        root.traverseVisible((o) => {
          if (o.isMesh) meshes++;
          if (o.isLine) lines++;
          if (o.geometry) vertices += o.geometry.attributes.position?.count || 0;
        });
        return {
          disposed,
          layer,
          components: leases.length,
          meshes,
          lines,
          vertices,
          modelLeases: leases.length,
        };
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
