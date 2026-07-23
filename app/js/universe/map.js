import { UNIVERSE_CATALOG, distanceLightYears, icrsToCartesian } from './catalog.js?v=5';

const SCOPE_CLASSES = Object.freeze({
  nearby: new Set(['planetary_system']),
  galaxy: new Set(['planetary_system', 'stellar_region', 'nebula']),
  deep: new Set(['galaxy', 'galaxy_cluster', 'black_hole', 'nebula'])
});

const COLORS = Object.freeze({
  planetary_system: '#ffd27a',
  exoplanet: '#79b9ff',
  nebula: '#d79cff',
  stellar_region: '#69d7c1',
  galaxy: '#91a9ff',
  galaxy_cluster: '#f09cff',
  black_hole: '#ff8a65'
});

function scopeForEntity(entity) {
  if (entity?.objectClass === 'planetary_system') return 'system';
  if (['galaxy', 'galaxy_cluster', 'black_hole'].includes(entity?.objectClass)) return 'deep';
  if (['stellar_region', 'nebula'].includes(entity?.objectClass)) return 'galaxy';
  return 'nearby';
}

function catalogNodes(scope, focusEntity) {
  if (scope === 'system') {
    const system = focusEntity?.objectClass === 'planetary_system'
      ? focusEntity
      : UNIVERSE_CATALOG.find((item) => item.id === 'sol');
    const center = { ...system, mapX: 0, mapY: 0, mapRadius: 0, travelable: true };
    const children = (system?.children || []).map((child, index) => {
      const orbitAu = Math.max(0.005, Number(child.semiMajorAxisAu) || (index + 1) * 0.2);
      const radius = Math.log10(1 + orbitAu * 18);
      const angle = index * 2.399963 + 0.7;
      return {
        ...child,
        parentId: system.id,
        mapX: Math.cos(angle) * radius,
        mapY: Math.sin(angle) * radius,
        mapRadius: radius,
        travelable: false
      };
    });
    return [center, ...children];
  }

  const classes = SCOPE_CLASSES[scope] || SCOPE_CLASSES.nearby;
  return UNIVERSE_CATALOG.filter((item) => {
    if (item.id === 'sol') return true;
    if (!classes.has(item.objectClass)) return false;
    const distance = distanceLightYears(item);
    if (scope === 'nearby') return item.id === 'sol' || (distance > 0 && distance <= 1000);
    if (scope === 'galaxy') return item.id === 'sol' || item.parentId === 'milky-way' || item.parentId?.includes('milky-way');
    return distance >= 1000 || ['galaxy', 'galaxy_cluster', 'black_hole'].includes(item.objectClass);
  }).map((item) => {
    if (item.id === 'sol') return { ...item, mapX: 0, mapY: 0, mapRadius: 0, travelable: true };
    const cartesian = icrsToCartesian(item, 1);
    const distance = Math.max(0.001, distanceLightYears(item));
    const compressedRadius = Math.log10(1 + distance);
    const horizontalLength = Math.hypot(cartesian.x, cartesian.z) || 1;
    return {
      ...item,
      mapX: cartesian.x / horizontalLength * compressedRadius,
      mapY: cartesian.z / horizontalLength * compressedRadius,
      mapRadius: compressedRadius,
      travelable: true
    };
  });
}

function mapBounds(nodes) {
  let maxExtent = 1;
  nodes.forEach((node) => {
    maxExtent = Math.max(maxExtent, Math.abs(node.mapX), Math.abs(node.mapY), Number(node.mapRadius) || 0);
  });
  return maxExtent * 1.18;
}

function drawGrid(ctx, width, height, scope, zoom, panX, panY) {
  ctx.fillStyle = '#050914';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + panX, height / 2 + panY);
  ctx.strokeStyle = 'rgba(118, 157, 208, 0.18)';
  ctx.lineWidth = 1;
  const rings = scope === 'system' ? 6 : 5;
  for (let i = 1; i <= rings; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(width, height) * 0.42 * zoom * i / rings, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-width, 0);
  ctx.lineTo(width, 0);
  ctx.moveTo(0, -height);
  ctx.lineTo(0, height);
  ctx.stroke();
  ctx.restore();
}

function nodeRadius(node, selected, current) {
  if (node.id === current?.id) return 7;
  if (node.id === selected?.id) return 6;
  if (node.objectClass === 'galaxy_cluster') return 5;
  if (node.objectClass === 'galaxy' || node.objectClass === 'black_hole') return 4.5;
  return 3.5;
}

