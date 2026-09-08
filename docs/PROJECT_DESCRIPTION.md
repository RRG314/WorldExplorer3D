# World Explorer 3D

Updated September 7, 2026. Product description grounded in source `c801c19f`.
For deployment status, use the [current test guide](CURRENT_TEST_GUIDE.md).

World Explorer 3D is a browser-based sandbox that turns mapped places into
playable worlds. You can explore a neighborhood on foot, drive its streets,
take to the air, visit the ocean, travel through space, collect discoveries,
build, own virtual property and spend time with other explorers. Its direction
is a connected virtual life in a world informed by real geography—not a map
with an unrelated collection of minigames placed over it.

You do not need to install a desktop game. Keyboard, mouse and touch interfaces
serve the same application, with capability-dependent features such as camera,
location and AR. Not every browser or phone supports every sensor feature.

## A world built from real places

Choose a destination on the globe, search for a place, enter coordinates, use
your location, or return to favorites and recent destinations. The Earth runtime
assembles a bounded area from mapped roads, building footprints, terrain, water,
land cover and place information. Buildings receive generated walls, windows,
roofs and entrances where data supports them. Vegetation, people and traffic
give those areas activity.

This is not a continuously streamed, full-scale Earth. A session loads one
bounded Earth location; travel switches location or environment. Mapped facts
and generated gameplay remain distinct. A procedural storefront does not claim
to reproduce a real store's stock or interior.

Roads, bridges and tunnels share transport and terrain rules. Vehicles, the
camera and visible surfaces need to agree on those rules. Complex entrances,
intersections and provider gaps remain quality work, not solved worldwide
simply because a tunnel can be driven through. The rejected offset-strip
sidewalk treatment has been removed; a finished city-block sidewalk replacement
is not claimed.

## Movement, vehicles and the explorer

Explore on foot or switch among the supported car, drone, plane and boat modes.
Rovers and spacecraft belong to their appropriate environments. Mode switching,
vehicle entry, interaction and camera controls share the controls system rather
than requiring unrelated interfaces for every activity. Controls can be
configured; touch movement/look and action controls adapt the experience for
phones. Consult the in-app Controls panel for the current bindings.

The permanent BMW and personal plane remain free exploration options with full
condition. Other vehicle gameplay includes condition, impacts and recovery.
Driving includes terrain support, loss of support and airborne landings;
aircraft and vessels have their own handling rules. These are game physics,
not professional vehicle simulators.

An account profile holds the explorer's identity and character choice. The
Backpack brings together equipment, quick slots, supplies and the Explorer
Wallet. Health, food, water, medicine, tools, ammunition and weapon actions
connect exploration to resource use. Signed-in player state includes health
and owned-vehicle upgrades; not every local preference or activity is
automatically a cross-device save.

## Places that are useful

Functional places connect mapped business categories to existing gameplay:

- Convenience/general retail supplies ordinary consumables.
- Automotive/mechanic locations connect to vehicle services and upgrades.
- Pet/veterinary places connect to companion care.
- Outdoor/field suppliers connect to exploration equipment, not wearable-clothing customization.
- Medical places connect to health supplies/services.
- Marine places connect to marine exploration needs.

There is one Explorer Wallet. Purchases and services use existing inventory,
health, vehicle and companion authorities. Prices and stock are game values,
not real-time claims about a business. Unsupported places remain informational;
missing map data should not invent a business. The full six-family acceptance
matrix is still open, particularly interior and service combinations.

## Discovery, animals and activities

Field exploration includes a Journal, Field Guide, life lists, leads,
specialties, seasonal surveys and regional ecology. Field Today and Expeditions
provide direction without making the entire sandbox a single mandatory quest.
Geology and sample collection connect to tools and resource custody.

Companions have individual care, trust, progression and travel state, including
vehicle boarding. The dog is intended as the familiar everyday companion;
animals and regional catalogs are gameplay representations, not live sightings.
Fishing connects shore, boat and underwater play to catch records and rankings.
Other activity catalogs include Flower Sprint, Paint Town and DeFlock Hunt.

Urban systems provide pedestrians, traffic, responders, combat reactions,
recoverable loot and interactions. Density and visual quality are bounded by
runtime budgets. Shared-room combat and trade must not be advertised as fully
authoritative where the backend does not support them.

## Property and building

Real Estate provides virtual building-backed property, purchases and related
ownership flows. Maryland adds official parcel context on demand, including
land boundaries and grouping buildings on a parcel. Elsewhere, building-backed
property remains the fallback. These are virtual purchases and estimates—not
ownership of the real property or legal boundary surveys.

