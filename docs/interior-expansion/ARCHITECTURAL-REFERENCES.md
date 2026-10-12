# Museum architecture and representation

Reviewed October 12, 2026. These references inform the architecture; they do not
license copying photographs or current exhibitions into the game.

## The Peale: what is supported

The museum's [May 2022 wayfinding guide](https://thepeale.org/wp-content/uploads/2022/07/Revised-Peale-Wayfinding-Text-Directions-2022-2.pdf)
describes a front lobby, a small front storytelling room, an adjoining front
gallery, rear shop and service spaces, and two upper exhibition floors. It says
its cardinal directions need checking and contains an apparent repeated room
name. Consequently, the game uses the unambiguous front lobby / adjoining gallery
relationships, not unverified compass directions or a purported measured survey.

The [Maryland Historical Trust architectural file B-13](https://apps.mht.maryland.gov/medusa/PDF/BaltimoreCity/B-13.pdf)
documents the historic central hall, small first-floor rooms, and period plaster
cornices, woodwork and elaborate door frames. It is historical evidence, not a
current room-use plan. The current [museum visit page](https://thepeale.org/visit/)
describes the accessible side entrance, main entrance steps, three floors and
seating. These establish further research requirements; they do not justify
inventing traversable upper floors or accessible routes in the present slice.

## Implemented interpretation

The admitted building must still match the reviewed OSM identity and footprint.
The ground-floor fit selects the front block and its full frontage, rather than
using the larger rectangle extending into the rear wing. Two galleries share a
central entrance hall; doors, collision and the map come from one compiled plan.
Unmeasured room dimensions and decorative finishes are explicitly estimated.
The rear shop, garden, service rooms and upper floors are not in this visit.
The museum map and exhibit panels disclose this scope. No real Peale collection
or institutional endorsement is implied by displaying Smithsonian/Met objects.

Interior finishes comprise timber floorboards, painted lower wall panels,
baseboards, picture rails, plaster ceiling borders, framed doors, a ceiling
track with light housings, raised specimen plinths, collection labels and seating.
Repeated joinery uses instanced batches. Frames preserve the compiled clear door
width. Sculpture dimensions and proxy furniture use the same world-unit scale.
Display reading uses the existing walking camera and does not move the actor.

## Asset rights and lifecycle

The timber photograph is the existing CC0 Japanese Cedar Planks texture by
Charlotte Baglioni and Rico Cilliers; its original URL, dimensions and SHA-256
are in `app/assets/textures/facades/TIMBER_PROVENANCE.json`. Its use represents
finished timber, not a material survey of The Peale. The table and chairs reuse
the existing CC0 Poly Haven assets, with source provenance in
`app/assets/models/interiors/personal-workspace/PROVENANCE.json`. Models use the
existing lease owner; gallery-only textures and label textures release on exit,
and a late image callback cannot retain a disposed gallery texture.

## Rejected evidence

The widely indexed 1821 "Ground plan of Peale Museum" depicts the Philadelphia
museum at Independence Hall, not this Baltimore building. It must not be used
for this mapped association. Pre-renovation 2019/2020 exhibition descriptions
also cannot establish the appearance of the restored current building.

## Verification boundary

Layout and lifecycle component tests are distinct from actual-game traversal,
visual inspection, real-phone acceptance and whole-release performance. Their
results are recorded in VERIFICATION.md. This research does not close the other
museum or release gates.
