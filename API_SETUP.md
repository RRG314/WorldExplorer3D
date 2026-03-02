# API and Service Setup Guide

Last reviewed: 2026-03-02

Setup checklist for Firebase Auth, Firestore, and Stripe integrations used by this branch.

## 1. Firebase Project

```bash
firebase login
firebase use worldexplorer3d-d9b83
```

## 2. Authentication

Enable in Firebase Console:

- Email/Password
- Google

Optional for guest join behavior in public rooms:

- Anonymous auth

Authorized domains should include:

- `worldexplorer3d.io`
- `www.worldexplorer3d.io`
- `worldexplorer3d-d9b83.web.app`
- `worldexplorer3d-d9b83.firebaseapp.com`
- `rrg314.github.io` (if using Pages)

## 3. Firestore

### 3.1 Deploy rules and indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 3.2 Collection model

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

Set TTL on `expiresAt` for collection groups:

- `players`
- `chat`
- `chatState`
- `incomingInvites`
- `recentPlayers`
- `activityFeed`
- `artifacts`

## 4. Functions Environment

Functions read values from Firebase params or process env fallbacks using `WE3D_*` keys.

Required for Stripe billing flow:

- `WE3D_STRIPE_SECRET`
- `WE3D_STRIPE_WEBHOOK_SECRET`
- `WE3D_STRIPE_PRICE_SUPPORTER`
- `WE3D_STRIPE_PRICE_PRO`

Optional admin/testing keys:

- `WE3D_ADMIN_ALLOWED_EMAILS`
- `WE3D_ADMIN_ALLOWED_UIDS`
- `WE3D_ALLOWED_ORIGINS`

Configure these in your functions runtime environment before deploy.

## 5. Stripe Setup

### 5.1 Products/prices

Create recurring monthly prices:

- Supporter ($1)
- Pro ($5)

### 5.2 Webhook endpoint

- `https://us-central1-worldexplorer3d-d9b83.cloudfunctions.net/stripeWebhook`

Subscribe webhook events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### 5.3 Deploy functions

```bash
firebase deploy --only functions
```

## 6. Functions Endpoints

Authenticated endpoints:

- `POST /createCheckoutSession`
- `POST /createPortalSession`
- `POST /startTrial` (legacy compatibility endpoint)
- `POST /enableAdminTester`
- `POST /getAccountOverview`
- `POST /listBillingReceipts`
- `POST /updateAccountProfile`
- `POST /deleteAccount`

Public endpoint:

- `POST /stripeWebhook`

## 7. Hosting Rewrites

`firebase.json` routes these paths to functions:

- `/createCheckoutSession`
- `/createPortalSession`
- `/getAccountOverview`
- `/listBillingReceipts`
- `/updateAccountProfile`
- `/startTrial`
- `/enableAdminTester`
- `/deleteAccount`
- `/stripeWebhook`

## 8. Validation

```bash
npm run test:rules
npm run release:verify
```

Useful logs:

```bash
firebase functions:log --only createCheckoutSession -n 50
firebase functions:log --only stripeWebhook -n 50
firebase functions:log --only getAccountOverview -n 50
```