Quick Build and Blocks let players add persistent constructions locally and
within supported multiplayer rooms. Building, property and entry permissions
remain connected. This does not edit OpenStreetMap or grant permission to enter
a real building.

## Ocean, planets and space

Ocean and underwater exploration are separate environment experiences with
marine systems and field activities. Planetary surfaces support exploration
appropriate to each world, including astronaut presentation, rovers, drones
and field procedures rather than Earth aircraft everywhere.

Space includes solar-system travel, planetary destinations and a longer
expedition structure. The Solis Reach ship has three decks, crew guidance,
objectives and local-space views. Shuttle/pod travel connects ship and surface
journeys. The expedition includes a pirate interception with persistent
consequences for ship, crew and resources; it is not a separate promised
interior first-person shooter. Planetary field instruments and sample handling
connect space exploration back to progression and cargo.

Distances and movement use explicit game scales. This is a playable space
sandbox, not a single uniform astronomical simulation. Current code includes
these systems; this document is not a fresh end-to-end space victory test.

## Playing together

Community supports public/private rooms, presence, chat, shared activities,
Blocks and persistent room vehicles. Friends, invitations and creator profiles
connect through the account. Leaderboards cover existing activity categories.
Not all local actions are automatically shared or server-authoritative.

Capture-specific achievements, featured improved places and shareable
contribution-preview rooms are planned additions, not existing finished features.

## Improving a real building with photos

The working staging path lets an authenticated contributor upload photos,
select mapped building sides, crop and place images, save a revision and submit
it for review. Approval makes that contribution available on that particular
mapped building. The owner has completed this loop and seen the updated house
in the staging world.

This manual approach does not need a paid 3D reconstruction job. Available
photos cover selected surfaces while unmapped or unphotographed parts retain
generated presentation. Contributions reference the existing building identity;
they are not one generic facade copied across the world.

Desktop QR handoff and the phone page use the same account and capture. Raw
media belongs in protected Storage; record metadata and decisions belong in
Firestore. Saving an edit is not approval, and approving an exterior does not
publish its interior.

The newest source makes manual editing the default, adds device edit recovery
and restricts paid generation. Those changes are not all in the deployed staging
build yet. The current test guide states the exact boundary.

Interior captures start private. Broader sharing must be an explicit choice
and still pass review. A stretchable, photo-textured playable room is planned;
an uploaded room model does not by itself establish correct walls, doors and
collision. Private in-world draft previews also remain unfinished.

Meshroom/TRELLIS-based reconstruction is retained for development and future
options, including individual objects. Real jobs have run, but complete
building reconstruction is not reliable enough to describe as the public
default. Manual capture still has hosting/storage/processing costs; it is not
literally cost-free.

## Live information, GPS and AR

Live Earth includes views for satellites, earthquakes, street imagery, mapped
cameras, weather, ocean conditions, ships and aircraft. Each source has its own
availability and provenance. These views are not evidence that road traffic
mirrors real-time congestion.

Live GPS optionally follows foreground location with permission. AR chooses
spatial AR when supported, a camera overlay when available, or interactive 3D
otherwise. AR has no persistent-anchor support today and is not the capture
reconstruction engine.

## Learning, accessibility and account tools

First Journey introduces a small set of actions; the rest of the world can be
discovered through optional activities. Interaction hints use proximity and
familiarity rules instead of treating every distant object as an urgent task.
Controls, camera settings, handedness, text size, contrast, motion/flash options
and notice preferences support different ways of playing. Physical-device and
assistive-technology checks remain ongoing.

The account includes profile, social, security/privacy, contribution access and
support history. Stripe support payments are separate from in-game currency.
Administrators have protected moderation tools. Email/push approval delivery
is not yet verified end-to-end. Analytics currently permits first-party storage
until explicit denial; it should not be described as opt-in by default.

## What this is—and what it is not yet

The app already joins geography, travel, discovery, vehicles, property,
building, community and contributions. Its next work is making those connections
reliable and understandable, not introducing a second wallet, building database
or capture pipeline for each new interface.

Worldwide visual completeness, flawless bridge/tunnel coverage, a finished
manual interior editor, public contributor-preview worlds and automatic capture
rewards are not complete. Staging success does not certify production. See the
[system inventory](SYSTEM_INVENTORY.md), [architecture map](ARCHITECTURE_MAP.md)
and [manual capture plan](MANUAL_CAPTURE_PRODUCT_PLAN.md) for precise boundaries.
