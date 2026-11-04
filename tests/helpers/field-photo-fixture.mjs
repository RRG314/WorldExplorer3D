// Browser-only actual encoded JPEGs; controlled scene evidence, not world photos.
export async function fieldPhotoFixtures() {
  const result = {};
  for (const [index, slot] of ['layer', 'orientation'].entries()) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const c = canvas.getContext('2d'),
      gradient = c.createLinearGradient(0, 0, 64, 64);
    gradient.addColorStop(0, index ? '#d3b485' : '#274c39');
    gradient.addColorStop(1, '#10241c');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#f8e3ad';
    c.fillRect(8 + index * 20, 20, 12, 28);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8),
      fingerprint = [
        ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl)))
      ]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    result[slot] = {
      photo: {
        id: `three-views:${index ? 'detail' : 'context'}`,
        kind: index ? 'detail' : 'context',
        width: 64,
        height: 64,
        dataUrl
      },
      capture: { width: 64, height: 64, fingerprint }
    };
  }
  return result;
}
