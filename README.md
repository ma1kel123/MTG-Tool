# MTG Tool Master V5.8 Alpha — Exact Play Seat Binding / MSE v14

V5.8 fixes the most important remaining lineage weakness found during automatic calibration work.

## Explicit saved-deck binding per Play seat

Each player seat in the tracked-game setup can now be bound directly to a saved deck.

The selector displays:
- deck name
- exact current deck version
- commander

The binding is stored by player/member and reused in later games.

## Game-start snapshot

When the game starts, MTG Tool snapshots:
- Deck ID
- exact Deck Version
- deck name
- commander

Historical games therefore remain linked to the version actually used at game start, even if the deck is edited later.

## Legacy fallback

Older users/records without explicit bindings can still resolve by an unambiguous exact deck-name match.

However:
- legacy-resolved references are marked
- they no longer count as high-integrity exact-version calibration data
- V5.6/V5.7 calibration uses explicit exact-version references only

## Integrity semantics

High telemetry integrity now requires every player seat to be explicitly bound to a saved Deck ID + Version.

Diagnostics exposes saved-seat binding coverage.

## Why development pauses here

The next meaningful calibration improvement requires real tracked games generated through this exact seat-binding path.

Continuing to change calibration formulas before collecting that data would risk optimizing against synthetic assumptions rather than observed behavior.

Recommended next action:
1. deploy/test V5.8 on phone
2. bind saved decks to the actual players in a tracked game
3. record several games
4. return to Diagnostics -> Calibration
5. use the resulting exact-version prediction error to decide the next model change