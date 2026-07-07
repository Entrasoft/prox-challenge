# KB provenance

Every `kb/` file, the manual pages it was extracted from, and its verification status.
Extraction: Sonnet 4.6 vision over Ghostscript-rendered pages. Machine verification: Opus 4.8
re-reads the four critical artifacts against the source page image cell-by-cell (SPEC M1).
The **human checkpoint** (duty-cycle + synergic-settings sign-off) is the final gate.

| File | Source pages | Status | Notes |
| --- | --- | --- | --- |
| `tables/duty-cycle.json` | owner-manual p7 | ✅ machine-verified | All duty-cycle values match the source specifications table on page 7 (MIG, TIG, Stick at 120V and 240V). Flux-cored note is acceptable as the manual lists flux-cored wire under the same MIG power section without separate duty-cycle figures. |
| `tables/specs.json` | owner-manual p7, owner-manual p16, owner-manual p20, owner-manual p30, owner-manual p32, owner-manual p43, owner-manual p44 | ✅ machine-verified | All electrical values (MIG 20.8A@100A/30-140A, 25.5A@200A/30-220A; TIG 20.6A@125A/10-125A, 15.6A@175A/10-175A; Stick 19.5A@80A/10-80A, 23.7A@175A/10-175A), Max OCV 86VDC, weldable materials, wire diameters, speed 50-500 IPM, and 12 lb spool match page 7. Circuit requirement notes (GFCI 120VAC 20 amp rated, delayed action breaker, plug fits one way) match pages 16/20/30/32. Item 57812 confirmed. |
| `tables/process-selection.json` | selection-chart p1 | ✅ machine-verified | All values match the source image: skill levels, gas requirements, materials, thickness ranges, applications, cleanliness, advantages, MIG vs Flux-Cored checkmarks, and duty cycle explanation are all correctly transcribed. |
| `tables/synergic-settings.json` | owner-manual p20 | ✅ machine-verified | Both records match the source image. Record 1 (MIG Stainless Steel, .025", 24Ga, Stainless Tri-Mix, SCFH 20-30) matches the Diameter/Thickness screen and gas screen. Record 2 (MIG Steel, C25, .030", 24Ga, 121 in/min, 13.8V, Run-In WFS 25, Inductance 5, Spot Timer 0.0s) matches the Auto Weld Settings example screen. |
| `tables/polarity.json` | owner-manual p13, owner-manual p14, owner-manual p20, owner-manual p30, owner-manual p32, owner-manual p35, quick-start-guide p2 | extraction pass |  |
| `tables/troubleshooting.json` | owner-manual p23, owner-manual p35, owner-manual p37, owner-manual p39, owner-manual p40, owner-manual p42, owner-manual p43, owner-manual p44 | extraction pass |  |
| `figures/index.json` | various | extraction pass | bounding-box crops; spot-check at human checkpoint |
| `chunks.jsonl` | all | extraction pass | page-anchored text for search_manual |

## Verification tiers
- **machine-verified** — Opus 4.8 re-read the JSON against the page image and confirmed every value.
- **extraction pass** — Sonnet 4.6 extraction only; spot-checked by a human at the checkpoint.
- **discrepancies** — verification flagged a mismatch; see the note and re-run `--only <artifact>`.
