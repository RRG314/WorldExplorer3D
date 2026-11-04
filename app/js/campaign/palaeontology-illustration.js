export function drawFossil(c, kind, x, y, size) {
  c.save();
  c.translate(x, y);
  c.scale(size / 100, size / 100);
  c.strokeStyle = '#5a4b37';
  c.fillStyle = '#c3a779';
  c.lineWidth = 3;
  if (kind === 'coiled-shell') {
    c.lineWidth = 10;
    c.beginPath();
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * Math.PI * 4.6,
        r = 2 + 2.5 * t,
        px = Math.cos(t) * r,
        py = Math.sin(t) * r;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.stroke();
    c.lineWidth = 1.5;
    c.strokeStyle = '#ead5ad';
    for (let i = 35; i < 160; i += 5) {
      const t = (i / 160) * Math.PI * 4.6,
        r = 2 + 2.5 * t;
      c.beginPath();
      c.moveTo(Math.cos(t) * (r - 4), Math.sin(t) * (r - 4));
      c.lineTo(Math.cos(t) * (r + 4), Math.sin(t) * (r + 4));
      c.stroke();
    }
  } else if (kind === 'leaf') {
    c.beginPath();
    c.moveTo(0, 43);
    c.bezierCurveTo(34, 12, 29, -21, 0, -44);
    c.bezierCurveTo(-29, -21, -34, 12, 0, 43);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(0, 43);
    c.lineTo(0, -43);
    c.stroke();
    for (let i = -25; i <= 25; i += 10)
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(0, i + 9);
        c.lineTo(side * (22 - Math.abs(i) * 0.3), i - 6);
        c.stroke();
      }
  } else {
    for (const side of [-1, 1]) {
      c.beginPath();
      c.ellipse(side * 21, 0, 20, 32, side * 0.17, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(side * 21, 28);
        c.lineTo(side * 21 + i * 4, -26 + Math.abs(i) * 2);
        c.stroke();
      }
    }
    c.fillStyle = '#e5d9be';
    c.fillRect(29, -22, 19, 14);
  }
  c.restore();
}
export function drawFossilPlate(canvas, report) {
  canvas.width = 720;
  canvas.height = 480;
  const c = canvas.getContext('2d'),
    kind =
      report?.form === 'veined-leaf'
        ? 'leaf'
        : report?.form === 'paired-valves'
          ? 'paired-shell'
          : 'coiled-shell';
  c.fillStyle = '#f0e8d8';
  c.fillRect(0, 0, 720, 480);
  c.fillStyle = '#243a32';
  c.font = 'bold 25px system-ui';
  c.fillText(report?.title || 'Fossil context plate', 26, 40, 668);
  c.font = '15px system-ui';
  c.fillText('ORIGINAL INVENTED TRAINING CAST · not an authentic fossil scan', 26, 68, 668);
  c.fillStyle = '#dfd0b5';
  c.fillRect(26, 92, 250, 270);
  drawFossil(c, kind, 151, 210, 240);
  c.fillStyle = '#243a32';
  c.font = '17px system-ui';
  c.fillText('Illustration · not to scale', 44, 340);
  const text = (label, value, y) => {
    c.font = 'bold 17px system-ui';
    c.fillText(label, 300, y);
    c.font = '17px system-ui';
    c.fillText(String(value || 'Not recorded').replaceAll('-', ' '), 300, y + 26, 392);
  };
  text(
    'Layer and orientation',
    `${report?.orientation?.layer || ''} · ${report?.orientation?.axis || ''}`,
    116
  );
  text('Morphology', report?.classification?.kind, 188);
  text('Enclosing sediment', report?.tests?.sediment?.result, 260);
  text('Preparation support', report?.support?.method, 332);
  c.font = '17px system-ui';
  c.fillText(
    'Interpretation · ' + String(report?.interpretation || '').replaceAll('-', ' '),
    26,
    409,
    668
  );
  c.fillText('Limit · ' + String(report?.limitation || '').replaceAll('-', ' '), 26, 439, 668);
  c.font = '14px system-ui';
  c.fillText(
    'Photographed in place before preparation · original field records in Journal',
    26,
    467,
    668
  );
}
