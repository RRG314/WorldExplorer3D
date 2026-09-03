import { ctx as appCtx } from '../shared-context.js?v=55';
import { ensurePlayerBackpackInventory } from '../urban-sandbox/equipment-model.js?v=9';
import { createLocalCommerceModel } from '../urban-sandbox/commerce-model.js?v=3';
import { createHousingModel, makeHomeCandidates } from '../real-estate/housing-model.js?v=2';
import { createConnectedPropertyAuthority } from '../real-estate/connected-property-authority.js?v=2';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { getCurrentRoom } from '../multiplayer/rooms.js?v=67';
import { postActivity } from '../multiplayer/loop.js?v=56';
import { createNavigationRoute, describeDestinationEntrySupport, getNavigationTargetForDestination } from './navigation-ui.js?v=1';
import { escapeHtml, sanitizeHttpUrl } from './ui-utils.js?v=1';

let activeView = 'home';
let housing = null;
let connectedAuthority = null;
let connectedAuthorityKey = '';
let marketProperties = [];
let marketLoaded = false;
let marketLoading = false;
let propertyEventsBound = false;
let nearbyVisibleLimit = 24;
const PROPERTY_INTERACTION_RADIUS = 55;

function actorPosition() {
  if (appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker) return appCtx.Walk.state.walker;
  if (appCtx.droneMode && appCtx.drone) return appCtx.drone;
  return appCtx.car || { x: 0, z: 0 };
}

function propertyDistance(property) {
  const actor = actorPosition();
  return Math.hypot(Number(actor?.x || 0) - Number(property?.x || 0), Number(actor?.z || 0) - Number(property?.z || 0));
}

function requirePropertyVisit(property, action) {
  if (!property || !['buy', 'sell-world', 'list-sale', 'list-rent', 'rent', 'cancel-listing'].includes(action)) return true;
  if (property.locationId && property.locationId !== runtimeLocation().id) {
    setStatus(`Return to ${property.locationLabel || 'that location'} before changing this property.`, 'error');
    return false;
  }
  const meters = propertyDistance(property);
  if (meters <= PROPERTY_INTERACTION_RADIUS) return true;
  navigateToProperty(property.id);
  setStatus(`Route set. Go to ${property.label} before completing this action.`, 'error');
  return false;
}

function runtimeLocation() {
  const lat = Number(appCtx.LOC?.lat || 0);
  const lon = Number(appCtx.LOC?.lon || 0);
  const label = appCtx.selLoc === 'custom'
    ? String(appCtx.customLoc?.name || 'Custom location')
    : String(appCtx.LOCS?.[appCtx.selLoc]?.name || appCtx.LOC?.name || 'Current location');
  return { id: `${String(appCtx.selLoc || 'custom')}:${lat.toFixed(4)}:${lon.toFixed(4)}`, label, lat, lon };
}

function worldToGeo(x, z) {
  const baseLat = Number(appCtx.LOC?.lat || 0);
  const baseLon = Number(appCtx.LOC?.lon || 0);
  const scale = Number(appCtx.SCALE || 100000);
  const cosLat = Math.cos(baseLat * Math.PI / 180) || 1;
  return { lat: baseLat - Number(z || 0) / scale, lon: baseLon + Number(x || 0) / (scale * cosLat) };
}

function ensureHousing() {
  const inventory = ensurePlayerBackpackInventory(appCtx);
  const economy = appCtx.worldEconomy || appCtx.localConvenienceStoreCommerce || createLocalCommerceModel({ inventory });
  appCtx.worldEconomy = economy;
  appCtx.localConvenienceStoreCommerce = economy;
  if (!housing) {
    housing = createHousingModel({
      economy,
      inventory,
      getActorPosition: actorPosition,
      getActiveLocationId: () => runtimeLocation().id,
      storageAccessRadius: 45,
      saveInventory: () => appCtx.playerBackpackStore?.save?.(inventory.exportState?.())
    });
    appCtx.explorerHousing = housing;
  }
  return housing;
}

function ensureAuthority() {
  const room = getCurrentRoom();
  const location = runtimeLocation();
  const user = getCurrentUser();
  const worldSeed = String(room?.world?.seed || `${location.id}:${location.lat.toFixed(5)}:${location.lon.toFixed(5)}`);
  const key = `${user?.uid || 'guest'}:${room?.code || room?.id || 'world'}:${worldSeed}:${location.id}`;
  if (key !== connectedAuthorityKey) {
    connectedAuthority?.dispose?.();
    connectedAuthority = createConnectedPropertyAuthority({
      room,
      locationId: location.id,
      worldSeed,
      getActorPosition: actorPosition,
      onChange: () => appCtx.PropertyUI.panel?.classList.contains('show') && updatePropertyPanel(),
      onError: () => setStatus('Property information could not refresh. Try again in a moment.', 'error')
    });
    connectedAuthorityKey = key;
  }
  return connectedAuthority || ensureHousing();
}

function currentCandidates() {
  const location = runtimeLocation();
  return makeHomeCandidates(appCtx.buildings, {
    actor: actorPosition(), locationId: location.id, locationLabel: location.label, worldToGeo,
    radius: Math.max(750, Number(appCtx.propertyRadius || 1) * 1000), limit: 160
  });
}

