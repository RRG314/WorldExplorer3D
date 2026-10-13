# Gameplay measurement

Telemetry version 2 separates entering a world from playing it. It does not change consent, save ownership, gameplay rewards or progression.

| Event | Meaning |
|---|---|
| `we3d_menu_ready` | Start menu runtime is ready |
| `we3d_launch_start` | An actual title launch passed selection and permission gates |
| `we3d_launch_ready` | That launch completed its playable handoff |
| `we3d_launch_failed` | The launch rejected or could not publish a usable world |
| `we3d_launch_abandoned` | Page closed during launch, when the browser delivers that notification |
| `we3d_first_play_ready` | Compatibility signal for the first world ready on a page |
| `we3d_world_session_start` | First visible, ready world of this play session |
| `we3d_first_action` | First controlled movement or completed context/discovery action in this session |
| `we3d_active_play_5m` | Five measured active minutes, with a first action |
| `we3d_world_session_end` | Return to title, page close or tracking teardown |

`launch_index` links a page's launch start and terminal event. It is not a global identifier. Build/version and `telemetry_version` separate old and new event semantics. GA's browser/session identities remain subject to consent and browser restrictions.

Active time uses a monotonic clock. Hidden, paused or loading intervals do not count. Hiding a tab or restoring it from the browser back/forward cache does not manufacture a new session. Gaps above five seconds are dropped rather than backfilled; after sixty seconds without input, time is idle. Input polling can undercount brief movement and transition boundaries. Position comparisons stay in memory and never appear in analytics payloads. A first action is a useful activation signal, not proof of enjoyment.

Launch duration covers the actual launch, including runtime setup, in milliseconds. Page-unload delivery is best effort. Missing terminal events can mean abandonment, interruption or blocked measurement; they are not automatically crashes. Initial bootstrap failures can prevent analytics itself from starting.

Only the three bounded marketing identifiers `utm_source`, `utm_medium` and `utm_campaign` enter campaign configuration. Coordinates, room codes, search terms, arbitrary paths and referrer queries remain excluded. Use lowercase slugs such as `reddit`, `social`, `city_exploration`. Do not tag internal navigation links. With standard analytics, bounded campaign values survive immediate same-tab navigation in session storage for at most thirty minutes; raw URLs are never stored. Limited analytics clears this cache and uses only the current page’s campaign values.

For owner testing, open `https://worldexplorer3d.io/?analytics_test=1` after deploying this version, then use the normal Play link in the same tab. It sets `traffic_type=internal` and `debug_mode` for this tab's session. `?analytics_test=0` clears it. This marks traffic; exclusion still depends on GA's report/filter configuration. It does not identify people by account or IP.

Recommended GA reporting:

- Key events: first action and five active minutes; readiness remains a diagnostic milestone.
- Event dimensions: `environment`, `travel_mode`, `action_kind`, `failure_reason`, `release_build`, `telemetry_version`.
- Custom metric: `load_duration_ms`, milliseconds. Evaluate average duration on `we3d_launch_ready`; failure durations are separate outcomes, not extra successful loads.
- Ordered journey: entry → launch → ready → first action → five minutes. Inspect direct game entry separately from the landing-page route.
- Exclude marked testing traffic in the analysis. Keep any new data filter in testing until its behavior is verified; permanent ingestion filtering cannot restore discarded events.
- Measure return cohorts from first activation, with a complete seven-day follow-up. Do not label unrelated event totals a conversion funnel.

Verification uses pure clock/lifecycle cases and the real Firebase Analytics SDK with a local collection endpoint. That proves request formation, not GA ingestion. Browser journey checks exercise saved discoveries and return-to-place, with explicit setup steps; they are not an uncoached player study or a physical-phone performance certification.

## Configured reporting

The production GA property now has the two gameplay key events, six dimensions and loading-duration metric listed above. Both key events count once per GA session and have no default monetary value. The existing Internal Traffic filter matches `traffic_type=internal` and remains in Testing. Use the saved **Exclude marked tests** comparison when reviewing player behavior. It excludes the filter label; unmarked test visits still remain. Validate its population after release before relying on it.

Search Console’s URL-prefix property for the production domain has been created but is unverified. Its Analytics verification cannot detect the dynamically loaded SDK in the homepage HTML. The separate public verification meta tag is prepared in the homepage source. Complete verification after that homepage is deployed, then submit the existing sitemap and inspect actual query/indexing data. No DNS settings or verification access grants were changed.

These account settings do not publish the code. Confirm the expected released build, make one explicitly marked test journey, inspect GA DebugView, and allow reporting processing before checking the saved comparison. Then collect a complete seven-day cohort; registration alone is not evidence of better retention.
