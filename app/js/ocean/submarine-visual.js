import {loadModelAsset} from '../assets/model-asset-runtime.js';

export const SUBMARINE_ASSET_ID = 'marine-atlantic-explorer-submarine';

export function createSubmarineMesh(deps = {}) {
  const engine = deps.THREE || globalThis.THREE;
  const load = deps.loadModelAsset || loadModelAsset;
  const submarine = new engine.Group();
  submarine.name = 'Atlantic Explorer';
  submarine.scale.setScalar(deps.OCEAN_CONSTANTS?.SUB_SCALE ?? .86);
  submarine.userData.curatedMarineAssetId = SUBMARINE_ASSET_ID;
  const controller = new AbortController();
  let disposed = false, instance = null;
  submarine.userData.disposeCuratedMarineVisual = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    instance?.dispose();
    instance = null;
    submarine.userData.visualLoaded = false;
  };
  submarine.userData.visualReady = load(engine, SUBMARINE_ASSET_ID, {signal: controller.signal}).then(asset => {
    if (disposed) { asset.dispose(); return false; }
    instance = asset;
    asset.root.traverse(object => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    submarine.add(asset.root);
    submarine.userData.visualLoaded = true;
    return true;
  }).catch(error => {
    // Active startup awaits this result and presents its recovery UI. Docked
    // displays can retire while a shared template is still loading.
    if (!disposed) submarine.userData.visualError = String(error.message || error);
    return false;
  });
  const lamp = new engine.SpotLight(0xc8efff, 2.2, 170, Math.PI / 8, .5, 1.1);
  lamp.position.set(0, .4, 3.7);
  lamp.target.position.set(0, .1, 32);
  submarine.add(lamp, lamp.target);
  return submarine;
}