function snapshot() {
  const view = ensureAuthority().snapshot(appCtx.properties || []);
  return Object.freeze({ ...view, authRequired: !getCurrentUser() });
}

function credits(value) {
  return `${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()} credits`;
}

function distance(value) {
  const meters = Math.max(0, Number(value) || 0);
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function setStatus(message, tone = '') {
  const status = document.getElementById('propertyHubStatus');
  if (!status) return;
  status.textContent = String(message || '');
  status.dataset.tone = tone;
}

function updateHeader(view = snapshot()) {
  const balance = document.getElementById('propertyWalletBalance');
  if (balance) balance.textContent = view.authRequired
    ? '—'
    : Math.max(0, Number(view.credits) || 0).toLocaleString();
  document.querySelectorAll('[data-property-view]').forEach((button) => {
    const buttonView = button.dataset.propertyView;
    const selected = button.closest('.propertyHubTabs')
      ? (buttonView === 'home' && ['home', 'storage', 'offers'].includes(activeView)) ||
        (buttonView === 'nearby' && ['nearby', 'market'].includes(activeView))
      : buttonView === activeView;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function homeSummaryCard(home, view, options = {}) {
  const primary = view.primaryHomeId === home.id;
  const used = (home.storage || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const samePlace = home.locationId === runtimeLocation().id;
  const ownedByMe = view.shared ? home.owned === true : true;
  const rental = view.shared && home.rentedByMe === true && !ownedByMe;
  const isListed = ['listed_for_sale', 'listed_for_rent'].includes(home.status);
  const connectedActions = isListed
    ? `<button type="button" data-property-action="cancel-listing" data-property-id="${escapeHtml(home.id)}">Cancel Listing</button>`
    : `<button type="button" data-property-action="list-sale" data-property-id="${escapeHtml(home.id)}">List for Sale</button><button type="button" data-property-action="list-rent" data-property-id="${escapeHtml(home.id)}">Offer 7-Day Rent</button><button type="button" class="danger" data-property-action="sell-world" data-property-id="${escapeHtml(home.id)}">Sell Back</button>`;
  return `<article class="propertyHomeCard${primary ? ' primary' : ''}">
    <div class="propertyHomeVisual" aria-hidden="true"><span>⌂</span><small>${escapeHtml(home.kind)}</small></div>
    <div class="propertyHomeInfo"><span class="propertyHomeKicker">${rental ? 'RENTED HOME' : primary ? 'PRIMARY HOME' : 'OWNED HOME'}</span><strong>${escapeHtml(home.label)}</strong>
      <small>${escapeHtml(home.address?.formatted || home.locationLabel)} · ${Math.round(home.area).toLocaleString()} m² footprint · ${home.levels} level${home.levels === 1 ? '' : 's'}</small><small>${view.shared ? rental ? `Rented from ${escapeHtml(home.ownerName || 'another explorer')}` : `Owned by ${escapeHtml(home.ownerName || 'you')}` : `${used}/${home.storageCapacity} storage spaces used`}</small></div>
    <div class="propertyCardActions">${samePlace ? `<button type="button" data-property-action="navigate" data-property-id="${escapeHtml(home.id)}">Set Route</button>` : `<span class="propertyPlaceNote">Return to ${escapeHtml(home.locationLabel)} to set a route</span>`}
      ${primary || view.shared ? '' : `<button type="button" data-property-action="primary" data-property-id="${escapeHtml(home.id)}">Make Primary</button>`}
      ${options.allowSell && ownedByMe ? (view.shared ? connectedActions : `<button type="button" class="danger" data-property-action="sell" data-property-id="${escapeHtml(home.id)}">Sell · ${credits(Math.floor(Math.min(home.purchasePrice, home.currentValue) * .85))}</button>`) : ''}</div>
  </article>`;
}

function renderHome(view) {
  if (!view.homes.length) {
    return `<section class="propertyEmptyState"><span class="propertyEmptyIcon">⌂</span><h3>Choose your first home</h3>
      <p>A home gives you a saved place and, as the feature expands, a place for finds from Earth, the ocean, and space.</p><button type="button" data-property-view="nearby">See Properties Nearby</button></section>
      ${view.authRequired ? '<section class="propertyHowItWorks"><strong>Sign in when you are ready to choose</strong><p>You can explore and compare buildings as a guest. A free account keeps ownership, Credits, storage, and shared play connected wherever you return.</p><button type="button" data-property-action="sign-in">Sign In or Create an Account</button></section>' : ''}
      <section class="propertyHowItWorks"><strong>One connected economy</strong><p>Explorer Credits earned from field finds, trade, travel, and missions can be used here. Items stay in the same Backpack until you move them into home storage.</p></section>`;
  }
  const openOffers = (view.incomingTrades || []).filter((offer) => offer.status === 'pending' && offer.expiresAtMs > Date.now()).length;
  return `<section class="propertySectionIntro"><span>${view.shared ? 'CONNECTED WORLD' : 'MY PLACES'}</span><strong>${view.homes.length} propert${view.homes.length === 1 ? 'y' : 'ies'} ${view.shared ? 'owned or rented' : 'owned'}</strong><p>${view.shared ? 'Your ownership, listings, rentals, and Credits follow your account across the world and every room.' : 'Your primary home is shown first for routes and storage.'}</p></section>
    <div class="propertyHubShortcuts"><button type="button" data-property-view="storage">Home Storage</button><button type="button" data-property-view="offers">${openOffers ? `${openOffers} New ` : ''}Property Offers</button></div>
    ${view.homes.map((home) => homeSummaryCard(home, view, { allowSell: true })).join('')}<button class="propertyWideAction" type="button" data-property-view="nearby">Find another property</button>`;
}

export function createPropertyCard(property, suppliedView = null) {
  const view = suppliedView || snapshot();
  const owned = property.owned || view.homes.some((home) => home.id === property.id && !property.rentedByMe);
  const mineAsTenant = property.rentedByMe === true;
  const occupied = !!property.ownerUid && !owned;
  const tradeableHomes = view.shared ? view.homes.filter((home) => home.owned === true && home.status === 'owned' && home.id !== property.id) : [];
  const statusLabel = owned ? 'OWNED BY YOU' : mineAsTenant ? 'RENTED BY YOU' : property.status === 'listed_for_sale' ? `FOR SALE BY ${property.ownerName || 'EXPLORER'}` : property.status === 'listed_for_rent' ? `FOR RENT BY ${property.ownerName || 'EXPLORER'}` : occupied ? `OWNED BY ${property.ownerName || 'EXPLORER'}` : `${distance(property.distance)} AWAY`;
  let transactionAction = '';
  if (view.shared && property.status === 'listed_for_sale' && !owned) transactionAction = `<button type="button" class="buy" data-property-action="buy" data-property-id="${escapeHtml(property.id)}">Buy · ${credits(property.salePrice)}</button>`;
  else if (view.shared && property.status === 'listed_for_rent' && !owned) transactionAction = `<button type="button" class="buy" data-property-action="rent" data-property-id="${escapeHtml(property.id)}">Rent ${property.rentTermDays} Days · ${credits(property.rentPrice)}</button>`;
  else if (view.shared && owned && ['listed_for_sale', 'listed_for_rent'].includes(property.status)) transactionAction = `<button type="button" data-property-action="cancel-listing" data-property-id="${escapeHtml(property.id)}">Cancel Listing</button>`;
  else if (view.authRequired) transactionAction = '<button type="button" data-property-action="sign-in">Sign In to Choose This Property</button>';
  else if (!occupied && !mineAsTenant && !owned && (!view.shared || property.sharedEligible)) transactionAction = `<button type="button" class="buy" data-property-action="buy" data-property-id="${escapeHtml(property.id)}">${view.shared && view.starterAvailable ? 'Claim as Free First Property' : 'Buy Property'}</button>`;
  else if (view.shared && !property.sharedEligible) transactionAction = '<span class="propertyPlaceNote">This building needs a stable map identity before it can be owned online.</span>';
  else if (view.shared && occupied && property.status === 'owned' && tradeableHomes.length) transactionAction = `<label class="propertyTradeChoice"><span>Offer one of your properties</span><select data-trade-offer-for="${escapeHtml(property.id)}">${tradeableHomes.map((home) => `<option value="${escapeHtml(home.id)}">${escapeHtml(home.label)}</option>`).join('')}</select></label><button type="button" data-property-action="propose-trade" data-property-id="${escapeHtml(property.id)}">Offer Trade</button>`;
  return `<article class="propertyHomeCard candidate${owned ? ' owned' : ''}">
    <div class="propertyHomeVisual" aria-hidden="true"><span>⌂</span><small>${escapeHtml(property.kind)}</small></div>
    <div class="propertyHomeInfo"><span class="propertyHomeKicker">${escapeHtml(statusLabel)}</span><strong>${escapeHtml(property.label)}</strong>
      ${property.address?.formatted ? `<small>${escapeHtml(property.address.formatted)}</small>` : ''}<small>${Math.round(property.area).toLocaleString()} m² footprint · ${property.levels} level${property.levels === 1 ? '' : 's'}</small><small>${property.storageCapacity} storage spaces · ${escapeHtml(describeDestinationEntrySupport(property))}</small><b>${credits(property.price)}</b></div>
    <div class="propertyCardActions"><button type="button" data-property-action="navigate" data-property-id="${escapeHtml(property.id)}">Set Route</button><button type="button" data-property-action="details" data-property-id="${escapeHtml(property.id)}">Details</button>
      ${transactionAction}</div>
  </article>`;
}

function renderNearby(view) {
  const mappedCandidates = view.candidates.filter((property) => property.sharedEligible === true);
  if (!mappedCandidates.length) return `<section class="propertyEmptyState"><span class="propertyEmptyIcon">⌖</span><h3>No mapped properties are ready nearby</h3><p>Move into an area with loaded map buildings, then refresh. Scenery, roads, bridges, and other world structures are never offered as property.</p><button type="button" data-property-action="refresh">Refresh Nearby Properties</button></section>`;
  const starter = view.authRequired
    ? '<div class="propertyStarterNotice"><strong>Explore first, then sign in to choose</strong><span>Guests can compare mapped buildings and set routes. An account is required to claim, buy, rent, sell, trade, store items, or join shared play.</span><button type="button" data-property-action="sign-in">Sign In or Create an Account</button></div>'
    : view.shared && view.starterAvailable ? '<div class="propertyStarterNotice"><strong>Your first property is free</strong><span>You can choose any available mapped building in the world. The free deed can only be used once, so explore before you decide.</span></div>' : '';
  const visible = mappedCandidates.slice(0, nearbyVisibleLimit);
  const remaining = Math.max(0, mappedCandidates.length - visible.length);
  return `${starter}<section class="propertySectionIntro"><span>PROPERTIES NEARBY</span><strong>${mappedCandidates.length} mapped propert${mappedCandidates.length === 1 ? 'y' : 'ies'} found</strong><p>Showing the closest ${visible.length}. Set a route to walk or drive to the actual building.</p></section>${visible.map((property) => createPropertyCard(property, view)).join('')}${remaining ? `<button class="propertyWideAction" type="button" data-property-action="show-more-nearby">Show ${Math.min(24, remaining)} More</button>` : ''}<div class="propertyHubSupportingLink"><button type="button" data-property-view="market">Connected Property Data</button><span>Optional reference records; game ownership and prices stay separate.</span></div>`;
}

function storageItem(item, homeId, carried = false) {
  const action = carried ? 'store' : 'withdraw';
  return `<article class="propertyStorageItem"><span>${escapeHtml(item.icon || 'ITEM')}</span><div><strong>${escapeHtml(item.label || item.catalogId)}</strong><small>${Math.max(1, Number(item.quantity) || 1)} available</small></div><button type="button" data-property-action="${action}" data-property-id="${escapeHtml(homeId)}" data-item-id="${escapeHtml(item.instanceId)}">${carried ? 'Store one' : 'Take one'}</button></article>`;
}

function renderStorage(view) {
  const home = view.primaryHome || view.homes[0];
  if (!home) return `<section class="propertyEmptyState"><span class="propertyEmptyIcon">▣</span><h3>Home storage needs a home</h3><p>Choose a nearby property first. Connected home storage will open after account-backed Backpack transfers are ready.</p><button type="button" data-property-view="nearby">See Properties Nearby</button></section>`;
  if (view.shared) return `<section class="propertyEmptyState"><span class="propertyEmptyIcon">▣</span><h3>Home storage is being connected</h3><p>Your Backpack remains available, but moving items into a connected home will open only when every transfer can be saved safely to your account.</p><button type="button" data-property-view="home">Back to My Properties</button></section>`;
  const carried = appCtx.playerBackpackInventory?.snapshot?.().items?.filter((item) => item.catalogId !== 'hands' && item.equipped !== true) || [];
  const used = home.storage.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  if (!home.storageAccessible) {
    const samePlace = home.locationId === runtimeLocation().id;
    return `<section class="propertyEmptyState"><span class="propertyEmptyIcon">⌂</span><h3>Storage is at your home</h3><p>${samePlace ? `${escapeHtml(home.label)} is ${distance(home.distance)} away. Set a route and go there to move items.` : `Return to ${escapeHtml(home.locationLabel)} to use storage at ${escapeHtml(home.label)}.`}</p>${samePlace ? `<button type="button" data-property-action="navigate" data-property-id="${escapeHtml(home.id)}">Set Route Home</button>` : ''}</section>`;
  }
  return `<button class="propertyBackAction" type="button" data-property-view="home">← My Properties</button><section class="propertySectionIntro"><span>HOME STORAGE</span><strong>${escapeHtml(home.label)}</strong><p>${used} of ${home.storageCapacity} spaces used. Equip a different item before storing the one in your hands.</p></section>
    <div class="propertyStorageColumns"><section><h3>At Home</h3>${home.storage.length ? home.storage.map((item) => storageItem(item, home.id, false)).join('') : '<p class="propertyMuted">Nothing stored here yet.</p>'}</section>
    <section><h3>In Your Backpack</h3>${carried.length ? carried.map((item) => storageItem(item, home.id, true)).join('') : '<p class="propertyMuted">No available Backpack items.</p>'}</section></div>`;
}

function tradeOfferCard(offer, direction) {
  const pending = offer.status === 'pending' && offer.expiresAtMs > Date.now();
  const otherName = direction === 'incoming' ? offer.proposerName : offer.recipientName;
  const sentence = direction === 'incoming'
    ? `${escapeHtml(otherName || 'An explorer')} offers <strong>${escapeHtml(offer.offeredPropertyLabel)}</strong> for your <strong>${escapeHtml(offer.requestedPropertyLabel)}</strong>.`
    : `You offered <strong>${escapeHtml(offer.offeredPropertyLabel)}</strong> for ${escapeHtml(otherName || 'another explorer')}\u2019s <strong>${escapeHtml(offer.requestedPropertyLabel)}</strong>.`;
  const creditLine = offer.creditOffer > 0 ? `<small>${direction === 'incoming' ? 'Their offer includes' : 'Your offer includes'} ${credits(offer.creditOffer)}.</small>` : '';
  const actions = !pending ? '' : direction === 'incoming'
    ? `<button type="button" class="buy" data-property-action="accept-trade" data-offer-id="${escapeHtml(offer.offerId)}">Accept Trade</button><button type="button" data-property-action="decline-trade" data-offer-id="${escapeHtml(offer.offerId)}">Decline</button>`
    : `<button type="button" data-property-action="cancel-trade" data-offer-id="${escapeHtml(offer.offerId)}">Cancel Offer</button>`;
  const status = pending ? 'AWAITING REPLY' : offer.status === 'accepted' ? 'TRADE COMPLETE' : offer.status === 'declined' ? 'DECLINED' : offer.status === 'cancelled' ? 'CANCELLED' : 'EXPIRED';
  return `<article class="propertyHomeCard candidate"><div class="propertyHomeVisual" aria-hidden="true"><span>\u21c4</span><small>TRADE</small></div><div class="propertyHomeInfo"><span class="propertyHomeKicker">${status}</span><p>${sentence}</p>${creditLine}</div><div class="propertyCardActions">${actions}</div></article>`;
}

function renderOffers(view) {
  const back = '<button class="propertyBackAction" type="button" data-property-view="home">← My Properties</button>';
  if (view.authRequired) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">\u21c4</span><h3>Property offers follow your account</h3><p>Sign in to send, receive, accept, or decline property trades.</p><button type="button" data-property-action="sign-in">Sign In or Create an Account</button></section>`;
  if (!view.shared) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">\u21c4</span><h3>Trade offers are unavailable offline</h3><p>Reconnect to view property offers saved to your account.</p></section>`;
  const incoming = view.incomingTrades || [];
  const outgoing = view.outgoingTrades || [];
  if (!incoming.length && !outgoing.length) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">\u21c4</span><h3>No property offers yet</h3><p>When another explorer owns a nearby property, choose one of your properties and send a trade offer from Find a Property.</p><button type="button" data-property-view="nearby">Find a Property</button></section>`;
  return `${back}${incoming.length ? `<section class="propertySectionIntro"><span>OFFERS FOR YOU</span><strong>${incoming.length} received</strong><p>Ownership changes only after you accept an open offer.</p></section>${incoming.map((offer) => tradeOfferCard(offer, 'incoming')).join('')}` : ''}${outgoing.length ? `<section class="propertySectionIntro"><span>OFFERS YOU SENT</span><strong>${outgoing.length} sent</strong><p>You can cancel an open offer before it is accepted.</p></section>${outgoing.map((offer) => tradeOfferCard(offer, 'outgoing')).join('')}` : ''}`;
}

function marketCard(property) {
  const photo = sanitizeHttpUrl(property.primaryPhoto);
  const sourceUrl = sanitizeHttpUrl(property.sourceUrl);
  return `<article class="propertyMarketCard">${photo ? `<img src="${escapeHtml(photo)}" alt="" referrerpolicy="no-referrer">` : '<div class="propertyMarketPlaceholder">PROPERTY DATA</div>'}
    <span>${escapeHtml(String(property.source || 'connected data').toUpperCase())}</span><strong>${escapeHtml(property.address || 'Address unavailable')}</strong><small>${escapeHtml([property.city, property.state].filter(Boolean).join(', '))}</small>
    <b>${Number(property.price || 0) > 0 ? `$${Math.round(Number(property.price)).toLocaleString()}${property.priceType === 'rent' ? '/month' : ''}` : 'Value unavailable'}</b>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open provider listing</a>` : ''}</article>`;
}

function renderMarket() {
  const back = '<button class="propertyBackAction" type="button" data-property-view="nearby">← Find a Property</button>';
  const connected = !!(appCtx.apiConfig?.attom || appCtx.apiConfig?.rentcast);
  if (marketLoading) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">…</span><h3>Loading connected property data</h3><p>This does not change the in-game home price.</p></section>`;
  if (!connected) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">↗</span><h3>Optional property data</h3><p>You can connect a supported property-data account from Main Menu → Settings. Connected records are reference information only; they never set in-game prices or ownership.</p><button type="button" data-property-action="main-menu-settings">Open Main Menu</button></section>`;
  if (!marketLoaded) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">⌕</span><h3>Connected property data is ready</h3><p>Load records near your current location. Your provider key stays in this browser.</p><button type="button" data-property-action="load-market">Load Property Data</button></section>`;
  if (!marketProperties.length) return `${back}<section class="propertyEmptyState"><span class="propertyEmptyIcon">⌕</span><h3>No connected records found</h3><p>The provider did not return a record for this area. Nearby in-game homes still come from the buildings in the world.</p><button type="button" data-property-action="load-market">Try Again</button></section>`;
  return `${back}<section class="propertySectionIntro"><span>CONNECTED PROPERTY DATA</span><strong>${marketProperties.length} nearby record${marketProperties.length === 1 ? '' : 's'}</strong><p>Reference data only. In-game homes and prices remain separate.</p></section>${marketProperties.map(marketCard).join('')}`;
}

export function updatePropertyPanel() {
  if (!appCtx.PropertyUI.list) return;
  const view = snapshot();
  updateHeader(view);
  if (activeView === 'nearby') appCtx.PropertyUI.list.innerHTML = renderNearby(view);
  else if (activeView === 'storage') appCtx.PropertyUI.list.innerHTML = renderStorage(view);
  else if (activeView === 'offers') appCtx.PropertyUI.list.innerHTML = renderOffers(view);
  else if (activeView === 'market') appCtx.PropertyUI.list.innerHTML = renderMarket();
  else appCtx.PropertyUI.list.innerHTML = renderHome(view);
  appCtx.PropertyUI.panel?.classList.add('show');
}

function propertyById(id) {
  const view = snapshot();
  return view.candidates.find((entry) => entry.id === id) || view.homes.find((entry) => entry.id === id) || null;
}

export function openModalById(id) {
  const property = propertyById(id);
  if (!property || !appCtx.PropertyUI.modal) return;
  const view = snapshot();
  const owned = view.homes.find((home) => home.id === property.id);
  appCtx.PropertyUI.modalTitle.textContent = property.label || 'Home';
  appCtx.PropertyUI.modalBody.innerHTML = `<section class="propertyModalHome"><span class="propertyHomeKicker">${owned ? 'OWNED HOME' : 'AVAILABLE HOME'}</span><h3>${escapeHtml(property.kind || 'Home')}</h3>
    <p>This home is attached to a building in the current world. Route guidance leads to that building${describeDestinationEntrySupport(property) === 'Exterior only' ? '; a furnished interior is not available here yet' : ' and its supported entrance'}.</p>
    <dl><div><dt>Game price</dt><dd>${credits(property.price || property.purchasePrice)}</dd></div><div><dt>Footprint</dt><dd>${Math.round(property.area).toLocaleString()} m²</dd></div><div><dt>Levels</dt><dd>${property.levels}</dd></div><div><dt>Storage</dt><dd>${property.storageCapacity} spaces</dd></div></dl>
    <div class="propertyCardActions"><button type="button" data-property-action="navigate" data-property-id="${escapeHtml(property.id)}">Set Route</button>${owned ? '' : view.authRequired ? '<button type="button" data-property-action="sign-in">Sign In to Choose This Property</button>' : `<button type="button" class="buy" data-property-action="buy" data-property-id="${escapeHtml(property.id)}">${view.shared && view.starterAvailable ? 'Claim as Free First Property' : 'Buy Property'}</button>`}</div></section>`;
  appCtx.PropertyUI.modal.classList.add('show');
}

export function closeModal() { appCtx.PropertyUI.modal?.classList.remove('show'); }
export function closePropertyPanel() { appCtx.PropertyUI.panel?.classList.remove('show'); }
export function togglePropertyFilters() { activeView = activeView === 'nearby' ? 'home' : 'nearby'; updatePropertyPanel(); }

export function toggleRealEstate(force) {
  const shouldOpen = typeof force === 'boolean' ? force : !appCtx.realEstateMode;
  appCtx.realEstateMode = shouldOpen;
  appCtx.PropertyUI.button?.classList.toggle('active', shouldOpen);
  if (shouldOpen) loadPropertiesAtCurrentLocation();
  else { closePropertyPanel(); closeModal(); clearPropertyMarkers(); }
}

export async function loadPropertiesAtCurrentLocation() {
  ensureHousing();
  nearbyVisibleLimit = 24;
  appCtx.properties = [...currentCandidates()];
  updatePropertyPanel();
  renderPropertyMarkers();
  bindPropertyEvents();
  return appCtx.properties;
}

if (appCtx.developerDiagnosticsEnabled) {
  globalThis.__WE3D_PROPERTY_SUPPORT__ = Object.freeze({
    async stageMappedFixture(sourceBuildingId = 'osm:way:424242') {
      appCtx.selLoc = 'baltimore';
      appCtx.LOC = { lat: 39.2904, lon: -76.6122, name: 'Baltimore' };
      appCtx.LOCS = { ...(appCtx.LOCS || {}), baltimore: { name: 'Baltimore', lat: 39.2904, lon: -76.6122 } };
      appCtx.car ||= { x: 0, y: 0, z: 0, position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
      appCtx.buildings = [{
        sourceBuildingId: String(sourceBuildingId), buildingType: 'house', levels: 2, baseY: 0,
        pts: [{ x: -8, z: -8 }, { x: 8, z: -8 }, { x: 8, z: 8 }, { x: -8, z: 8 }]
      }];
      document.getElementById('globeSelectorScreen')?.classList.remove('show');
      appCtx.realEstateMode = true;
      activeView = 'nearby';
      const properties = await loadPropertiesAtCurrentLocation();
      const property = properties.find((entry) => entry.sharedEligible && entry.sourceBuildingId === String(sourceBuildingId));
      if (!property) return null;
      const actor = actorPosition();
      actor.position?.set?.(property.x, Number(actor.position?.y || property.y || 0), property.z);
      actor.x = property.x;
      actor.z = property.z;
      updatePropertyPanel();
      return { ...property };
    },
    refresh: () => updatePropertyPanel(),
    snapshot: () => snapshot()
  });
}

export function renderPropertyMarkers() {
  clearPropertyMarkers();
  if (!globalThis.THREE || !appCtx.scene) return;
  const ownedIds = new Set(snapshot().homes.map((home) => home.id));
  (appCtx.properties || []).slice(0, 18).forEach((property) => {
    const owned = ownedIds.has(property.id);
    const color = owned ? 0x22c55e : 0x67e8f9;
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(.55, .8, .18, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, transparent: true, opacity: .9 }));
    marker.position.set(property.x, property.y + .12, property.z);
    marker.userData.propertyId = property.id;
    marker.userData.isPropertyMarker = true;
    appCtx.scene.add(marker);
    appCtx.propMarkers.push(marker);
  });
}

export function clearPropertyMarkers() {
  (appCtx.propMarkers || []).forEach((marker) => {
    appCtx.scene?.remove?.(marker); marker.geometry?.dispose?.();
    if (Array.isArray(marker.material)) marker.material.forEach((material) => material.dispose?.()); else marker.material?.dispose?.();
  });
  appCtx.propMarkers = [];
}

export function navigateToProperty(propertyId) {
  const property = propertyById(propertyId);
  if (!property) return false;
  if (property.locationId && property.locationId !== runtimeLocation().id) {
    setStatus(`Return to ${property.locationLabel || 'that location'} before setting this route.`, 'error');
    return false;
  }
  appCtx.selectedProperty = property;
  appCtx.showNavigation = true;
  const actor = actorPosition();
  const target = getNavigationTargetForDestination(property);
  createNavigationRoute(Number(actor.x || 0), Number(actor.z || 0), target.x, target.z, true);
  setStatus(`Route set to ${property.label}.`, 'ok');
  closeModal(); updatePropertyPanel();
  return true;
}

async function recordPropertyProgress(result, action) {
  if (!result?.home) return;
  const home = result.home;
  if (typeof appCtx.recordExplorerEvent === 'function') {
    await appCtx.recordExplorerEvent({
      eventId: `event:property:${action}:${home.id}:${action === 'bought' ? home.purchasedAt : Date.now()}`,
      eventType: action === 'bought' ? 'home-purchased' : 'home-sold', sourceSystem: 'home-and-property', sourceId: home.id, pathId: 'creation',
      name: action === 'bought' ? `Bought ${home.label}` : `Sold ${home.label}`,
      detail: action === 'bought' ? 'Added a saved place with home storage.' : 'Completed a home sale.', projections: { journal: true, profile: true, place: true }
    });
  }
  void postActivity('home-base-updated', { city: runtimeLocation().label, text: action === 'bought' ? `Bought a home in ${runtimeLocation().label}` : `Sold a home in ${runtimeLocation().label}` }).catch(() => {});
}

function reasonMessage(reason) {
  return ({ starter_already_used: 'Your free first-property deed has already been used.', already_owned: 'Another explorer already owns this property.', not_owner: 'Only the owner can change this property.', own_listing: 'You cannot buy or rent your own listing.', not_for_sale: 'This property is no longer for sale.', not_for_rent: 'This property is no longer for rent.', not_listed: 'This property is not listed.', lease_active: 'This property has an active rental.', not_enough_credits: 'You need more Explorer Credits for this property.', storage_not_empty: 'Move everything out of this home before selling it.', storage_full: 'This home is out of storage space.', item_equipped: 'Equip something else before storing that item.', item_unavailable: 'That item is no longer available.', not_owned: 'This home is not in your portfolio.', home_too_far: 'Go to your home before moving items in or out of storage.', home_in_another_place: 'Return to that home’s location before using its storage.', save_failed: 'The change could not be saved on this device.', wallet_unavailable: 'Explorer Credits are unavailable right now.', offered_property_unavailable: 'The property you offered is no longer available to trade.', requested_property_unavailable: 'The requested property is no longer available to trade.', property_not_tradeable: 'One of these properties is currently listed, rented, or otherwise unavailable.', trade_offer_unavailable: 'This trade offer is no longer available.', trade_offer_closed: 'This trade offer has already been closed.', trade_offer_expired: 'This trade offer has expired.', trade_ownership_changed: 'Ownership changed before the trade could be completed.', offer_funds_unavailable: 'The offered Explorer Credits are no longer available.' })[reason] || 'That action could not be completed.';
}

async function loadConnectedMarket() {
  if (marketLoading) return;
  marketLoading = true; activeView = 'market'; updatePropertyPanel();
  const actor = actorPosition(); const geo = worldToGeo(actor.x, actor.z);
  try {
    marketProperties = await appCtx.PropertyAPI.fetchConnectedProperties(geo.lat, geo.lon, 1);
    marketLoaded = true; setStatus(marketProperties.length ? 'Connected property data loaded.' : 'No connected records were returned.', marketProperties.length ? 'ok' : '');
  } catch (_) {
    marketProperties = []; marketLoaded = true; setStatus('Connected property data could not be loaded.', 'error');
  } finally { marketLoading = false; updatePropertyPanel(); }
}

async function handlePropertyAction(button) {
  const action = button.dataset.propertyAction;
  const propertyId = button.dataset.propertyId || '';
  const offerId = button.dataset.offerId || '';
  const itemId = button.dataset.itemId || '';
  if (action === 'navigate') return navigateToProperty(propertyId);
  if (action === 'details') return openModalById(propertyId);
  if (action === 'refresh') return loadPropertiesAtCurrentLocation();
  if (action === 'show-more-nearby') { nearbyVisibleLimit += 24; updatePropertyPanel(); return true; }
  if (action === 'load-market') return loadConnectedMarket();
  if (action === 'main-menu-settings') { document.getElementById('mainMenuBtn')?.click?.(); setTimeout(() => document.querySelector('[data-tab="settings"]')?.click?.(), 120); return true; }
  if (action === 'sign-in') {
    document.getElementById('mainMenuBtn')?.click?.();
    setTimeout(() => document.getElementById('appSignInBtn')?.click?.(), 180);
    return true;
  }
  if (!getCurrentUser() && ['buy', 'sell', 'sell-world', 'list-sale', 'list-rent', 'rent', 'cancel-listing', 'primary', 'store', 'withdraw', 'propose-trade', 'accept-trade', 'decline-trade', 'cancel-trade'].includes(action)) {
    setStatus('Sign in to save property, Credits, storage, and shared play to your account.', 'error');
    return false;
  }
  const model = ensureAuthority();
  const shared = model === connectedAuthority;
  const selectedProperty = propertyId ? propertyById(propertyId) : null;
  if (shared && !requirePropertyVisit(selectedProperty, action)) return false;
  let result = null;
  if (action === 'buy') result = await model.buy(selectedProperty);
  else if (action === 'sell') result = model.sell(propertyId);
  else if (action === 'sell-world') result = await model.sellWorld(selectedProperty);
  else if (action === 'list-sale') {
    const property = selectedProperty;
    result = await model.listSale(property, property.baseValue || property.price);
  } else if (action === 'list-rent') {
    const property = selectedProperty;
    result = await model.listRent(property, Math.max(1, Math.ceil((property.baseValue || property.price) * .05)), 7);
  } else if (action === 'rent') result = await model.rent(selectedProperty);
  else if (action === 'cancel-listing') result = await model.cancelListing(selectedProperty);
  else if (action === 'propose-trade') {
    const offeredId = button.closest('.propertyHomeCard')?.querySelector('[data-trade-offer-for]')?.value || '';
    result = await model.proposeTrade(propertyById(offeredId), propertyById(propertyId), 0);
  } else if (action === 'accept-trade') result = await model.acceptTrade(offerId);
  else if (action === 'decline-trade') result = await model.declineTrade(offerId);
  else if (action === 'cancel-trade') result = await model.cancelTrade(offerId);
  else if (action === 'primary') result = model.setPrimary(propertyId);
  else if (action === 'store') result = model.storeItem(propertyId, itemId, 1);
  else if (action === 'withdraw') result = model.withdrawItem(propertyId, itemId, 1);
  if (!result) return false;
  if (!(shared ? result.accepted : result.ok)) { setStatus(reasonMessage(result.reason), 'error'); return false; }
  if (!shared && (action === 'buy' || action === 'sell')) await recordPropertyProgress(result, action === 'buy' ? 'bought' : 'sold');
  const label = propertyById(propertyId)?.label || 'Property';
  let success = 'Saved.';
  if (action === 'buy') success = `${label} is now yours.`;
  else if (action === 'sell') success = `${result.home?.label || label} sold for ${credits(result.salePrice)}.`;
  else if (action === 'sell-world') success = `${label} was sold back to the world.`;
  else if (action === 'list-sale') success = `${label} is listed for sale.`;
  else if (action === 'list-rent') success = `${label} is available for a 7-day rental.`;
  else if (action === 'rent') success = `${label} is rented to you.`;
  else if (action === 'cancel-listing') success = `${label} is no longer listed.`;
  else if (action === 'propose-trade') success = 'Your property trade offer was sent.';
  else if (action === 'accept-trade') success = 'The property trade is complete.';
  else if (action === 'decline-trade') success = 'The property trade offer was declined.';
  else if (action === 'cancel-trade') success = 'Your property trade offer was cancelled.';
  else if (action === 'primary') success = `${result.home?.label || label} is now your primary home.`;
  else if (action === 'store') success = `${result.item?.label || 'Item'} moved into home storage.`;
  else if (action === 'withdraw') success = `${result.item?.label || 'Item'} moved back to your Backpack.`;
  appCtx.properties = [...currentCandidates()]; renderPropertyMarkers(); updatePropertyPanel();
  setStatus(success, 'ok');
  return true;
}

function bindPropertyEvents() {
  if (propertyEventsBound || !appCtx.PropertyUI.panel) return;
  propertyEventsBound = true;
  const handler = (event) => {
    const viewButton = event.target?.closest?.('[data-property-view]');
    if (viewButton) { activeView = viewButton.dataset.propertyView || 'home'; updatePropertyPanel(); return; }
    const actionButton = event.target?.closest?.('[data-property-action]');
    if (actionButton) void handlePropertyAction(actionButton);
  };
  appCtx.PropertyUI.panel.addEventListener('click', handler);
  appCtx.PropertyUI.modal?.addEventListener('click', handler);
}
