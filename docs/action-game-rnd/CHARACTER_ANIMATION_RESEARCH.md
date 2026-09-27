# Character and animation research

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

[Three AnimationAction](https://threejs.org/docs/pages/AnimationAction.html) documents weighted playback, crossfades and one-shot looping. [Epic animation blending](https://dev.epicgames.com/documentation/unreal-engine/blending-animations-in-unreal-engine) and [blend spaces](https://dev.epicgames.com/documentation/unreal-engine/using-blend-spaces?application_version=4.27) describe compositing poses and parameter-driven locomotion. Accessed 2026-09-27 UTC. These are concepts, not a reason to add an engine dependency; the app currently uses Three r128.

## Implemented foundation

`app/js/character/animation/controller.js` owns one mixer per visual. A torso-descendant mask separates lower locomotion from upper action tracks. Smooth weights replace abrupt switches; hit/down are full-body reactions. Sequence-numbered one-shots suppress duplicate animation events. Invalid dt cannot poison the mixer. Disposal stops playback and uncaches the root; original cached clips are not edited.

`walking/curated-explorer-character.js` now uses that controller for its existing roles. The two-character browser laboratory uses the actual licensed GLBs; both walked while waving with independent mixers. This is a presentation prototype, not the requested two-player game acceptance. Existing equipment presentation now triggers authored fire/melee/punch/interaction clips and cancels them on equipment changes. These are local presentation events, not proof of server acceptance. Remote proxy conversion remains pending.

## Coverage and gaps

The existing rigs contain 24 clips: idle variants, walk, run, backward/left/right run, gun action, interaction, two kicks, two punches, roll, sword slash, two hits, death and wave. Exact inventory is in `character-asset-inventory.json`.

| Requirement | Current evidence / next step |
|---|---|
| Idle/walk/run/strafe/aim | Authored clips present; layered playback implemented. Strafe selection needs movement intent from owner. |
| Fire/melee/interact/reaction | Existing local equipment owner now drives supported action clips; replicated server acceptance/reactions remain pending. No speculative authoritative hits from animation. |
| Crouch/jump/fall/landing/turn-in-place | No corresponding complete authored set verified. Retarget compatible licensed set and validate root motion. |
| Draw/holster/reload/throw | Do not relabel unrelated clips as correct coverage. Source specific clips and align release markers to game action timing. |
| Vehicle entry/sitting/recovery/contextual work | Requires contact targets, lifecycle cancellation and authored coverage; not implemented. |
| Hand IK | Existing solver retained after mixer; target must remain equipment-owner data. |
| Foot IK/look/aim offsets | Add only after slope and camera tests; clamp anatomical rotation and solve near characters only. |
| Motion warping | Defer until authored vehicle/contact clips exist. Do not warp physics from visual root motion. |

Use a common humanoid mapping offline, bake retargeted clips to the existing rig and verify every resulting asset. Do not retarget every frame. Network state should carry posture, velocity, facing, equipped item, action sequence and reaction, not bone transforms. Contextual actions need explicit priority and cancellation (down > vehicle transition > action > locomotion).
