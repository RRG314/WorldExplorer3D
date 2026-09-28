# Game reference research

Status: local investigation and prototypes; not a production-readiness certificate. Inspected 2026-09-27 UTC against local baseline `1c18c696` and the working changes. External sources below were accessed 2026-09-27 UTC.

| Primary reference | Evidence actually inspected | Applicable decision for World Explorer |
|---|---|---|
| [Valve networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking?language=uk) | Documentation on snapshots, interpolation, local prediction and server history | Use a short interpolation buffer and bounded extrapolation. Server resolves hits; do not promote client impact reports into truth. |
| [Valve latency design](https://developer.valvesoftware.com/w/index.php?title=Latency_Compensating_Methods_in_Client%2FServer_In-game_Protocol_Design_and_Optimization&uselang=en) | Published client/server design article | Predict reversible local presentation and reconcile acknowledged inputs. History rewind needs a defined timing model, not arbitrary client timestamps. |
| [Overwatch gameplay architecture](https://www.gdcvault.com/play/1024001/-0verwatch-Gameplay-Architecture-and) | GDC session abstract, not a watched full talk | Supports investigating explicit simulation ownership; it does not establish that an ECS rewrite is needed here. |
| [Roblox client/server boundary](https://create.roblox.com/docs/scripting/security/client-server-boundary) | Security documentation | Validate identity, context, types, finite ranges, action rates and server resources. Validate all stages of a transaction. |
| [Fortnite art development](https://www.gdcvault.com/play/1024936/Developing-the-Art-of-Fortnite) | GDC abstract only | Visual consistency is an art-direction requirement. No proprietary art or undocumented netcode copied. |
| [Horizon AI development](https://www.gdcvault.com/play/1024912/Beyond-Killzone-Creating-New-AI) | GDC abstract only | Different actor sizes and open-world environments affect navigation and animation workflows. Keep role-specific data over one universal combat behavior. |
| [Minecraft controls](https://www.minecraft.net/article/minecraft-controls) | Published player controls | Preserve clear inventory/quick-slot access; this source is not evidence of Minecraft's server architecture. |

Sources accessed 2026-09-27 UTC. Design choices in the third column are project recommendations, not claims that these games use World Explorer's proposed architecture.

The RDR2 horse talk PDF could not be retrieved (403); no technical conclusions are attributed to it. GTA, PUBG, Battlefield, Call of Duty, DayZ and Rust internals have not been verified in this investigation. A long list of game names is not research evidence. Additional comparisons should be added only when primary material changes a concrete decision.

For this application: consistent camera aim, responsive local animation, reliable ownership and predictable recovery matter before increased equipment variety. Avoid copying competitive shooter complexity into every exploration activity. Preserve consent/activity rules for room damage.
