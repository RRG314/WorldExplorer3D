import { ctx as appCtx } from "../shared-context.js?v=55";
import { normalizeAngle, siderealTime, toDays } from "../astro.js?v=1";
import { createRoundStarMaterial } from "./star-point-material.js?v=4";
import { createGaiaSkyLayers } from "./gaia-catalog.js?v=4";

const STARFIELD_RADIUS = 5000;
const _skyMatrix = new THREE.Matrix4();
const _skyXAxis = new THREE.Vector3();
const _skyYAxis = new THREE.Vector3();
const _skyZAxis = new THREE.Vector3();
const _bodyVector = new THREE.Vector3();
const _bodyEast = new THREE.Vector3();
const _bodyUp = new THREE.Vector3();
const _bodySouth = new THREE.Vector3();
const _inertialX = new THREE.Vector3(1, 0, 0);
const _inertialY = new THREE.Vector3(0, 1, 0);
const _inertialZ = new THREE.Vector3(0, 0, 1);
const _rotationX = new THREE.Vector3(1, 0, 0);
const _rotationZ = new THREE.Vector3(0, 0, 1);
const BRIGHT_STAR_LAYER_NAME = 'Bright Star Catalog';
const FAINT_STAR_LAYER_NAME = 'Faint Star Background';

function setStarFieldObserverVisuals(observerBody = 'earth') {
  if (!appCtx.starField) return;
  const body = String(observerBody || 'earth').toLowerCase();
  const planetary = body === 'moon' || body === 'mars';
  const brightStars = appCtx.starField.getObjectByName(BRIGHT_STAR_LAYER_NAME);
  const faintStars = appCtx.starField.getObjectByName(FAINT_STAR_LAYER_NAME);

  if (brightStars?.material) {
    brightStars.material.size = planetary ? (body === 'mars' ? 5.0 : 5.4) : 6.2;
    brightStars.material.vertexColors = false;
    brightStars.material.color.setHex(0xffffff);
    brightStars.material.opacity = Number(brightStars.userData?.baseOpacity) || 0.98;
    brightStars.material.needsUpdate = true;
  }
  if (faintStars?.material) {
    faintStars.visible = true;
    faintStars.material.size = planetary ? (body === 'mars' ? 3.9 : 4.0) : 4.2;
    faintStars.material.opacity = Number(faintStars.userData?.baseOpacity) || 0.92;
    faintStars.material.needsUpdate = true;
  }
}

function raDecToVector(ra, dec, radius = STARFIELD_RADIUS) {
  const raRad = ra / 24 * Math.PI * 2;
  const decRad = dec * Math.PI / 180;

  return new THREE.Vector3(
    radius * Math.cos(decRad) * Math.cos(raRad),
    radius * Math.sin(decRad),
    radius * Math.cos(decRad) * Math.sin(raRad)
  );
}

