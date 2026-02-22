function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createNameTag(THREE, labelText) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const text = String(labelText || 'Explorer').slice(0, 24);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 20, 38, 0.8)';
  ctx.strokeStyle = 'rgba(83, 196, 255, 0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 12, canvas.width - 16, canvas.height - 24, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e6f4ff';
  ctx.font = '600 44px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 2, 1);
  sprite.position.set(0, 3.2, 0);

  return { canvas, texture, sprite };
}

function disposeGhostEntry(entry) {
  if (!entry) return;
  if (entry.nameTag?.texture) entry.nameTag.texture.dispose();
  if (entry.nameTag?.sprite?.material) entry.nameTag.sprite.material.dispose();
  if (entry.marker?.material) entry.marker.material.dispose();
}

function createGhostManager(scene, options = {}) {
  const THREE = globalThis.THREE;
  if (!scene || !THREE) {
    const noop = () => {};
    return {
      updateGhosts: noop,
      tick: noop,
      clear: noop,
      destroy: noop,
      setVisible: noop,
      isVisible: () => false
    };
  }

  const root = new THREE.Group();
  root.name = 'multiplayer-ghost-root';
  scene.add(root);

  const geometry = new THREE.SphereGeometry(0.85, 12, 10);
  const entries = new Map();
  let visible = true;
  let lastTickAt = 0;
  const tickIntervalMs = 1000 / 30;

  function getSelfUid() {
    if (typeof options.getSelfUid === 'function') return String(options.getSelfUid() || '');
    return String(globalThis.__WE3D_AUTH_UID__ || '');
  }

  function makeEntry(player) {
    const marker = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0x53c4ff,
        transparent: true,
        opacity: 0.78
      })
    );

    marker.position.set(0, 0, 0);
    marker.renderOrder = 500;

    const holder = new THREE.Group();
    holder.add(marker);

    const nameTag = createNameTag(THREE, player.displayName || 'Explorer');
    if (nameTag?.sprite) holder.add(nameTag.sprite);

    root.add(holder);

    return {
      uid: player.uid,
      holder,
      marker,
      nameTag,
      displayName: player.displayName || 'Explorer',
      current: {
        x: finiteNumber(player.pose?.x, 0),
        y: finiteNumber(player.pose?.y, 0),
        z: finiteNumber(player.pose?.z, 0)
      },
      target: {
        x: finiteNumber(player.pose?.x, 0),
        y: finiteNumber(player.pose?.y, 0),
        z: finiteNumber(player.pose?.z, 0)
      }
    };
  }

  function updateLabel(entry, nextLabel) {
    const normalized = String(nextLabel || 'Explorer').slice(0, 24);
    if (normalized === entry.displayName) return;
    entry.displayName = normalized;

    if (entry.nameTag?.texture) entry.nameTag.texture.dispose();
    if (entry.nameTag?.sprite?.material) entry.nameTag.sprite.material.dispose();
    if (entry.nameTag?.sprite) entry.holder.remove(entry.nameTag.sprite);

    const replacement = createNameTag(THREE, normalized);
    entry.nameTag = replacement;
    if (replacement?.sprite) {
      entry.holder.add(replacement.sprite);
    }
  }

  function removeEntry(uid) {
    const entry = entries.get(uid);
    if (!entry) return;
    entries.delete(uid);
    root.remove(entry.holder);
    disposeGhostEntry(entry);
  }

  function updateGhosts(playersSnapshot = []) {
    const selfUid = getSelfUid();
    const seen = new Set();

    for (const player of playersSnapshot) {
      const uid = String(player?.uid || '');
      if (!uid) continue;
      if (uid === selfUid) continue;

      seen.add(uid);
      let entry = entries.get(uid);
      if (!entry) {
        entry = makeEntry(player);
        entries.set(uid, entry);
      }

      updateLabel(entry, player.displayName || 'Explorer');
      entry.target.x = finiteNumber(player.pose?.x, entry.target.x);
      entry.target.y = finiteNumber(player.pose?.y, entry.target.y);
      entry.target.z = finiteNumber(player.pose?.z, entry.target.z);
    }

    for (const uid of entries.keys()) {
      if (!seen.has(uid)) removeEntry(uid);
    }
  }

  function tick(nowMs = performance.now()) {
    if (!visible) return;
    if (nowMs - lastTickAt < tickIntervalMs) return;
    lastTickAt = nowMs;

    for (const entry of entries.values()) {
      const lerpAlpha = 0.38;
      entry.current.x += (entry.target.x - entry.current.x) * lerpAlpha;
      entry.current.y += (entry.target.y - entry.current.y) * lerpAlpha;
      entry.current.z += (entry.target.z - entry.current.z) * lerpAlpha;
      entry.holder.position.set(entry.current.x, entry.current.y, entry.current.z);
    }
  }

  function clear() {
    for (const uid of Array.from(entries.keys())) {
      removeEntry(uid);
    }
  }

  function setVisible(nextVisible) {
    visible = !!nextVisible;
    root.visible = visible;
  }

  function destroy() {
    clear();
    scene.remove(root);
    geometry.dispose();
  }

  setVisible(true);

  return {
    updateGhosts,
    tick,
    clear,
    destroy,
    setVisible,
    isVisible: () => visible
  };
}

export { createGhostManager };
