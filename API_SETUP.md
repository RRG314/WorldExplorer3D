# API and Service Setup Guide

Last reviewed: 2026-02-25

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

Top-level:

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
- `blocks`
- `paintClaims`
- `state`

User subcollections:

- `friends`
- `recentPlayers`
- `incomingInvites`
- `myRooms`

### 3.3 TTL policies

Create TTL policies on `expiresAt` for collection groups:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

TTL is asynchronous cleanup. Keep client-side stale filtering for real-time UX.

## 4. App Check

App Check is optional for this branch configuration.

- If Firestore App Check enforcement is enabled in your Firebase project, configure App Check for this app.
- If you do not want App Check right now, keep Firestore App Check enforcement disabled.

## 4.1 CORS Allowlist (Functions)

Functions now enforce a CORS origin allowlist.

Defaults allowed:

- `https://rrg314.github.io`
- `https://worldexplorer3d-d9b83.web.app`
- `https://worldexplorer3d-d9b83.firebaseapp.com`
- local dev origins (`http://localhost:*`, `http://127.0.0.1:*`)

Optional custom domains:

```bash
firebase functions:config:set cors.allowed_origins="https://yourdomain.com,https://staging.yourdomain.com"
firebase deploy --only functions
```

## 5. Frontend Firebase Config

Set web config in:

- `public/js/firebase-project-config.js`

Runtime expects:

- `apiKey`
- `authDomain`
- `projectId`
- `appId`
- optional: `storageBucket`, `messagingSenderId`

Local override key:

- `worldExplorer3D.firebaseConfig`

## 6. Stripe Setup

### 6.1 Products/prices

Create recurring monthly prices:

- Supporter (`$1`)
- Pro (`$5`)

### 6.2 Webhook endpoint

- `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`

Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 6.3 Function runtime config

```bash
firebase experiments:enable legacyRuntimeConfigCommands
firebase functions:config:set \
  stripe.secret="sk_live_or_test_..." \
  stripe.webhook="whsec_..." \
  stripe.price_supporter="price_..." \
  stripe.price_pro="price_..."
firebase deploy --only functions
```

Optional admin allowlist config:

```bash
firebase functions:config:set \
  admin.allowed_emails="you@example.com" \
  admin.allowed_uids="your_uid"
```

## 7. Function Endpoints

Authenticated endpoints:

- `POST /createCheckoutSession`
- `POST /createPortalSession`
- `POST /startTrial`
- `POST /enableAdminTester`
- `POST /getAccountOverview`
- `POST /listBillingReceipts`
- `POST /updateAccountProfile`
- `POST /deleteAccount`

Public endpoint:

- `POST /stripeWebhook`

## 8. Validation Commands

Rules tests:

```bash
npm test
```

Function logs:

```bash
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
```
