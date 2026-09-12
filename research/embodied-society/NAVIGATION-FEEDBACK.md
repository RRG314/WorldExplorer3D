# Navigation feedback amendment

September 12, 2026. This amendment follows the [84-minute accelerated trial](reports/accelerated-needs-2.md). It changes the next resident's observations and control descriptions. Historical observations, outcomes and failures remain unchanged.

## Problem and change

The previous resident issued 68 movements totaling 524.985 cumulative metres before finally reaching fiber. Its last observation exposed an accumulated yaw near −119.77 radians. Its instructions described normalized axes but omitted quantitative turning speed. A full-strength five-second turn rotates through thirteen radians, more than two revolutions. These conditions make navigation unnecessarily difficult to interpret; they do not prove why the model chose those actions.

The body now publishes heading within −π to +π. Its private physics checkpoint retains accumulated yaw, so the underlying dynamics are unchanged. Observations also include the actual walking configuration: sixty frames per simulated second, forward speed in world units per second, turning speed in radians per second, and the positive turn/strafe conventions. The model is told that simultaneous turning and translation produces a curved path.

Visible resource records add horizontal distance, forward and left offsets in metres, and a signed relative bearing in radians. Positive bearing corresponds to positive turning input. A target directly above or below the resident has no horizontal bearing and is reported as null. Existing full three-dimensional reach checks remain authoritative. Visibility and permission filtering occur before these fields are added. Offsets are geometric observations, not a pathfinding result or proof that a route is clear.

Clearance rays now include relative bearings and normalized absolute headings. No new resource, route planner, teleport, automatic gathering or fixed sequence of actions is supplied. The model still selects its own actions through the same physics and world authority.

## Verification

**95 Node tests pass**, including new checks using the actual retained walking integrator. Repeated five-second turns match the published turning rate; normalized headings preserve their physical direction; subsequent forward movement matches the published speed and heading. Signed bearings are checked against actual turn-then-move motion for targets on both sides, headings near the wrap boundary and large accumulated headings. Separate assertions cover left/forward units and a vertically coincident target. Existing collision, reach, isolation, quota, inventory and rejection tests also pass. **24 Python record tests pass**, and the inventory remains fourteen live model runs.

These are controlled physics and component checks, not a new live model result. They establish that the feedback agrees with the tested mechanics; they do not establish that Gemini will use it effectively.

## Next live study

Use the same six-hour accelerated needs window, General exploration, resource-use-v1 and outcomes-only memory. Freeze a new source identity and reference this amendment before dispatch. Retain the repaired oversized-gather schema/rejection behavior from the preceding update. Do not resume or overwrite the interrupted older trajectory.

Measure approach to resources from archived observations, action rejection/recovery, cumulative movement versus net progress, actual needs minima, restoration and crafting. Do not compare cumulative path length alone as navigation quality. Record both successful and unsuccessful approaches, including changes of stated destination. Stop at the first declared time/call bound or failure; no operator guidance or supplies are added during observation.

Because both navigation feedback and rejection handling changed, a follow-up is a developmental trial, not a controlled causal estimate of either change. The six-hour target, sustained self-maintenance and useful-tool milestone remain unverified.
