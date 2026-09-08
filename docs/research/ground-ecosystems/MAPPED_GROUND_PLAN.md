# Mapped ground completion plan — September 8

Local work only, based on deployed db62593b. Do not change road geometry,
elevation, buildings, camera, collision, or capture publication.

1. Connect existing detailed land polygons to terrain material selection; share
   classification with regional terrain. Retain provenance, holes, stable
   overlap ordering and spatial indexing. No second provider or database.
2. Separate physical cover from property purpose. Explicit surface evidence wins;
   a residential/commercial label cannot turn every garden into concrete. Fine
   grass, wood, sand and bare-ground areas override broad context. Unknown areas
   keep the existing land-cover fallback, not invented driveways or crop rows.
3. Improve texture scale and repetition using existing licensed materials, with
   no new per-frame network work or extra texture samplers.
4. Execute selection/boundary/hole/order tests; inspect real local gameplay on
   desktop and Android emulation across park, residential, farm and natural land.
   Failures and unverified locations remain explicitly open.
5. Record evidence and remaining limitations; checkpoint and provide a local
   candidate for owner testing. No production changes in this task.

Acceptance is visual as well as functional. Vertex-resolution boundaries and
missing provider data must not be described as survey-accurate surfaces.
