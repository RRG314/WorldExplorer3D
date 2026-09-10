# Interior grid entry — September 10

The capture workspace now groups the Exterior/Home interior selection, explicit
interior permission, Open floor-plan grid action and validation feedback at the
top. The home editor presents its grid before secondary drawing and photo tools.
Existing layouts receive instructions for using the plan, not starting over.

Verified:
- Capture UI regression including mobile action/error viewport checks.
- 1100px desktop and 412px phone component flow: visible initial grid, editing,
  photo placement, save, protected derivative, private submission and reopen.
- Real staging authenticated flow at desktop and 390px phone widths: entry,
  upload, save/reload, private CPU submission, account notification and cleanup.
- Actual entry screenshots inspected; no forced scrolling to simulate visibility.

Staging functional acceptance ran on `003d4e48`; final `493c62fa` adds only the
existing-layout instruction correction and passed the component flow again.
Hosting: `5.2.0+493c62fa48b9.c49a95cffc9f6d77.staging`.

Limits: synthetic test photo, not physical Android hardware or public in-world
publication acceptance. Anonymous browser smoke showed sign-in and storage/auth
denials; authenticated staging used temporary automation attestation. Production
was not changed; no paid reconstruction was launched.
