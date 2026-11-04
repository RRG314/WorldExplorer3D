import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';

export async function createArchaeologyPresentation(runtime, qualified, study, {signal, isCurrent = () => true} = {}) {
  const T = globalThis.THREE, owner = runtime.dynamicBuildingColliders;
  if (!T || !runtime.scene || !Array.isArray(owner)) throw Error('The training site presentation is not ready.');
  const root = new T.Group(), resources = new Set(), proxies = [], leases = [], u = qualified.metersPerUnit;
  root.name = 'Fictional archaeology training yard';
  root.userData.research = {siteId: qualified.site.id, visualVersion: 1, truthType: 'fictional-training-site', assets: ['workspace-table']};
  let disposed = false;
  const resource = value => {resources.add(value); return value;};
  const material = (color, options = {}) => {const value=new T.MeshStandardMaterial({color, roughness: .87, metalness: 0, ...options});value.color.convertSRGBToLinear();return resource(value);};
  const soilColors = {'pale-brown': 0xb7a17b, 'dark-brown': 0x615044, 'mottled-brown': 0x9d927a, 'ochre-brown': 0xab8555};
  function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
    const object = new T.Mesh(resource(geometry), mat); object.position.set(x / u, y / u, z / u); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  const box = (parent, w, h, d, mat, x = 0, y = 0, z = 0) => mesh(parent, new T.BoxGeometry(w / u, h / u, d / u), mat, x, y, z);
  function at(id) {const group = new T.Group(), p = qualified.points[id]; group.position.set(p.x, p.y, p.z); root.add(group); group.name = 'Archaeology station · ' + id; return group;}
  function collider(id, hx, hz, height) {
    // Authored furniture uses the existing strict-height contract. Treating a
    // low prop as a building would make the roof-landing grace lift a walker
    // onto the trench instead of colliding with its visible frame.
    const p = qualified.points[id], row = {sourceBuildingId: 'research-archaeology:' + id, buildingType:'field_furniture',isInteriorCollider:true,collisionKind: 'solid', minX: p.x - hx / u, maxX: p.x + hx / u,
      minZ: p.z - hz / u, maxZ: p.z + hz / u, minY: p.y, maxY: p.y + height / u, baseY: p.y, height: height / u};
    owner.push(row); proxies.push(row);
  }
  function label(parent, text, x, y, z, width = 2.5, height = .75) {
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 216; const c = canvas.getContext('2d');
    c.fillStyle = '#17271fed'; c.fillRect(0, 0, 720, 216); c.strokeStyle = '#efd079'; c.lineWidth = 5; c.strokeRect(3, 3, 714, 210);
    c.fillStyle = '#f3f0e4'; c.textAlign = 'center'; c.font = 'bold 34px system-ui'; text.split('\n').forEach((line, i) => c.fillText(line, 360, 56 + i * 61, 680));
    const texture = resource(new T.CanvasTexture(canvas)); texture.encoding = T.sRGBEncoding;
    const sprite = new T.Sprite(resource(new T.SpriteMaterial({map: texture, transparent: true, depthTest: true})));
    sprite.position.set(x / u, y / u, z / u); sprite.scale.set(width / u, height / u, 1); parent.add(sprite); return sprite;
  }
  function artifact(parent, kind, x, y, z, wear) {
    const group = new T.Group(); group.position.set(x / u, y / u, z / u); parent.add(group);
    const clay = material(0xb57d58), edge = material(0x4a3a31);
    if (kind === 'bead') {
      const glass = resource(new T.MeshPhysicalMaterial({color: 0x6a9caa, roughness: .60, metalness: 0, transmission: .05}));
      glass.color.convertSRGBToLinear();
      const bead = mesh(group, new T.TorusGeometry(.006 / u, .002 / u, 10, 28), glass); bead.rotation.x = -Math.PI / 2;
    } else if (kind === 'wood') {
      const fragment = box(group, .28, .045, .075, material(0x544231)); fragment.rotation.y = -.2;
      for (let i = 0; i < 7; i++) {const grain = box(group, .24 - (i % 3) * .02, .002, .002, material(i % 2 ? 0x3b3027 : 0x927651), 0, .024, (i - 3) * .009); grain.rotation.y = -.2;}
    } else {
      const shape = new T.Shape();
      if (kind === 'rim') {
        shape.absarc(0, 0, .17 / u, .15, 1.5, false); shape.lineTo(Math.cos(1.5) * .151 / u, Math.sin(1.5) * .151 / u);
        shape.absarc(0, 0, .151 / u, 1.5, .15, true); shape.closePath();
      } else {shape.moveTo(-.12 / u, -.07 / u); shape.lineTo(.08 / u, -.08 / u); shape.lineTo(.13 / u, .04 / u); shape.lineTo(-.02 / u, .10 / u); shape.lineTo(-.11 / u, .03 / u); shape.closePath();}
      const fragment = mesh(group, new T.ExtrudeGeometry(shape, {depth: (kind === 'rim' ? .095 : .018) / u, bevelEnabled: true, bevelSize: .002 / u, bevelThickness: .0015 / u, bevelSegments: 1, steps: 1, curveSegments: 16}), clay);
      fragment.rotation.x = -Math.PI / 2; fragment.rotation.z = .3;
      if (kind === 'rim'&&wear==='soot-on-outer-face') {const soot = box(group, .08, .002, .035, edge, .09, .097, -.05); soot.rotation.y = -.5;}
    }
    return group;
  }
  function dispose() {
    if (disposed) return; disposed = true; root.parent?.remove(root);
    for (const proxy of proxies) {const index = owner.indexOf(proxy); if (index >= 0) owner.splice(index, 1);}
    for (const lease of leases) lease.dispose(); for (const value of resources) value.dispose?.();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, {once: true});
  try {
    const wood = material(0x8b7455), darkWood = material(0x574b39), stone = material(0xaaa18e), rope = material(0xe5ddc8), steel = material(0x929e9d, {roughness: .38, metalness: .7});
    const feature = at('feature');
    if (study.feature === 'cut-profile') {
      box(feature, 2.8, .8, .4, wood, 0, .4);
      box(feature, 2.55, .38, .43, material(0xb7986c), 0, .27);
      const fill = mesh(feature, new T.CylinderGeometry(.54 / u, .28 / u, .65 / u, 14), material(0x736752), .22, .5); fill.scale.z = .32;
    } else {
      for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
        if (study.feature === 'drain') {box(feature, .42, .23, .27, stone, (i - 2) * .46, .12 + row * .02, row ? .36 : -.36);}
        else {const block = box(feature, .43, .25, .42, stone, (i - 2) * .46 + row * .10, .125 + row * .25, 0); block.rotation.y = .035 * Math.sin(i * 3 + row);}
      }
      if (study.feature === 'drain') box(feature, 2.3, .06, .40, material(0x625f51), 0, .03);
    }
    label(feature, `${study.featureLabel}\nInspect without moving it\nFictional training feature`, 0, 1.25, 0, 2.8, .84); collider('feature', 1.35, .65, .85);
    const survey = at('survey');
    box(survey, .085, 1.15, .085, wood, 0, .575);
    const board = box(survey, .75, .54, .045, darkWood, 0, 1.17); board.rotation.x = -.15;
    label(survey, 'SURVEY GRID\nTape · compass · north\n1 m cells · A1 / B1', 0, 1.65, 0, 2.2, .68); collider('survey', .4, .25, 1.5);
    const trench = at('trench');
    box(trench, 2.30, .10, 1.34, darkWood, 0, .12);
    for (const x of [-1.13, 1.13]) box(trench, .08, .62, 1.34, wood, x, .47);
    box(trench, 2.25, .62, .08, wood, 0, .47, -.63);
    box(trench, 2.25, .08, .08, wood, 0, .76, .63);
    const layers = [], finds = [];
    for (const [index, layer] of study.layers.entries()) {
      const base = .30 + (1 - index) * .15;
      const soil = box(trench, 2, .15, 1, material(soilColors[layer.colour]), 0, base + .075);
      // The permanent rear section retains the original strata after a spit is removed.
      box(trench, 2, .15, .035, material(soilColors[layer.colour]), 0, base + .075, -.53);
      label(trench, `CONTEXT ${layer.id}\n${layer.name}`, 0, base + .07, .64, 1.2, .22);
      const find = artifact(trench, layer.artifact.kind, layer.cell === 'A1' ? -.5 : .5, base + .025, .06,layer.artifact.wear);
      finds.push(find); layers.push({soil, base, layer});
    }
    const grid = new T.Group(); trench.add(grid);
    for (const x of [-1, 0, 1]) box(grid, .008, .008, 1.04, rope, x, .79);
    for (const z of [-.5, .5]) box(grid, 2.04, .008, .008, rope, 0, .79, z);
    label(trench, 'TRAINING TRENCH\nRecord context before lifting', 0, 1.35, -.3, 2.7, .68);
    collider('trench', 1.18, .69, .82);
    // Provided tools remain visible at the task, with real blade/handle proportions.
    const toolRack = new T.Group(); toolRack.position.set(-1.04 / u, .80 / u, .3 / u); trench.add(toolRack);
    const blade = mesh(toolRack, new T.ConeGeometry(.065 / u, .18 / u, 3), steel); blade.rotation.z = Math.PI / 2; blade.scale.z = .05;
    box(toolRack, .14, .025, .025, wood, .13, 0);
    box(toolRack, .16, .025, .045, wood, .12, .01, -.25);
    for (let i = 0; i < 8; i++) box(toolRack, .045, .04, .004, rope, .02, -.01, -.27 + i * .006);
    const table = await loadModelAsset(T, 'workspace-table', {signal}); leases.push(table);
    if (disposed || !isCurrent()) {dispose(); return null;}
    table.root.scale.multiplyScalar(1 / u); const p = qualified.points.bench, bounds = new T.Box3().setFromObject(table.root);
    table.root.position.set(p.x, p.y - bounds.min.y, p.z); root.add(table.root); collider('bench', .70, .55, .95);
    const bench = at('bench'), packed = [];
    for (const [index, layer] of study.layers.entries()) {
      const group = new T.Group(); group.position.set((index - .5) * .58 / u, .92 / u, 0); bench.add(group);
      box(group, .43, .035, .31, layer.artifact.packing === 'supported-block' ? material(0x65523b) : material(0xd6c8a6));
      if (layer.artifact.packing === 'supported-block') box(group, .34, .095, .23, material(0x5f5140), 0, .05);
      else for (const z of [-.15, .15]) box(group, .43, .055, .02, wood, 0, .04, z);
      const find = artifact(group, layer.artifact.kind, -.05, layer.artifact.packing === 'supported-block' ? .115 : .035, 0,layer.artifact.wear);
      find.rotation.y = index ? -.3 : .3;
      label(group, `Context ${layer.id} · ${layer.cell}`, 0, .10, .2, .6, .16); packed.push(group);
    }
    label(bench, 'CATALOG & CONSERVATION\nKeep finds with their contexts', 0, 1.7, 0, 2.9, .68);
    const ring = mesh(root, new T.TorusGeometry(1.1 / u, .035 / u, 6, 48), resource(new T.MeshBasicMaterial({color: 0xefd079, transparent: true, opacity: .85, depthWrite: false})));
    ring.rotation.x = -Math.PI / 2;
    function update(active) {
      if (disposed) return;
      grid.visible = !!active.grid;
      for (const [index, row] of layers.entries()) {
        const remaining = Math.max(0, .15 - (active.excavation[row.layer.id] || 0) / 100);
        row.soil.visible = remaining > 0; row.soil.scale.y = remaining / .15; row.soil.position.y = (row.base + remaining / 2) / u;
        finds[index].visible = !active.artifacts[row.layer.id] && (active.excavation[row.layer.id] || 0) >= row.layer.thicknessCm;
        const artifactRow = active.artifacts[row.layer.id];
        packed[index].visible = !!artifactRow && !!runtime.playerBackpackInventory?.item?.(artifactRow.instanceId)?.quantity;
      }
      const target = active.phase === 'brief' ? 'feature' : active.phase === 'survey' ? 'survey' : active.phase === 'excavate' ? 'trench' : 'bench', point = qualified.points[target];
      ring.position.set(point.x, point.y + .05 / u, point.z + (target === 'feature' ? 1.8 : target === 'trench' ? 1.6 : 1.2) / u);
      ring.visible = active.phase !== 'complete';
    }
    runtime.scene.add(root);
    let meshes = 0, vertices = 0; root.traverse(object => {if (object.isMesh) {meshes++; vertices += object.geometry?.attributes?.position?.count || 0;}});
    return {root, update, dispose, budget: {meshes, vertices, colliders: proxies.length, sceneLeases: 1, modelLeases: leases.length}};
  } catch (error) {dispose(); throw error;}
}
