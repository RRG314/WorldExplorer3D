# Records and leaderboard authority

Evidence date: October 28, 2026. Baseline `7da846f`; current working-source improvements are distinguished from unimplemented racing. No production deployment or purchase.

Extend `leaderboards/catalog.js` and its existing UI rather than adding another disconnected board. Keep personal bests,unverified device runs and server-verified competitive records in separately labelled scopes. Existing casual boards must retain their disclosures.

Keys: geographic course hash/version,vehicle class/build,assists/input policy,discipline,laps,weather/rules and timing protocol. Compare like runs. Submission must reference an authority-owned race result;ignore client finishing-time fields as a source of truth. Transactional result/payout receipt prevents retries,reconnects or duplicate tabs paying twice. Include participants and authority evidence without storing unnecessary raw personal location trails.

First ghost format should be bounded pose samples with build/course metadata for playback. It is visual evidence,not proof of deterministic re-simulation. Current controller/provider/variable frame behaviour does not justify an input-only deterministic replay claim. Retain a replay only under a defined size/privacy policy;moderate public names using existing social rules.
