# API and Service Setup Guide

Last reviewed: 2026-02-23

Setup checklist for Firebase, Firestore, and Stripe used by the current platform.

## 1. Firebase Project

```bash
firebase login
firebase use worldexplorer3d-d9b83
```

## 2. Authentication

Enable providers in Firebase Console:

- Email/Password
- Google

For GitHub Pages testing, ensure authorized domain includes:

- `rrg314.github.io`

## 3. Firestore

### 3.1 Deploy rules and indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 3.2 Active collections

- `users`
- `rooms`
- `flowerLeaderboard`
- `paintTownLeaderboard`
- `activityFeed`
- `explorerLeaderboard`

Room subcollections:

- `players`
- `chat`
- `chatState`
- `artifacts`
- `paintClaims`
- `state`

User subcollections:

- `friends`
- `recentPlayers`
- `incomingInvites`

### 3.3 TTL policies (recommended)

Create TTL policies on `expiresAt` for collection groups:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

Important: TTL is asynchronous cleanup. Client-side stale filtering is still required for real-time UX.

## 4. Frontend Firebase Config

Set web config in:

- `public/js/firebase-project-config.js`

Runtime expects:

- `apiKey`
- `authDomain`
- `projectId`
- `appId`
- optional: `storageBucket`, `messagingSenderId`

Fallback key (local override):

- `worldExplorer3D.firebaseConfig`

## 5. Stripe Setup

### 5.1 Products/prices

Create recurring monthly prices:

- Supporter (`$1`)
- Pro (`$5`)

### 5.2 Webhook endpoint

- `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 5.3 Function runtime config

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_live_or_test_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
firebase deploy --only functions
```

## 6. Function Endpoints

Authenticated endpoints:

- `POST /createCheckoutSession`
- `POST /createPortalSession`
- `POST /startTrial`
- `POST /enableAdminTester`
- `GET /getAccountOverview`
- `GET /listBillingReceipts`
- `POST /updateAccountProfile`

Public endpoint:

- `POST /stripeWebhook`

## 7. Validation Commands

Rules tests:

```bash
npm test
```

Function logs:

```bash
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
```
