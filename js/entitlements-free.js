const FREE_ENTITLEMENTS = Object.freeze({
  fullAccess: true,
  cloudSync: true,
  proEarlyAccess: false,
  prioritySupport: false,
  featureConsideration: false,
  directContact: false
});

function cloneEntitlements(source) {
  return {
    fullAccess: !!source.fullAccess,
    cloudSync: !!source.cloudSync,
    proEarlyAccess: !!source.proEarlyAccess,
    prioritySupport: !!source.prioritySupport,
    featureConsideration: !!source.featureConsideration,
    directContact: !!source.directContact
  };
}

function createFreeEntitlementsState() {
  return {
    uid: null,
    plan: 'free',
    planLabel: 'Free',
    isAdmin: false,
    subscriptionStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    trialEndsAtMs: null,
    roomCreateCount: 0,
    roomCreateLimit: 3,
    entitlements: cloneEntitlements(FREE_ENTITLEMENTS),
    updatedAt: null
  };
}

function broadcastEntitlements(state, user = null) {
  const payload = {
    isAuthenticated: !!user,
    uid: user ? user.uid : null,
    email: user && user.email ? user.email : null,
    displayName: user && user.displayName ? user.displayName : null,
    isAdmin: !!state.isAdmin,
    role: state.isAdmin ? 'admin' : 'member',
    plan: state.plan,
    planLabel: state.planLabel,
    subscriptionStatus: state.subscriptionStatus,
    trialEndsAtMs: state.trialEndsAtMs,
    roomCreateCount: state.roomCreateCount,
    roomCreateLimit: state.roomCreateLimit,
    entitlements: { ...state.entitlements }
  };

  globalThis.__WE3D_ENTITLEMENTS__ = payload;
  globalThis.dispatchEvent(new CustomEvent('we3d-entitlements-changed', { detail: payload }));
  return payload;
}

function getFreeEntitlementsState() {
  const state = createFreeEntitlementsState();
  broadcastEntitlements(state, null);
  return state;
}

export {
  FREE_ENTITLEMENTS,
  broadcastEntitlements,
  cloneEntitlements,
  createFreeEntitlementsState,
  getFreeEntitlementsState
};
