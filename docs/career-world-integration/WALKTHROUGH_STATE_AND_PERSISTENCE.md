# Walkthrough state and persistence

## Actual implementation

`tutorial/tutorial.js` owns device localStorage `worldExplorer3D.tutorialState.v6`, with migrations from v3/v4/v5. State includes enabled/skipped/completed, current step, selected Sandbox path, movement, accepted result ID/storage scope, timestamps and contextual tips seen. Steps: Move (6 m), Interact, Explore/do something, Review, Complete. The existing controller listens to committed meaningful results and exact visible Journal event IDs. UI-only progress is not sufficient.

`mobileHintsConsent` is an existing field that also records deliberate help on desktop; Guided Start, Continue, Replay and Learning enable set it. Automatic mobile tips are off without consent. The independent visibility repair uses this existing consent value rather than adding another preference or broadcasting ambient hints.

`tutorial/current-journey.js` derives current mission/context guidance. Discovery owns physical field prompts. `ui/ambient-notices.js` bounds competing ambient channels. Original screen layout, named pause reasons and interaction priorities retain authority. Tutorial updates already participate in the shared frame path; do not add another career scanner there.

## Scope matrix

| State | Current scope | Design consequence |
| --- | --- | --- |
| Lesson progress | Browser profile/device, not UID | Sign-in does not create a blank lesson; sign-out does not erase it. Shared-device behavior must be explicit. |
| Character / Journal | Existing local IndexedDB profile | Lesson does not own inventory/XP/career state. Journal is shared among sign-ins using this browser profile today. |
| Account receipt | Captured UID / eligible item outbox and backend | Upload receipt is not full Journal cloud backup. No automatic import of old guest results as connected rewards. |
| Active course/mission | Domain-owned original save | Replay/disable does not reset it. Focus and lesson changes cannot overwrite it. |
| Current prompt | Disposable session UI | Hidden or dismissed caption can be stale; canonical persisted state wins. |

## Recommended lifecycle changes after approval

Keep v6 state owner initially. Add a deliberately named help preference only if a future migration genuinely needs to separate consent types; migrate existing explicit choice without resetting completion. Add career-specific lesson references as optional versioned metadata within existing profile/tutorial boundaries, not a second quest database. Each lesson references canonical domain evidence IDs; unsupported newer versions preserve bytes and offer update/skip rather than reset.

Resume rechecks environment/task/equipment before showing the next step. If context no longer fits, explain the preserved task and offer legitimate travel or another basic lesson; never mark it done. Invalid/missing Journal evidence cannot complete Review. Storage denied/quota makes session-only status visible and offers original export/recovery. Save failure must not silently advance lesson/grant rewards.

Carefully review `startOpeningChapter`’s existing unconditional `restartTutorial('explore')`: source suggests a completed lesson can be restarted by starting the chapter. That is an identified UX behavior to decide/reproduce at its specific boundary, not a demonstrated data-loss bug. Do not change it based on the earlier stale-caption observation; the actual desktop final state completed correctly.

Account-isolated Journal/cloud synchronization would be a different migration project requiring opt-in, owner association, conflict handling and privacy review. It is not implicit in career focus metadata. Existing legacy profile and Backpack backups stay untouched.
