# MTG Tool V2.3 Integrated Alpha

This is the first integrated build where Analyze derives major values from the imported deck itself.

Implemented:
- persistent versioned deck library
- Scryfall `/cards/collection` batch enrichment
- card metadata caching in localStorage
- real land count
- real average nonland mana value
- commander mana value
- functional role classification from oracle text/type line
- approximate mana color-source counts
- Deck DNA signals from detected mechanics
- 5,000-run local opening/development Monte Carlo
- measured bottleneck thresholds
- pod stress model combining real deck-derived data with synthetic environments
- improvement package selection based on saved analysis
- commander artwork lookup in Play
- GitHub Pages + PWA static hosting support

Important alpha limitations:
- role classification is heuristic, not a full Magic rules engine
- commander-on-curve is a proxy and does not yet solve exact colored mana sequencing
- pod environments are still synthetic test models
- accepted recommendations create version snapshots but do not yet perform real card substitutions
- card names must be recognizable by Scryfall for enrichment

GitHub update:
Upload/replace these files in the repository root and commit. The same GitHub Pages URL will update automatically.