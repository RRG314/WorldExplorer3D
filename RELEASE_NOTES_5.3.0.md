# Further into the world

World Explorer 3D 5.3 brings more detail to familiar places and more to do aboard
Solis Reach. Version 5.3 is live, including the September 28 loading and
memory update.

## A ship you can explore and work in

Solis Reach has circular corridors connecting 25 rooms across three decks.
The bridge, laboratories, medical rooms, engineering spaces and living areas
have clearer functions, with licensed furniture, instruments and wall consoles.
The observation room and Pathfinder bay look out into space.

Take collected specimens to a laboratory, place them on the work surface, and
measure their properties. Research and fabrication use the same cargo records
as the rest of the expedition. Shared expeditions keep those changes synchronized
and reject conflicting updates. Pathfinder departure now passes through a
sealed-bay launch sequence before returning control to flight.

## More depth beyond Earth

Stars and planets can be selected beyond the Solar System, with information and
travel actions for supported destinations. The star field responds to the
observer's location. Constellation guides respect the display setting rather
than appearing again after a selection.

Planet and moon rendering uses improved imagery where available, with separate
treatment for orbital views, terrain and gas-giant atmospheres. Galaxies and
stellar regions have spatial depth, and nebula rendering no longer carries the
unwanted straight-line overlays. Duplicate course rings have been removed;
the on-screen direction cue remains available for manual flight.

## More recognizable streets and landscapes

Building facades fit complete window bays and floors within their walls.
Sidewalk connections, crossings, road markings and roadside-object placement
follow the mapped streets and terrain more consistently. Detailed rivers no
longer overlap a second regional water surface.

Land cover, regional imagery and elevation sources contribute to the appearance
of dry ground, rock, vegetation, snow and ice. These remain representations of
the available data, not surveyed models of every location.

## Continue improving a place

Photo contributions now connect building selection, phone handoff, editable
floor plans, wall, floor and ceiling photos, saved revisions and account review.
Approved interiors can be entered in the game. Private originals, exterior
publication and interior sharing remain separate permissions.

## Smoother transitions and shared play

This update repairs room admission, presence and shared-vehicle ownership;
restores input focus after dialogs; reduces overlapping mobile prompts; and
improves transitions between Earth, spacecraft and ship interiors. Camera changes
keep the current Explorer instead of showing the retired character.

Rendering work now shares more reusable assets, batches static geometry, skips
unchanged interface updates and releases replaced scene resources. These changes
reduce avoidable work; they are not a promise of a particular frame rate on every
device.

## Faster world loading, less repeated work

Terrain sampling now avoids repeated temporary allocations. Mapped-water
lookups use a spatial index, road compilation overlaps terrain preparation with
a readiness barrier, and building buffers are sized before compilation.
Pavement workers retain less intermediate data. Nearby lighting reuses a fixed
spotlight pool instead of continually adding shader variants.

In individual dense-city runs on an M1 Mac, first play improved from about
59 seconds to 48–50 seconds. A matched road-ready measurement reduced the primary
renderer footprint from about 3.8 GiB to 3.1 GiB while retaining the same
25,507 buildings, 18,759 roads and 49 terrain tiles. These are specific test
results, not guarantees for every location, network or device.

Multiplayer action cooldowns now use server time consistently. A fresh
weekly-city check loaded Chicago through the normal join controls on two
authenticated clients and verified that both players shared the public room.
That session used isolated backend services; live deployment checks separately
verified the production package and service authentication boundaries.

## Known limitations

Dense-city memory remains substantial, especially after repeated world entry.
The final desktop performance run missed the configured ground-mode FPS,
transient heap and aircraft-activation targets: approximately 41–42 FPS,
1.11 GiB peak sampled heap, and a two-second aircraft activation. The performance
gate remains failed; its limits were not lowered. Mobile browser emulation
passed, but physical-phone responsiveness is still unverified.

Some ship utility equipment remains simpler than the licensed furnishings.
Planetary terrain and distant environments mix observations with procedural
reconstruction; unknown landscapes are not measured surface data. Complex
bridges, tunnels and incomplete map coverage still need location-specific work.

The portable-core, Rust/Wasm, TypeScript and action-system investigations include
prototypes and benchmarks. They are not a replacement game engine, a new
server-authoritative movement system, or a promise of complete PvP support.
See [release status](docs/RELEASE_INTEGRATION_STATUS.md) and
[the roadmap](ROADMAP.md) for validation and continuing work.
