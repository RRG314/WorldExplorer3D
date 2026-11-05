# Equipment, stores and the shared economy

Careers should explain equipment the player already owns or can use through an existing course. They must not create twenty inventories, a mineral wallet or parallel store catalogs.

| Need | Current owner | Proposed presentation |
| --- | --- | --- |
| Carried item / quick slot | `player/backpack-model.js`, v3 `backpack-store.js` | Owned, equipped, stored at home and missing are distinct. Recommend an item; do not auto-equip or re-grant it when focus changes. |
| Discovery/specimen | Journal claim/item transaction → `discovery/backpack-projection.js` | One instance/source-event projection. Keep label, custody, authority and tradeability. A skill award is not another item. |
| Course instrument | Original physical course/runtime | “Provided at this station” with actual controls. Do not send beginners shopping for equipment already available in a course. |
| Shop/service | Published business/commerce capability | Only show supported buy/sell/repair actions. Interior theme alone does not confer commerce functionality. |
| Connected credits | `connected-wallet-authority.js` → `functions/economy-authority.js` | Server balance and receipts. Preserve pending/uncertain delivery and settlement recovery. |
| Local sandbox credits | Existing anonymous-local commerce boundary | Clearly local simulation. Fresh audit’s $1,000,000 is not real cash or evidence of the connected wallet balance. |
| Vehicle / upgrade / condition | Existing Garage and vehicle condition owners | No focus-based free car or repair. Actual admission still requires owned selected usable car; career completion uses original race evidence. |
| Property/furniture | Housing owner / shared wallet / workspace project | Included personal room remains available through actual prerequisites. Furniture belongs to property/Backpack, not an engineering-only duplicate. |
| Material cargo/fabrication | `resources/material-catalog.js`, Expedition transfer/fabrication authority | Preserve kg/unit, ownership, consumption, output and energy/cost accounting. Reference geology is not a material grant. |

## Preparation order

Show the next task → owned/included tools → provided instruments → genuinely missing requirement → original preparation/shop action. Keep the first universal introduction free. Advanced preparation can exist without hiding basic alternatives. Beginner UI should prefer field essentials and task controls; the underlying weapons/gear remain available in their contexts.

## Proposed material chain

Training quarry evidence and labeled samples are educational custody records. They do not automatically become tradable ore. An approved future processing step must define input instance/quantity/mass, process ID, original authority, output instance IDs, loss/waste and restored-site evidence. Transfer, sale or fabrication then runs through the existing command/receipt and Backpack delivery owners. Retry uses the same request ID; unknown delivery cannot trigger another charge or output grant. Imported local training results cannot validate connected economic rewards.

## Content scope

Existing transferable items include reclaimed aluminum, ceramic repair stock, copper wire, bearing kits and repair sealant. These are curated game-world supplies with explicit units; do not claim every chemical element or mineral has a balanced market. Research samples with unresolved recovery/analysis requirements retain their restrictions. A future refining business needs playable machinery, costs, persistence and economy acceptance, not a progress bar and a new resource database.

Acceptance: focus switch preserves inventory/hotbar/condition/credits; duplicate event and repeated projection do not duplicate items; quota/offline/fail-after-charge retain recoverable command; account switch fences late callbacks; a missing tool is explained with a real action; course-provided route requires no purchase; personal and shared property permissions still govern access.
