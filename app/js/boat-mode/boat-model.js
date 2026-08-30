import { getMaritimeCatalogEntry } from '../transport/maritime-catalog.js?v=1';
import { createVesselVisual } from '../transport/vessel-visual-recipe.js?v=6';

function createBoatModeMesh(entry = getMaritimeCatalogEntry(), options = {}) {
  if (typeof THREE === 'undefined') throw new Error('Boat Mode visual authority requires Three.js.');
  const catalog = entry || getMaritimeCatalogEntry();
  const visual = createVesselVisual(THREE, catalog, {
    mobile: options.mobile === true,
    state: options.state || 'active'
  });
  visual.root.visible = false;
  visual.root.userData.disposeVesselVisual = visual.dispose;
  return visual.root;
}

export { createBoatModeMesh };