function createUniverseMap(canvas, handlers = {}) {
  const ctx = canvas.getContext('2d');
  const view = {
    scope: 'nearby',
    zoom: 1,
    panX: 0,
    panY: 0,
    nodes: [],
    projected: [],
    current: null,
    selected: null,
    focus: null,
    hover: null,
    dragging: false,
    pointerX: 0,
    pointerY: 0,
    pointerStartX: 0,
    pointerStartY: 0
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(320, Math.round(rect.width * ratio));
    const height = Math.max(220, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw();
  };

  const draw = () => {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    drawGrid(ctx, width, height, view.scope, view.zoom, view.panX, view.panY);
    const extent = mapBounds(view.nodes);
    const scale = Math.min(width, height) * 0.39 / extent * view.zoom;
    view.projected = view.nodes.map((node) => ({
      node,
      x: width / 2 + view.panX + node.mapX * scale,
      y: height / 2 + view.panY + node.mapY * scale
    }));

    const origin = view.projected.find((entry) => entry.node.id === 'sol');
    if (origin && view.scope !== 'system') {
      ctx.save();
      ctx.strokeStyle = 'rgba(105, 151, 210, 0.13)';
      ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
      view.projected.forEach((entry) => {
        if (entry === origin) return;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(entry.x, entry.y);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (view.scope === 'system') {
      ctx.save();
      ctx.translate(width / 2 + view.panX, height / 2 + view.panY);
      ctx.strokeStyle = 'rgba(121, 185, 255, 0.28)';
      view.nodes.slice(1).forEach((node) => {
        ctx.beginPath();
        ctx.arc(0, 0, node.mapRadius * scale, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    view.projected.forEach(({ node, x, y }) => {
      const selected = node.id === view.selected?.id;
      const current = node.id === view.current?.id;
      const hovered = node.id === view.hover?.id;
      const radius = nodeRadius(node, view.selected, view.current) * (window.devicePixelRatio || 1);
      ctx.beginPath();
      ctx.arc(x, y, radius + (hovered ? 3 : selected ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = current ? '#ffffff' : COLORS[node.objectClass] || '#9bb4d6';
      ctx.fill();
      if (selected || current) {
        ctx.strokeStyle = selected ? '#5ca4ff' : '#6ee7b7';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (hovered || selected || current) {
        ctx.fillStyle = '#eef6ff';
        ctx.font = `${11 * (window.devicePixelRatio || 1)}px Inter, sans-serif`;
        ctx.fillText(node.name, x + radius + 5, y - radius - 2);
      }
    });
  };

  const nodeAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    let best = null;
    let bestDistance = 16 * Math.max(sx, sy);
    view.projected.forEach((entry) => {
      const distance = Math.hypot(entry.x - x, entry.y - y);
      if (distance < bestDistance) {
        best = entry.node;
        bestDistance = distance;
      }
    });
    return best;
  };

  canvas.addEventListener('pointerdown', (event) => {
    view.dragging = true;
    view.pointerX = event.clientX;
    view.pointerY = event.clientY;
    view.pointerStartX = event.clientX;
    view.pointerStartY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (view.dragging) {
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      view.panX += (event.clientX - view.pointerX) * ratio;
      view.panY += (event.clientY - view.pointerY) * ratio;
      view.pointerX = event.clientX;
      view.pointerY = event.clientY;
      draw();
      return;
    }
    view.hover = nodeAt(event.clientX, event.clientY);
    canvas.style.cursor = view.hover ? 'pointer' : 'grab';
    draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    const moved = Math.hypot(event.clientX - view.pointerStartX, event.clientY - view.pointerStartY);
    view.dragging = false;
    canvas.releasePointerCapture?.(event.pointerId);
    if (moved <= 4) {
      const node = nodeAt(event.clientX, event.clientY);
      if (node) handlers.onInspect?.(node);
    }
  });
  canvas.addEventListener('dblclick', (event) => {
    const node = nodeAt(event.clientX, event.clientY);
    if (node?.travelable) handlers.onTravel?.(node.id);
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    view.zoom = Math.max(0.65, Math.min(4, view.zoom * Math.exp(-event.deltaY * 0.0012)));
    draw();
  }, { passive: false });

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    setScope(scope, focus = view.focus) {
      view.scope = ['nearby', 'galaxy', 'deep', 'system'].includes(scope) ? scope : scopeForEntity(focus);
      view.focus = focus;
      view.zoom = 1;
      view.panX = 0;
      view.panY = 0;
      view.nodes = catalogNodes(view.scope, focus);
      draw();
    },
    update(state) {
      view.current = state?.current || null;
      view.selected = state?.selected || null;
      view.focus = view.selected || view.current;
      view.nodes = catalogNodes(view.scope, view.focus);
      draw();
    },
    inspect(entity) {
      view.selected = entity;
      draw();
    },
    scopeForEntity,
    resize
  };
}

export { createUniverseMap, scopeForEntity };
