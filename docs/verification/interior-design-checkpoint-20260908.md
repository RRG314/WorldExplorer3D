# Interior design checkpoint — September 8, 2026

Not release-ready. No production deployment or cloud capture write in this checkpoint.

The digital-home design is recorded in `docs/DIGITAL_HOME_INTERIOR_PLAN.md`.
Current local foundation adds shared room dimensions and six photo surfaces to
the existing crop editor and manual derivative pipeline. It is not a complete
home builder. Room creation remains gated; do not enable it until envelope
validation, stable home/floor/room identities, and matching runtime collision are
implemented. Captured room patches cannot safely replace the existing generated
interior visuals while retaining unrelated collision.

Verification:
- Existing authority/hybrid/HTTP-security suite: 51 passing tests.
- Ground refresh suite: 7 passing tests, including material-reset reapplication
  and location-change index invalidation. A rural browser screenshot shows
  distinct farmland and grass; this is not a global visual-quality certification.
- Room editor browser fixture: desktop 1100 px and mobile 412/390 px; six
  surfaces, floor/ceiling placement, dimension edit, canonical-building retention,
  private save/reopen and second revision passed without browser errors.
- Mobile screenshot inspected. Remaining exterior-specific editor wording needs
  polish. HTTP saves were mocked through the actual normalizer, not Firebase.
- Physical Android camera/upload, cross-device cloud persistence, home walk-through,
  approval and guest access are still unverified for the new room workflow.

Next: implement the first contained room on stable home/layout identity, sharing
one geometry authority with collision and doorway/exit behavior. Then verify the
full private account workflow before connecting multiple rooms and floors.
