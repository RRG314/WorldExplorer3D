# Economy and store integration

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

Existing `functions/economy-authority.js` transaction/receipt/wallet/stock ownership is retained. New equipment acquisition must call that authority and return an inventory custody receipt, not directly increment local ammunition or credits.

Mapped business identity is geographic evidence. Game stock is a category-based fictional offer and must be labeled as such; it is not a claim about the real business's inventory, opening status or endorsement. Use existing POI category semantics and existing Explorer Credits.

Purchase flow: select supported game offer → server validates business/category/player/price/version/stock → transaction debits credits and creates custody + receipt → client applies the receipt once. Repeated network requests reuse an idempotency key. Failed fulfillment uses the existing compensation path. Combat cannot award money directly; activity reward authority decides eligible rewards once.

Required tests: concurrent last-item purchase, duplicate request, forged price, unavailable offer, insufficient credits, room switch during purchase, retry after lost response, refund/compensation and existing field-tool/sample purchases. No new store catalog is enabled by this prototype. Inspect complete existing economy integration before adding any offer.
