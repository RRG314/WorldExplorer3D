# World Explorer AR — Implementation Handoff

Date: 2026-08-16
Status: code-complete baseline; real-device acceptance pending

## What is usable

- Owned companion cards open the exact persisted companion in contextual AR/3D.
- Image-backed Field Guide and Collection records with a supported bounded model expose **Place in AR**.
- Compatible wetland, riverbank, freshwater, coast, and beach cells expose a **Waterfowl Photo Survey** from the existing Explore pane.
- The waterfowl experience is deterministic, virtual-only, touch/click photography. An active Trail Hound appears as a celebratory field helper after completion.
- Runtime capability order is spatial WebXR → honest camera overlay → interactive 3D. Camera denial falls back to 3D without blocking the content.
- AR is Earth-only, cannot start from vehicle modes or above the Live GPS speed threshold, ends when hidden, and closes on world replacement.

## Ownership and privacy

`app/js/ar/session-service.js` is the only camera/XR/session owner. `app/js/ar/eligibility.js` is the only entry-point eligibility registry. Discovery remains the owner of companions, records, models, wildlife habitat, and world identity. Camera frames are neither copied nor saved nor uploaded, audio is never requested, and AR never requests GPS.

The main runtime is suspended only while AR is active. The AR renderer is transparent and separate, does not draw the Earth world behind a camera feed, is pixel-ratio capped, and is disposed with its content tree at session end.

## Main files

- `app/js/ar/capabilities.js`
- `app/js/ar/eligibility.js`
- `app/js/ar/field-challenge.js`
- `app/js/ar/presentation.js`
- `app/js/ar/session-service.js`
- `app/styles/ar.css`
- `docs/AUGMENTED_REALITY_PLATFORM_ARCHITECTURE_RND.md`
- `scripts/test-ar-platform.mjs`

## Focused verification

```bash
npm run test:ar-platform
npm run test:css
npm run test:module-versions
npm run test:maintainability
npm run test:world-discovery-browser
```

The browser journey forces the no-camera path, opens the exact adopted Trail Hound, validates the diagnostic/privacy contract, captures the frame, closes AR, and confirms normal Discovery play resumes.

## Real-device acceptance checklist

Automated browser tests cannot certify physical tracking or browser permission UX. Before calling hardware acceptance complete, test the secure deployed build on:

1. Supported Android/WebXR device: companion and specimen start; hit-test reticle; placement; walking around a placed object; clean exit.
2. Handheld Safari: camera-overlay label; rear camera; drag/scale; backgrounding ends the stream; return to normal play.
3. Camera denial: clear explanation; interactive 3D remains usable; no repeated automatic prompt.
4. Habitat challenge: eligible near a compiled water habitat; four virtual mallards respond only to touch/click; no real-animal occurrence claim; helper appears after completion when a Trail Hound is active.
5. Safety: car/plane/drone/boat and moving Live GPS starts are rejected.
6. Resource cleanup: browser camera indicator turns off immediately on Close, background, or world change; a second session starts normally.

The local source preview remains `http://127.0.0.1:4192/app/`. Camera access over a phone requires the HTTPS test/deployed URL; localhost trust does not extend to another device opening the computer's LAN IP over plain HTTP.