export function createStarField() {
  const group = new THREE.Group();
  const hitboxGeometry = new THREE.SphereGeometry(1, 6, 4);
  const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const brightPositions = [];

  appCtx.BRIGHT_STARS.forEach((star) => {
    const pos = raDecToVector(star.ra, star.dec);
    brightPositions.push(pos.x, pos.y, pos.z);

    const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
    hitbox.position.copy(pos);
    hitbox.scale.setScalar(80);

    hitbox.userData = {
      name: star.name,
      proper: star.proper || star.name,
      mag: star.mag,
      dist: star.dist,
      constellation: star.constellation,
      isPlanet: star.isPlanet || false,
      isClickable: true,
      ra: star.ra,
      dec: star.dec,
      skyHitbox: true
    };
    group.add(hitbox);
  });

  const brightGeometry = new THREE.BufferGeometry();
  brightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(brightPositions, 3));
  const brightMaterial = createRoundStarMaterial({
    skyBackground: true,
    size: 6.2,
    sizeAttenuation: false,
    vertexColors: false,
    transparent: true,
    opacity: 0.98,
    fog: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const brightStars = new THREE.Points(brightGeometry, brightMaterial);
  brightStars.name = BRIGHT_STAR_LAYER_NAME;
  brightStars.renderOrder = -1000;
  brightStars.userData.baseOpacity = brightMaterial.opacity;
  group.add(brightStars);

  appCtx.allConstellationLines = new THREE.Group();
  appCtx.allConstellationLines.visible = false;

  const normalLineMaterial = new THREE.LineBasicMaterial({
    color: 0x4488aa,
    transparent: true,
    opacity: 0.5,
    fog: false
  });

  Object.entries(appCtx.CONSTELLATION_LINES).forEach(([constellationName, lines]) => {
    lines.forEach((line) => {
      const points = [
        raDecToVector(line[0][0], line[0][1]),
        raDecToVector(line[1][0], line[1][1])
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineSegment = new THREE.Line(geometry, normalLineMaterial);
      lineSegment.userData = { constellation: constellationName };
      appCtx.allConstellationLines.add(lineSegment);
    });
  });

  group.add(appCtx.allConstellationLines);

  const gaiaSky = createGaiaSkyLayers({
    name: 'ESA Gaia DR3 planetary sky',
    radius: STARFIELD_RADIUS,
    brightName: 'Gaia DR3 supplemental bright stars',
    faintName: FAINT_STAR_LAYER_NAME,
    brightSize: 4.8,
    faintSize: 3.1,
    autoload: false
  });
  group.add(gaiaSky.group);
  group.userData.gaiaSky = gaiaSky;
  group.visible = false;
  appCtx.scene.add(group);
  return group;
}

export function ensureStarCatalogLoaded() {
  const gaiaSky = appCtx.starField?.userData?.gaiaSky;
  return typeof gaiaSky?.load === 'function' ? gaiaSky.load() : Promise.resolve(0);
}

export function alignStarFieldToLocation(lat, lng) {
  if (!appCtx.starField) return;
  setStarFieldObserverVisuals('earth');
  const date = appCtx.skyState?.computedAtIso ? new Date(appCtx.skyState.computedAtIso) : new Date();
  const latitude = lat * Math.PI / 180;
  const lst = normalizeAngle(siderealTime(toDays(date), -lng * Math.PI / 180));

  const eastX = -Math.sin(lst);
  const eastY = 0;
  const eastZ = Math.cos(lst);

  const upX = Math.cos(latitude) * Math.cos(lst);
  const upY = Math.sin(latitude);
  const upZ = Math.cos(latitude) * Math.sin(lst);

  const southX = Math.sin(latitude) * Math.cos(lst);
  const southY = -Math.cos(latitude);
  const southZ = Math.sin(latitude) * Math.sin(lst);

  _skyXAxis.set(eastX, upX, southX);
  _skyYAxis.set(eastY, upY, southY);
  _skyZAxis.set(eastZ, upZ, southZ);
  _skyMatrix.makeBasis(_skyXAxis, _skyYAxis, _skyZAxis);
  appCtx.starField.quaternion.setFromRotationMatrix(_skyMatrix);
  appCtx.starField.position.set(0, 0, 0);
  appCtx.starField.userData.observerBody = 'earth';
}

function inertialToBodyLocal(vector, options) {
  const degrees = Math.PI / 180;
  const body = _bodyVector.copy(vector);
  body.applyAxisAngle(_rotationZ, (90 + options.poleRaDeg) * degrees);
  body.applyAxisAngle(_rotationX, (90 - options.poleDecDeg) * degrees);
  body.applyAxisAngle(_rotationZ, options.primeMeridianDeg * degrees);

  const latitude = options.latitudeDeg * degrees;
  const longitude = options.longitudeDeg * degrees;
  _bodyEast.set(-Math.sin(longitude), Math.cos(longitude), 0);
  _bodyUp.set(
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude)
  );
  _bodySouth.set(
    Math.sin(latitude) * Math.cos(longitude),
    Math.sin(latitude) * Math.sin(longitude),
    -Math.cos(latitude)
  );
  return new THREE.Vector3(
    body.dot(_bodyEast),
    body.dot(_bodyUp),
    body.dot(_bodySouth)
  );
}

export function alignStarFieldToBody(options = {}) {
  if (!appCtx.starField) return null;
  const required = ['poleRaDeg', 'poleDecDeg', 'primeMeridianDeg', 'latitudeDeg', 'longitudeDeg'];
  if (!required.every((key) => Number.isFinite(Number(options[key])))) return null;
  const normalized = Object.fromEntries(required.map((key) => [key, Number(options[key])]));
  _skyXAxis.copy(inertialToBodyLocal(_inertialX, normalized));
  _skyYAxis.copy(inertialToBodyLocal(_inertialY, normalized));
  _skyZAxis.copy(inertialToBodyLocal(_inertialZ, normalized));
  _skyMatrix.makeBasis(_skyXAxis, _skyYAxis, _skyZAxis);
  appCtx.starField.quaternion.setFromRotationMatrix(_skyMatrix);
  appCtx.starField.userData.observerBody = String(options.body || 'planetary');
  setStarFieldObserverVisuals(options.body);
  return appCtx.starField.quaternion;
}

export function highlightConstellation(constellationName) {
  if (appCtx.highlightedConstellation) {
    appCtx.highlightedConstellation.parent.remove(appCtx.highlightedConstellation);
    appCtx.highlightedConstellation = null;
  }

  if (!constellationName || constellationName === "Planet") return;

  const lines = appCtx.CONSTELLATION_LINES[constellationName];
  if (!lines) return;

  const group = new THREE.Group();
  const highlightMaterial = new THREE.LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.9,
    linewidth: 3,
    fog: false
  });

  lines.forEach((line) => {
    const points = [
      raDecToVector(line[0][0], line[0][1]),
      raDecToVector(line[1][0], line[1][1])
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.Line(geometry, highlightMaterial));
  });

  appCtx.starField.add(group);
  appCtx.highlightedConstellation = group;
}

