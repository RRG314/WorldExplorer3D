import { verifyArchive } from "./export.mjs";
import { select, receipt } from "./science.mjs";
export function verifyReceipt(r, bundle, summary) {
  if (
    r?.schema !== "lhc-analysis-receipt-v1" ||
    r.sourceSha256 !== bundle.sourceSha256 ||
    r.category !== bundle.category
  )
    throw new Error("Receipt source or schema mismatch");
  if (
    !r.cut ||
    !Number.isFinite(r.cut.minimumEachMuonPtGeV) ||
    r.cut.minimumEachMuonPtGeV > 10000
  )
    throw new Error("Invalid receipt cut");
  const selection = select(summary, r.cut.minimumEachMuonPtGeV, r.cut.charge),
    expected = receipt(
      bundle,
      selection,
      r.cut.minimumEachMuonPtGeV,
      r.cut.charge,
    );
  for (const key of [
    "source",
    "sourceSelection",
    "calculation",
    "binning",
    "count",
    "outsideHistogram",
    "bins",
    "selectedIds",
  ])
    if (JSON.stringify(r[key]) !== JSON.stringify(expected[key]))
      throw new Error("Receipt does not reproduce: " + key);
  verifyArchive(r, bundle, summary, selection);
  return selection;
}
