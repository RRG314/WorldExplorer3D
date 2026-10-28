# Collection, home storage and tuning

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Garage is a view/command layer over the existing economy/player record. It does not own a new currency, second inventory or physics copy. Existing engine,brake,tyre,suspension upgrades remain keyed to `stableVehicleIdentity`, and their numeric effects stay in `vehicleUpgradeDynamics`. A server upgrade receipt must preserve adjacent garage metadata; paid repair restores the corresponding owned condition once.

Vehicle identity,variant/asset,condition,acquisition and home association travel together. A borrowed room car has a lease, not a permanent entitlement. Home assignment verifies an owned property in the existing property authority. Assignment is logical storage; entering a furnished house does not spawn a car through its floor. Drive delivery requires clear supported exterior space and the correct controller/frame.

Stage model loading and validate the asset ID before releasing the current car. Cancellation,world replacement,account changes,room denial or model failure must retire prepared resources and keep current controls coherent. Selection is disabled while the car moves. Garage entries remain after changing cities or reloading; no repair by merely reselecting a car.

Supported today: catalog selection, condition,existing four upgrade categories and retained paint from the model. Future decals/body kits,wheel swaps,ride height,engine swaps and manual gearing need actual authored sockets,clearance and force support. Do not add decorative sliders with no effect. Cosmetic body deformation uses per-instance cloned geometry; this is an approximation with reversible repair, not soft-body crash simulation.