export function clearStarSelection() {
  const info = document.getElementById("starInfo");
  if (info) info.style.display = "none";

  if (appCtx.highlightedConstellation) {
    appCtx.highlightedConstellation.parent.remove(appCtx.highlightedConstellation);
    appCtx.highlightedConstellation = null;
  }

  appCtx.selectedStar = null;
}

export function showStarInfo(star) {
  let infoDiv = document.getElementById("starInfo");
  if (!infoDiv) {
    infoDiv = document.createElement("div");
    infoDiv.id = "starInfo";
    infoDiv.style.cssText = "position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.95);color:#fff;padding:20px;border-radius:12px;font-family:Inter,sans-serif;min-width:300px;box-shadow:0 8px 32px rgba(0,255,255,0.4);border:2px solid #00ffff;z-index:1000;";
    const stopPanelEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    infoDiv.addEventListener("click", stopPanelEvent);
    infoDiv.addEventListener("pointerdown", stopPanelEvent);
    document.body.appendChild(infoDiv);
  }

  const type = star.isPlanet ? "\ud83e\ude90 Planet" : "\u2b50 Star";
  const properStr = star.proper && star.proper !== star.name ? `<div style="font-size:13px;color:#888;margin-top:5px;">Designation: ${star.proper}</div>` : "";
  const magStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Apparent Magnitude: ${star.mag.toFixed(2)}</div>`;

  let distStr = "";
  if (star.dist) {
    if (star.isPlanet) {
      const distAU = star.dist * 63241;
      if (distAU < 1) {
        const distKm = distAU * 149597870.7;
        distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${distKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} km</div>`;
      } else {
        distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${distAU.toFixed(2)} AU</div>`;
      }
    } else {
      distStr = `<div style="font-size:12px;color:#aaa;margin-top:5px;">Distance: ${star.dist.toFixed(1)} light years</div>`;
    }
  }

  const constStr = star.constellation !== "Planet" ? `<div style="font-size:14px;color:#00ffff;margin-top:10px;font-weight:600;">Constellation: ${star.constellation}</div>` : "";

  infoDiv.innerHTML = `
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">${type}</div>
        <div style="font-size:24px;font-weight:700;margin:8px 0;color:#00ffff;">${star.name}</div>
        ${properStr}
        ${magStr}
        ${distStr}
        ${constStr}
        <div style="font-size:11px;color:#666;margin-top:10px;">RA: ${star.ra.toFixed(2)}h • Dec: ${star.dec.toFixed(2)}°</div>
        <button id="starInfoClose" type="button" style="margin-top:15px;background:#00ffff;color:#000;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;width:100%;font-family:Inter,sans-serif;">Close</button>
    `;

  const closeBtn = infoDiv.querySelector("#starInfoClose");
  if (closeBtn) {
    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearStarSelection();
    });
  }
  infoDiv.style.display = "block";
}

export function checkStarClick(clientX, clientY) {
  if (!appCtx.starField || !appCtx.starField.visible || !appCtx.skyRaycaster) return false;

  const mouse = new THREE.Vector2();
  mouse.x = clientX / window.innerWidth * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;

  appCtx.skyRaycaster.setFromCamera(mouse, appCtx.camera);

  const clickableStars = [];
  appCtx.starField.traverse((obj) => {
    if (obj.userData && obj.userData.isClickable) {
      clickableStars.push(obj);
    }
  });

  const intersects = appCtx.skyRaycaster.intersectObjects(clickableStars);

  if (intersects.length > 0) {
    const star = intersects[0].object.userData;
    appCtx.selectedStar = star;
    showStarInfo(star);
    highlightConstellation(star.constellation);
    return true;
  }
  if (appCtx.selectedStar) {
    clearStarSelection();
  }
  return false;
}

export function checkMoonClick(clientX, clientY, onMoonClick) {
  if (!appCtx.moonSphere || !appCtx.moonSphere.visible || appCtx.travelingToMoon || appCtx.onMoon) return false;

  const mouse = new THREE.Vector2();
  mouse.x = clientX / window.innerWidth * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;

  if (!appCtx.skyRaycaster) {
    appCtx.skyRaycaster = new THREE.Raycaster();
  }
  appCtx.skyRaycaster.setFromCamera(mouse, appCtx.camera);

  const intersects = appCtx.skyRaycaster.intersectObject(appCtx.moonSphere);
  if (intersects.length === 0) return false;

  if (typeof onMoonClick === "function") {
    onMoonClick();
  }
  return true;
}
