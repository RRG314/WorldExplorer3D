import { ctx as appCtx } from "../shared-context.js?v=55";
import { buildingKey, pointToSegmentDistance, summarizeSupportType } from "../building-entry.js?v=6";

function createInteriorRuntimeUiApi() {
  let transientHint = { text: "", until: 0 };
  let candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
  let lastPromptState = { text: "", variant: "" };

  function ensurePromptElement() {
    const element = document.getElementById("interiorPrompt");
    if (element && element.dataset.interactionBound !== 'true') {
      element.dataset.interactionBound = 'true';
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', 'Use nearby building interaction');
      element.addEventListener('click', () => {
        if (!element.classList.contains('show')) return;
        Promise.resolve(appCtx.handleInteriorAction?.()).catch((error) => {
          console.warn('[interior] Touch interaction failed:', error);
        });
      });
    }
    return element;
  }

  function setPrompt(text, variant = "inspect") {
    const el = ensurePromptElement();
    if (!el) return;
    const message = String(text || "").trim();
    if (lastPromptState.text === message && lastPromptState.variant === variant) return;
    lastPromptState = { text: message, variant };
    if (!message) {
      el.classList.remove("show");
      el.textContent = "";
      delete el.dataset.variant;
      return;
    }
    const touchPreferred = (() => {
      try {
        return (navigator.maxTouchPoints || 0) > 0 || window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      } catch (_) {
        return false;
      }
    })();
    el.textContent = touchPreferred && /^E\s+/.test(message)
      ? message.replace(/^E\s+/, 'Tap · ')
      : message;
    el.dataset.variant = variant;
    el.classList.add("show");
  }

  function clearPrompt() {
    setPrompt("");
  }

  function setTransientHint(text, durationMs, deps) {
    transientHint = {
      text: String(text || "").trim(),
      until: performance.now() + Math.max(900, Number.isFinite(durationMs) ? durationMs : deps.INTERIOR_NOTICE_MS)
    };
  }

  function snapshotMaterialState(material) {
    if (!material) return null;
    return {
      material,
      side: material.side,
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite
    };
  }

  function eachMeshMaterial(mesh, callback) {
    if (!mesh?.material || typeof callback !== "function") return [];
    if (Array.isArray(mesh.material)) {
      return mesh.material.map((material) => callback(material)).filter(Boolean);
    }
    const result = callback(mesh.material);
    return result ? [result] : [];
  }

  function prepareExteriorShellForInterior(building) {
    const key = buildingKey(building);
    const states = [];
    if (!Array.isArray(appCtx.buildingMeshes)) return states;
    for (let i = 0; i < appCtx.buildingMeshes.length; i++) {
      const mesh = appCtx.buildingMeshes[i];
      const meshKey = mesh?.userData?.sourceBuildingId ? String(mesh.userData.sourceBuildingId) : "";
      if (!mesh || meshKey !== key) continue;
      const isPrimaryShell = Array.isArray(mesh.userData?.buildingFootprint) && mesh.userData.buildingFootprint.length >= 3;
      states.push({
        mesh,
        visible: mesh.visible,
        materialStates: eachMeshMaterial(mesh, snapshotMaterialState)
      });
      if (isPrimaryShell) {
        mesh.visible = true;
        eachMeshMaterial(mesh, (material) => {
          material.side = THREE.DoubleSide;
          material.transparent = false;
          material.opacity = 1;
          material.depthWrite = true;
          return null;
        });
        continue;
      }
      mesh.visible = false;
    }
    return states;
  }

  function restoreExteriorShellState(states) {
    if (!Array.isArray(states)) return;
    states.forEach((state) => {
      if (!state?.mesh) return;
      state.mesh.visible = state.visible !== false;
      if (!Array.isArray(state.materialStates)) return;
      state.materialStates.forEach((materialState) => {
        if (!materialState?.material) return;
        materialState.material.side = materialState.side;
        materialState.material.transparent = materialState.transparent;
        materialState.material.opacity = materialState.opacity;
        materialState.material.depthWrite = materialState.depthWrite;
      });
    });
  }

  function boundsOverlap(a, b, pad = 0) {
    if (!a || !b) return false;
    return !(
      a.maxX < b.minX - pad ||
      a.minX > b.maxX + pad ||
      a.maxZ < b.minZ - pad ||
      a.minZ > b.maxZ + pad
    );
  }

  function meshWorldBounds2D(mesh) {
    if (!mesh?.geometry) return null;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bbox = mesh.geometry.boundingBox;
    if (!bbox) return null;
    mesh.updateMatrixWorld?.(true);
    const min = bbox.min.clone().applyMatrix4(mesh.matrixWorld);
    const max = bbox.max.clone().applyMatrix4(mesh.matrixWorld);
    return {
      minX: Math.min(min.x, max.x),
      maxX: Math.max(min.x, max.x),
      minZ: Math.min(min.z, max.z),
      maxZ: Math.max(min.z, max.z)
    };
  }

  function collectInteriorWorldSuppressionStates(footprint, center, radius = 42, deps) {
    const states = [];
    if (!Array.isArray(footprint) || footprint.length < 3) return states;
    const footprintBox = {
      minX: Math.min(...footprint.map((point) => point.x)),
      maxX: Math.max(...footprint.map((point) => point.x)),
      minZ: Math.min(...footprint.map((point) => point.z)),
      maxZ: Math.max(...footprint.map((point) => point.z))
    };
    const refX = deps.finiteNumber(center?.x, (footprintBox.minX + footprintBox.maxX) * 0.5);
    const refZ = deps.finiteNumber(center?.z, (footprintBox.minZ + footprintBox.maxZ) * 0.5);
    const meshLists = [
      appCtx.roadMeshes,
      appCtx.landuseMeshes,
      appCtx.vegetationMeshes,
      appCtx.poiMeshes,
      appCtx.streetFurnitureMeshes
    ];

    meshLists.forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((mesh) => {
        if (!mesh || mesh.visible === false) return;
        const bounds = meshWorldBounds2D(mesh);
        if (!bounds || !boundsOverlap(bounds, footprintBox, 1.2)) return;
        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cz = (bounds.minZ + bounds.maxZ) * 0.5;
        if (Math.hypot(cx - refX, cz - refZ) > radius) return;
        states.push({ mesh, visible: mesh.visible !== false });
        mesh.visible = false;
      });
    });
    return states;
  }

  function restoreInteriorWorldSuppression(states) {
    if (!Array.isArray(states)) return;
    states.forEach((state) => {
      if (!state?.mesh) return;
      state.mesh.visible = state.visible !== false;
    });
  }

  function disposeObject3D(root) {
    if (!root) return;
    root.traverse((node) => {
      if (node?.geometry?.dispose) node.geometry.dispose();
      if (node?.material) {
        eachMeshMaterial(node, (material) => {
          if (material?.dispose) material.dispose();
        });
      }
    });
    if (root.parent) root.parent.remove(root);
  }

  function resetInteriorInteractionCache() {
    candidateCache = { at: 0, x: NaN, z: NaN, candidate: null };
  }

  function interiorReferencePosition(deps) {
    if (appCtx.Walk && typeof appCtx.Walk.getMapRefPosition === "function") {
      return appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone);
    }
    return {
      x: deps.finiteNumber(appCtx.car?.x, 0),
      z: deps.finiteNumber(appCtx.car?.z, 0)
    };
  }

  function shortLabel(label, max = 30) {
    const text = String(label || "Building").trim() || "Building";
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function currentSupportDisplayType(support, deps) {
    const cached = support?.key ? deps.interiorCache.get(support.key) : null;
    const mappedState = cached?.mode === "mapped" ? "mapped" : cached?.mode === "generated" ? "generated" : "unknown";
    return summarizeSupportType(support, mappedState);
  }

  function publishInteriorLegendState(options = {}, deps) {
    const { loading = false, message = "", items = null } = options;
    const ref = interiorReferencePosition(deps);
    const nextItems = items === null ? deps.listSupportedInteriorsNear(ref.x, ref.z, 220, 8, deps) : items;
    appCtx.interiorLegendLoading = !!loading;
    appCtx.interiorLegendMessage = String(message || "");
    appCtx.interiorLegendEntries = Array.isArray(nextItems) ? nextItems : [];
    if (typeof appCtx.renderInteriorLegend === "function") appCtx.renderInteriorLegend();
  }

  return {
    clearPrompt,
    collectInteriorWorldSuppressionStates,
    currentSupportDisplayType,
    disposeObject3D,
    getCandidateCache: () => candidateCache,
    getTransientHint: () => transientHint,
    interiorReferencePosition,
    pointToSegmentDistance,
    prepareExteriorShellForInterior,
    publishInteriorLegendState,
    resetInteriorInteractionCache,
    restoreExteriorShellState,
    restoreInteriorWorldSuppression,
    setCandidateCache: (value) => { candidateCache = value; },
    setPrompt,
    setTransientHint,
    shortLabel
  };
}

export { createInteriorRuntimeUiApi };
