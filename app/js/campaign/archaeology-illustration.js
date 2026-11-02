import {ARCHAEOLOGY_STUDIES} from './archaeology-career.js';
const palette = {'pale-brown': '#b7a17b', 'dark-brown': '#615044', 'mottled-brown': '#9d927a', 'ochre-brown': '#ab8555'};
export function drawTrainingArtifact(context, kind, x, y, size, wear) {
  const c = context; c.save(); c.translate(x, y); c.scale(size / 100, size / 100);
  c.lineWidth = 3; c.strokeStyle = '#453a31';
  if (kind === 'bead') {
    c.fillStyle = '#628d9a'; c.beginPath(); c.ellipse(0, 0, 32, 26, -.3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#f2ecdb'; c.beginPath(); c.ellipse(0, 0, 9, 8, -.3, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle='#cbd9d7';c.lineWidth=1.5;for(let i=0;i<4;i++){c.beginPath();c.moveTo(-22+i*12,-16);c.lineTo(-17+i*12,-9);c.stroke();}
  } else if (kind === 'wood') {
    c.fillStyle = '#4b3c2f'; c.beginPath(); c.moveTo(-42, -12); c.lineTo(35, -18); c.lineTo(45, 9); c.lineTo(-33, 17); c.closePath(); c.fill();
    c.strokeStyle = '#a48b67'; c.lineWidth = 2; for (let i = -8; i <= 9; i += 5) {c.beginPath(); c.moveTo(-32, i); c.lineTo(34, i - 3); c.stroke();}
  } else {
    c.fillStyle = '#b47450'; c.beginPath(); c.moveTo(-35, -22); c.lineTo(29, -31); c.lineTo(42, 14); c.lineTo(-12, 31); c.lineTo(-39, 9); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#dcae86'; c.lineWidth = 6; c.beginPath(); c.moveTo(-31, -16); c.quadraticCurveTo(0, -26, 31, -20); c.stroke();
    if (kind === 'rim'&&wear==='soot-on-outer-face') {c.strokeStyle = '#4a3c34'; c.lineWidth = 8; c.beginPath(); c.moveTo(-18, 12); c.lineTo(26, 0); c.stroke();}
  }
  c.restore();
}
export function drawArchaeologySection(canvas, active) {
  const c = canvas.getContext('2d'), study = ARCHAEOLOGY_STUDIES[active.variantId];
  canvas.width = 720; canvas.height = 300; c.fillStyle = '#152a23'; c.fillRect(0, 0, 720, 300);
  c.fillStyle = '#f3f0e4'; c.font = 'bold 20px system-ui'; c.fillText('TRAINING SECTION · one-metre grid', 22, 30);
  for (const [index, layer] of study.layers.entries()) {
    const y = 57 + index * 92, removed = active.artifacts[layer.id], exposed = (active.excavation[layer.id] || 0) >= layer.thicknessCm;
    c.fillStyle = palette[layer.colour]; c.fillRect(22, y, 480, 88);
    c.strokeStyle = '#5c5346'; c.lineWidth = 1;
    for (let i = 0; i < 44; i++) {const x = 30 + (i * 47 % 460), py = y + 7 + (i * 23 % 74); c.beginPath(); c.moveTo(x, py); c.lineTo(x + 7, py + 2); c.stroke();}
    if (exposed && !removed) drawTrainingArtifact(c, layer.artifact.kind, layer.cell === 'A1' ? 145 : 360, y + 45, 90,layer.artifact.wear);
    c.fillStyle = '#17271f'; c.fillRect(512, y, 190, 88); c.fillStyle = '#f3f0e4'; c.font = 'bold 18px system-ui'; c.fillText('Context ' + layer.id, 524, y + 25);
    c.font = '15px system-ui'; c.fillText(`${index * 15}–${(index + 1) * 15} cm · ${layer.cell}`, 524, y + 47);
    c.fillText(removed ? 'Packed with context' : exposed ? 'Ready to document' : `${active.excavation[layer.id] || 0}/15 cm exposed`, 524, y + 70);
  }
  c.strokeStyle = '#f0d17a'; c.lineWidth = 2; c.setLineDash([7, 5]); c.beginPath(); c.moveTo(262, 57); c.lineTo(262, 237); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#f3f0e4'; c.font = '16px system-ui'; c.fillText('A1', 125, 267); c.fillText('B1', 360, 267); c.fillText('Diagram magnifies the section; it is not a real excavation.', 22, 292);
}
export function drawArchaeologyPlate(canvas, report) {
  canvas.width = 720; canvas.height = 480; const c = canvas.getContext('2d');
  const study = Object.values(ARCHAEOLOGY_STUDIES).find(row => row.label === report?.title);
  c.fillStyle = '#f0e9d9'; c.fillRect(0, 0, 720, 480); c.fillStyle = '#233c30'; c.font = 'bold 24px system-ui'; c.fillText(report?.title || 'Archaeological site plate', 26, 40, 670);
  c.font = '15px system-ui'; c.fillText('FICTIONAL TRAINING SITE · contextual catalog', 26, 66);
  for (const [index, layer] of (study?.layers || []).entries()) {
    const x = 28 + index * 346; c.fillStyle = '#d7cbb5'; c.fillRect(x, 88, 320, 250);
    drawTrainingArtifact(c, layer.artifact.kind, x + 160, 170, 180,report?.tests?.[`${layer.id}:wear`]?.result||layer.artifact.wear);
    c.fillStyle = '#233c30'; c.font = 'bold 20px system-ui'; c.fillText('Context ' + layer.id + ' · ' + layer.cell, x + 16, 247);
    c.font = '17px system-ui'; c.fillText(layer.artifact.name, x + 16, 274, 288); c.fillText((report?.classifications?.[layer.id]||'unclassified') + ' · ' + (report?.contexts?.[layer.id]?.fabric||layer.fabric).replaceAll('-', ' '), x + 16, 301, 288);
  }
  c.fillStyle = '#233c30'; c.font = '17px system-ui';
  c.fillText('Upper context covers lower context; recorded before lifting.', 28, 371, 665);
  c.fillText('Retain alternatives · ' + String(report?.alternative || '').replaceAll('-', ' '), 28, 402, 665);
  c.fillText('Conservation · ' + String(report?.conservation || '').replaceAll('-', ' '), 28, 433, 665);
  c.font = '14px system-ui'; c.fillText('Training replicas and virtual procedures. No real-site excavation permission.', 28, 466, 665);
}
