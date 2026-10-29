# Vehicle classes and acquisition

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

`engine/vehicle-catalog.js` remains handling/dimension authority. `transport/vehicle-garage-rules.js` maps collection IDs to that catalog and canonical asset IDs. An owned instance's stable upgrade identity is separate from a temporary room lease or a borrowed traffic car.

Launch collection includes BMW,compact/sedan/SUV,pickup,passenger/delivery vans,taxi,box truck,bus,DeLorean,bothCadillacs,GolfII,Datsun. The free BMW remains available. Purchase prices are explicit development values in Explorer Credits; they are not a balanced racing economy or cash charges. Only the canonical server catalog may determine account prices. Guest purchases use the existing atomic Backpack/wallet save. Account acquisitions use the same wallet and `gameplay/vehicleUpgrades` document, with idempotent receipt transactions.

Proposed event families: everyday compact/sedan; classic touring; sports; offroad; utility/truck; open exhibition. Bus/truck events require sufficient road width and turn clearance. Motorcycles require a balance/contact model and new riding animations; no four-wheel substitution. Super/hyper/race vehicles remain asset/physics work, not empty selectable slots.

Performance rating must be derived from measured acceleration,braking,turning and event surfaces, with build hash and assists. Top-speed labels alone do not establish class parity. Acquisition must remain independent of racing rank unless the owner selects a progression design requiring specific optional event rewards.

The additional Meridian GT (78,000 Explorer Credits), Apex ClubSport (98,000)
and Kestrel Rally (44,000) use the same acquisition authority and stable upgrade
identities. They have distinct acceleration, steering, grip, braking, mass and
wheelbase profiles, and matching original unbranded models. The Apex emphasizes
road grip and braking; Kestrel is shorter and more responsive; Meridian is a
heavier grand tourer. Prices are game tuning values. These additions do not
change the free BMW or existing saved collection entries and do not enter the
ordinary traffic population.
