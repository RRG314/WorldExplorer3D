// Instance-owned cockpit displays. The existing vehicle presentation supplies
// accepted telemetry; this module has no timer, input or simulation authority.
export function createVehicleInstruments(THREE, root) {
  const materials = new Set();
  root.traverse(object => {
    if (object.userData?.vehicleInstrumentDisplay !== true) return;
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  if (!materials.size) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.flipY = false; // Prepared glTF UVs already use the image's top row.
  const previous = [...materials].map(material => ({material,map:material.map,emissiveMap:material.emissiveMap,
    color:material.color.clone(),emissive:material.emissive.clone(),
    emissiveIntensity:material.emissiveIntensity,toneMapped:material.toneMapped}));
  for (const material of materials) {
    // Exporters may fold the uniform placeholder image into dark PBR factors.
    // The live display supplies its own colors and must replace those factors.
    material.color.setHex(0xffffff); material.emissive.setHex(0xffffff);
    material.emissiveIntensity = .65; material.toneMapped = false;
    material.map = texture; material.emissiveMap = texture;
    material.needsUpdate = true;
  }
  let last = '', disposed = false;
  function update(speedMph = 0, engineRpm = 850, driveGear = 1, redlineRpm = 8000, reverse = false) {
    if (disposed) return false;
    const speed = Math.round(Math.abs(Number(speedMph) || 0));
    const rpm = Math.max(0, Math.round((Number(engineRpm) || 0) / 100) * 100);
    const redline = Math.max(1000, Number(redlineRpm) || 8000);
    const gear = reverse ? 'R' : String(Math.max(1, Math.min(8, Math.round(Number(driveGear) || 1))));
    const value = `${speed}/${rpm}/${gear}/${redline}`;
    if (value === last) return false;
    last = value;
    context.fillStyle = '#071015'; context.fillRect(0,0,512,256);
    for(let i=0;i<20;i++) {
      const active = rpm / redline >= (i+1)/20;
      context.fillStyle = active ? i>=18?'#ff5640':i>=15?'#ffcb46':'#78f1ba' : '#18303a';
      context.fillRect(16+i*24,16,19,22);
    }
    context.textAlign = 'left'; context.fillStyle = '#b5d4dd';
    context.font = 'bold 24px sans-serif';
    context.fillText('MPH',20,77); context.fillText('GEAR',362,77);
    context.fillStyle = '#efffff'; context.font = 'bold 112px monospace';
    context.fillText(String(speed),14,183);
    context.fillStyle = '#ffdc6d'; context.fillText(gear,378,183);
    context.fillStyle = '#91bdc9'; context.font = '26px monospace';
    context.fillText(`RPM ${rpm}`,20,232);
    texture.needsUpdate = true;
    return true;
  }
  update();
  return Object.freeze({update,dispose() {
    if(disposed)return; disposed = true;
    for(const {material,map,emissiveMap,color,emissive,emissiveIntensity,toneMapped} of previous){
      material.map=map;material.emissiveMap=emissiveMap;material.color.copy(color);material.emissive.copy(emissive);
      material.emissiveIntensity=emissiveIntensity;material.toneMapped=toneMapped;
    }
    texture.dispose();
  }});
}
