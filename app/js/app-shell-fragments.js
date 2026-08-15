const APP_SHELL_FRAGMENT_HTML = `
<button id="realEstateBtn" title="Toggle Real Estate">🏠</button>
<div id="propertyPanel">
  <div class="panel-header">
    <div>
      <div class="panel-title">Properties</div>
      <div style="font-size:10px;opacity:0.9;margin-top:2px" id="dataSourceLabel">Source: Demo Data</div>
    </div>
    <button class="panel-close" id="closePropertyPanelBtn">×</button>
  </div>
  <div id="propertyFiltersToggle" style="padding:12px 16px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;cursor:pointer">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <span id="propertyCount" style="font-size:11px;color:#64748b;font-weight:600">0 Properties</span>
        <span style="font-size:11px;color:#cbd5e1"> • </span>
        <span id="propertySource" style="font-size:11px;color:#64748b;font-weight:600">Demo</span>
      </div>
      <div id="filterToggleIcon" style="font-size:16px;color:#667eea">▼</div>
    </div>
  </div>
  <div id="propertyFilters" style="padding:16px;border-bottom:2px solid #e2e8f0;background:#f8fafc;display:none">
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px">Property Type</label>
      <div style="display:flex;gap:8px">
        <button id="filterAll" class="property-type-btn active" data-type="all" style="flex:1;background:#667eea;border:none;border-radius:8px;padding:8px;color:#ffffff;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s">
          All
        </button>
        <button id="filterBuy" class="property-type-btn" data-type="sale" style="flex:1;background:#e2e8f0;border:none;border-radius:8px;padding:8px;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s">
          Buy
        </button>
        <button id="filterRent" class="property-type-btn" data-type="rent" style="flex:1;background:#e2e8f0;border:none;border-radius:8px;padding:8px;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s">
          Rent
        </button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px">
        Search Radius: <span id="radiusValue">1.0 km</span>
      </label>
      <input type="range" id="radiusSlider" min="0.5" max="5" step="0.5" value="1" style="width:100%;cursor:pointer">
    </div>
    <div style="margin-bottom:12px">
      <label style="display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px">Sort By</label>
      <select id="sortSelect" style="width:100%;background:#ffffff;border:2px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px;cursor:pointer">
        <option value="distance">Nearest First</option>
        <option value="price-low">Price: Low to High</option>
        <option value="price-high">Price: High to Low</option>
        <option value="beds">Most Bedrooms</option>
        <option value="sqft">Largest Square Footage</option>
      </select>
    </div>
    <div style="display:flex;gap:8px">
      <button id="refreshProperties" style="flex:1;background:#667eea;border:none;border-radius:8px;padding:8px;color:#ffffff;font-size:11px;font-weight:600;cursor:pointer">
        🔄 Refresh
      </button>
      <button id="clearPropertyFilter" style="flex:1;background:#64748b;border:none;border-radius:8px;padding:8px;color:#ffffff;font-size:11px;font-weight:600;cursor:pointer">
        ✕ Clear Nav
      </button>
    </div>
  </div>
  <div class="panel-content" id="propertyList"></div>
</div>

<!-- Historic Sites System -->
<button id="historicBtn" title="Toggle Historic Sites" style="position:fixed;bottom:150px;right:20px;width:56px;height:56px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:50%;color:#ffffff;font-size:24px;cursor:pointer;box-shadow:0 8px 24px rgba(245,158,11,0.4);transition:all 0.2s;z-index:100;display:none">⛩️</button>
<div id="historicPanel" style="position:fixed;top:20px;right:20px;width:380px;max-height:80vh;background:rgba(255,255,255,0.98);border:none;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.2);z-index:110;display:none;overflow:hidden;backdrop-filter:blur(10px);flex-direction:column">
  <div class="panel-header" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
    <div class="panel-title">Historic Sites</div>
    <button class="panel-close" id="closeHistoricPanelBtn">×</button>
  </div>
  <div style="padding:12px 16px;background:#fef3c7;font-size:11px;color:#78350f;font-weight:600;border-bottom:2px solid #f59e0b">
    <span id="historicCount">0 Sites</span> • From OpenStreetMap
  </div>
  <div class="panel-content" id="historicList"></div>
</div>

<div id="propertyModal">
  <div class="modal-content">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle"></div>
      <button class="modal-close" id="closeModalBtn">×</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
<div id="roomPanelModal" class="room-panel-modal" aria-hidden="true">
  <section class="room-panel" role="dialog" aria-label="Multiplayer room panel">
    <div class="room-panel-head">
      <div class="room-panel-title">MULTIPLAYER ROOM</div>
      <button id="roomPanelCloseBtn" class="room-panel-close" type="button">Close</button>
    </div>
    <div class="room-panel-body">
      <div class="room-meta">
        <div id="roomPanelRoomCode" class="room-meta-code">Not in a room</div>
        <div id="roomPanelRoomName" class="room-meta-name">Create or join to start multiplayer.</div>
      </div>
      <div class="mp-row">
        <input id="roomPanelCodeInput" class="mp-input" type="text" maxlength="8" placeholder="Room code (AB12CD)">
        <button id="roomPanelJoinBtn" class="mp-btn primary" type="button">Join Room</button>
      </div>
      <div class="mpMeta">Join an existing room above, or create a new room at your current location below.</div>
      <div class="mp-row">
        <select id="roomPanelVisibilitySelect" class="mp-select" aria-label="Room visibility">
          <option value="private" selected>Private Room</option>
          <option value="public">Public Room</option>
        </select>
        <input id="roomPanelCreateNameInput" class="mp-input" type="text" maxlength="80" placeholder="Room name (optional)">
        <input id="roomPanelLocationTagInput" class="mp-input" type="text" maxlength="80" placeholder="Optional location tag (Tokyo, Paris, Moon Base)">
      </div>
      <div class="mp-row">
        <button id="roomPanelCreateBtn" class="mp-btn primary" type="button">Create Room Here</button>
        <button id="roomPanelInviteBtn" class="mp-btn secondary" type="button">Invite Link</button>
        <button id="roomPanelLeaveBtn" class="mp-btn secondary" type="button">Leave Room</button>
        <button id="roomPanelTrialBtn" class="mp-btn warn" type="button">Account / Donations</button>
      </div>
      <div class="room-player-head">
        <span>Players Live</span>
        <span id="roomPanelPlayerCount">0</span>
      </div>
      <ul id="roomPanelPlayerList" class="mp-player-list">
        <li class="mpPlayerEmpty">No active room.</li>
      </ul>
      <div class="mp-subtitle">Room Settings</div>
      <div class="mp-row">
        <input id="roomPanelNameInput" class="mp-input" type="text" maxlength="80" placeholder="Room name (optional)">
      </div>
      <div class="mp-row">
        <input id="roomPanelPaintTimeInput" class="mp-input" type="number" min="30" max="1800" step="15" value="120" placeholder="Paint round time (seconds)">
        <select id="roomPanelPaintTouchModeSelect" class="mp-select" aria-label="Paint touch mode">
          <option value="off">Touch Paint Off</option>
          <option value="roof">Touch Roof Only</option>
          <option value="any" selected>Touch Anywhere</option>
        </select>
      </div>
      <div class="mp-row">
        <label class="mp-check" for="roomPanelPaintAllowGunToggle">
          <input id="roomPanelPaintAllowGunToggle" type="checkbox" checked>
          Allow paintball gun
        </label>
        <label class="mp-check" for="roomPanelPaintAllowRoofAutoToggle">
          <input id="roomPanelPaintAllowRoofAutoToggle" type="checkbox" checked>
          Auto-paint on rooftop landings
        </label>
      </div>
      <div class="mp-row">
        <label id="roomPanelFeaturedControl" class="mp-check" for="roomPanelFeaturedToggle" hidden>
          <input id="roomPanelFeaturedToggle" type="checkbox">
          Admin featured-room approval
        </label>
        <button id="roomPanelSaveSettingsBtn" class="mp-btn secondary mpSmallBtn" type="button">Save Room</button>
      </div>

      <div class="mp-subtitle">Home Base</div>
      <div class="mp-row">
        <input id="roomHomeBaseNameInput" class="mp-input" type="text" maxlength="80" placeholder="Home base name (Moon Base Alpha)">
      </div>
      <div class="mp-row">
        <input id="roomHomeBaseDescInput" class="mp-input" type="text" maxlength="240" placeholder="Short description">
      </div>
      <div class="mp-row">
        <button id="roomHomeBaseSaveBtn" class="mp-btn secondary mpSmallBtn" type="button">Save Home Base Here</button>
      </div>
      <div id="roomHomeBaseCurrent" class="mpMeta">No home base set.</div>

      <div class="mp-subtitle">Room Games</div>
      <div class="mp-row">
        <button id="roomActivityOpenBtn" class="mp-btn secondary mpSmallBtn" type="button">Browse / Create Room Games</button>
      </div>
      <ul id="roomActivityList" class="mp-room-list mpArtifactList">
        <li class="mpRoomEmpty">Join a room to browse room games.</li>
      </ul>

      <div class="mp-subtitle">Shared Artifacts</div>
      <div class="mp-row">
        <select id="roomArtifactTypeSelect" class="mp-select" aria-label="Artifact type">
          <option value="pin">Pin</option>
          <option value="landmark">Landmark</option>
          <option value="build-area">Build Area</option>
          <option value="memory-board">Memory Board</option>
        </select>
        <input id="roomArtifactTitleInput" class="mp-input" type="text" maxlength="80" placeholder="Artifact title">
      </div>
      <div class="mp-row">
        <input id="roomArtifactTextInput" class="mp-input" type="text" maxlength="280" placeholder="Short note (optional)">
      </div>
      <div class="mp-row">
        <button id="roomArtifactCreateBtn" class="mp-btn secondary mpSmallBtn" type="button">Drop Artifact At Current Position</button>
      </div>
      <ul id="roomArtifactList" class="mp-room-list mpArtifactList">
        <li class="mpRoomEmpty">No shared artifacts yet.</li>
      </ul>
      <div id="roomPanelStatus"></div>
    </div>
  </section>
</div>
<aside id="roomChatDrawer" class="room-chat-drawer" aria-label="Room chat">
  <div class="room-chat-head">
    <span>Room Chat</span>
    <button id="roomChatCloseBtn" type="button">Close</button>
  </div>
  <div class="room-chat-body">
    <div id="roomChatMessages" class="room-chat-messages">
      <div class="mpChatEmpty">Join a room to enable chat.</div>
    </div>
    <div class="room-chat-compose">
      <input id="roomChatInput" class="mp-input" type="text" maxlength="500" placeholder="Send message (max 500 chars)">
      <button id="roomChatSendBtn" class="mp-btn primary" type="button">Send</button>
    </div>
    <div class="mpChatPolicy">Safety rules: no links, no personal contact info, and no harassment. Use Report on abusive messages.</div>
    <div id="roomChatStatus"></div>
  </div>
</aside>

<div id="debugOverlay" style="position:fixed;top:var(--debug-overlay-top,20px);left:var(--debug-overlay-left,clamp(190px,24vw,470px));background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;font-size:11px;padding:10px 14px;border-radius:8px;z-index:var(--debug-overlay-z,145);display:none;line-height:1.6;pointer-events:none;white-space:pre"></div>
<div id="perfPanel" style="position:fixed;top:var(--perf-panel-top,20px);right:var(--perf-panel-right,180px);background:rgba(2,6,23,0.85);color:#38bdf8;font-family:monospace;font-size:11px;padding:10px 12px;border-radius:8px;z-index:var(--perf-panel-z,145);display:none;line-height:1.45;white-space:pre;pointer-events:none;border:1px solid rgba(56,189,248,0.4);min-width:var(--perf-panel-min-width,260px);max-width:var(--perf-panel-max-width,320px)"></div>
<div id="loading"><div class="spinner"></div><div id="loadText">Loading...</div></div>
<div id="pauseScreen"><div class="pauseTitle">PAUSED</div><button class="pauseBtn" id="resumeBtn">Resume</button><button class="pauseBtn" id="restartBtn">Restart</button><button class="pauseBtn" id="menuBtn">Main Menu</button></div>
<div id="resultScreen"><div class="resultBox"><div id="resultTitle">Complete!</div><div id="resultStats"></div><button class="pauseBtn" id="againBtn">Play Again</button><button class="pauseBtn" id="freeBtn">Free Roam</button><button class="pauseBtn" id="resMenuBtn">Menu</button></div></div>
<div id="caughtScreen"><div class="caughtBox"><div class="caughtTitle">🚔 BUSTED!</div><div class="caughtText">You've been caught!</div><button class="caughtBtn" id="caughtBtn">Try Again</button></div></div>
`;

async function publishImmutableBuildIdentity() {
  try {
    const response = await fetch('/build-manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    const candidateId = String(manifest?.candidateId || '');
    if (!candidateId || candidateId !== String(manifest?.buildId || '')) return;
    globalThis.__WORLD_EXPLORER_BUILD__ = Object.freeze(manifest);
    const hudBox = document.querySelector('.hud-box');
    if (hudBox) {
      hudBox.dataset.buildLabel = `V${manifest.version} · ${String(manifest.commit || '').slice(0, 7)}`;
      hudBox.title = candidateId;
    }
  } catch {
    // A mutable source preview deliberately has no immutable build manifest.
  }
}

function ensureAppShellFragments() {
  if (!document.body || document.getElementById('propertyPanel')) {
    return;
  }

document.body.insertAdjacentHTML('beforeend', APP_SHELL_FRAGMENT_HTML);
publishImmutableBuildIdentity();
}

ensureAppShellFragments();
