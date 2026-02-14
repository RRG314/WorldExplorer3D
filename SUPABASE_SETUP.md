# Supabase Multiplayer Setup

This project now supports shared multiplayer sync for:

- `block` placement/removal/stacking
- `flower` memories + note text
- `pin` memories + note text

Sync is chunked by world area and uses tombstones (`deleted_at`) for removals.

## 1. Create A Supabase Project

1. Create a new project in Supabase.
2. Open SQL Editor and run:
   - `supabase/world_placeables.sql`
3. Confirm table exists:
   - `public.world_placeables`

## 2. Get Project Credentials

From Supabase project settings:

- `Project URL`
- `anon public key`

## 3. Configure In App

1. Open the title screen.
2. Go to `Settings`.
3. In `Multiplayer Sync (Supabase)` enter:
   - URL
   - anon key
4. Click `Save Supabase Sync Config`.

The status line will show connection/read/write health.

## 4. How Runtime Sync Works

- Local place/remove applies instantly (no UX delay).
- A sync queue writes changes to Supabase.
- Nearby chunks (5x5 around player, 200 world units per chunk) poll every ~3.5s.
- Remote changes merge into existing local caches and re-render.

## 5. Security Baseline Included

Implemented client + DB baseline:

- allowlist `type`: `block | pin | flower`
- note clamp to 200 chars
- HTML-like input stripped client-side
- DB policy rejects notes containing `<` or `>`
- client write throttle: `30 writes/min`
- chunk caps (client-side soft guard):
  - blocks: `2000/chunk`
  - pins+flowers: `200/chunk`

## 6. Important Notes

- Sync is currently active in `earth` environment.
- Delete actions are tombstones (`deleted_at`) not hard deletes.
- Anonymous mode is used (no login yet); `author_id` is a local anonymous client id.
- For production abuse resistance, add an Edge Function rate limiter in front of writes.
