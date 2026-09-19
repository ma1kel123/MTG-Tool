# MTG Tool V6.0 Beta Candidate

V6.0 consolidates the current project into one local-first mobile PWA Beta.

## Core product areas

### Decks
- Commander and Pauper Commander-oriented deck storage
- commander / partner fields
- versioned deck snapshots
- Scryfall enrichment
- card browser/editor
- color identity and structural legality checks
- maybeboard, favorites and custom categories
- source URL references
- Deck DNA / archetype / structural dimensions

### MDIE
- deterministic recommendation ranking
- Setup -> Payoff -> Finish model
- card-level dependency nodes
- required vs supportive dependency edges
- engine clusters
- critical paths
- redundancy / substitute paths
- cascade failures
- Scryfall candidate discovery
- virtual OUT -> IN testing
- fixed-seed A/B validation
- evidence-backed recommendation packages
- metadata-confidence gates
- inspectable accepted recommendation evidence

### Master Simulation Engine
- deterministic 4 / 5 / 6 player simulations
- 2k / 5k / 10k sequences
- stage progression
- targeted/shared interaction
- board wipes
- disruption classes
- recovery
- dependency-node failure and cascades
- fixed-seed before/after comparisons

### Real Playgroups
- multiple local playgroups
- add/remove players
- link exact saved decks to players
- table DNA from analyzed decks
- exact saved-deck binding for tracked games
- playgroup simulation against actual linked/analyzed deck profiles
- portable playgroup package import/export

### Play
- mobile commander life-counter table
- commander artwork backgrounds
- 1-6 player seating
- life, poison, commander damage and counters
- hold/tap life controls
- turn tracking
- timers
- Monarch / Initiative / Day-Night
- dice / coin / random player utilities
- tracked/quick games
- gameplay telemetry

### Statistics / Calibration
- player/deck/game history
- exact Deck ID + Version lineage
- telemetry integrity
- predicted vs observed metrics
- prediction error / MAE / bias
- confidence bands and calibration guards
- diagnostics and evidence inspection

### PWA / Sharing
- installable static PWA
- offline app shell
- Web Share / WhatsApp fallback for app sharing
- playgroup package sharing when file-share support is available
- full local backup / restore

## Product boundary

V6.0 is a local-first Beta Candidate.

It does NOT yet provide:
- server accounts
- live cloud synchronization between friends
- automatic cross-device collaboration
- a complete Magic Comprehensive Rules engine
- guaranteed direct import from third-party sites that do not expose stable browser-accessible APIs

Playgroup packages and app links provide the current share/collaboration workflow without requiring a backend.

## Final QA performed
- JavaScript syntax validation
- required PWA runtime file audit
- service worker / manifest presence
- unique core event-handler audit
- group simulation hook audit
- share / backup hook audit
- versioned-deck / Play telemetry architecture preserved