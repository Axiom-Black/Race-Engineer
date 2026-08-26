# LMU track roster — with the properties that decide coverage

> **Inventory supplied by the owner** (26 Aug 2026), from the published LMU
> circuit and car lists. Iteration 5's schedule is sorted against this list
> (`docs/iteration-5-test-plan.md` §2). §Inventory is complete; the property
> columns in §Properties are filled as figures are confirmed, because they are
> what make the list useful for choosing *which* track to drive on a given day.

## Why the properties matter more than the names

A track is a test case. What makes it a *different* test case from the last one
is not its name — it is the code path it stresses. These five columns are the
ones that decide that, and they are the reason the schedule is not just "drive
somewhere new".

| Column | What it stresses | Why we care |
| --- | --- | --- |
| **Length (km)** | Trace resolution per kilometre | A 3 km lap and a 13 km lap both get 400 points. The importance-weighted resampler is supposed to make that survivable; nothing has tested it. |
| **Longest straight** | `lib/resample.js` allocation | A very long straight is where the resampler is meant to spend almost nothing. If it starves the straight too hard the map's geometry visibly cuts. |
| **Corner count (official)** | `lib/cornerDetect.js` | The only external ground truth we have for the detector. COTA's 20 is currently the *entire* evidence base. |
| **Corner density** (corners/km) | Detector + the 400-point budget + map legibility | High density is where badges crowd and where the detector must split rather than merge. |
| **Elevation / banking** | `G Force Vert`, ride-height channels | Completely unexercised. Both are decoded and neither has ever been read against a track known to have gradient. |

Two further axes that are session-level rather than track-level, tracked in the
test log instead: **wet/dry** and **day/night**.

## Inventory — every circuit in LMU

Primary layout per venue. Grouped by how it is obtained, because DLC ownership
decides what is actually drivable in the test window.

### Base game

| # | Circuit | Country |
| --- | --- | --- |
| 1 | Algarve International Circuit (Portimão) | Portugal |
| 2 | Bahrain International Circuit | Bahrain |
| 3 | Circuit de la Sarthe (Le Mans) | France |
| 4 | Fuji International Speedway | Japan |
| 5 | Autodromo Nazionale Monza | Italy |
| 6 | Sebring International Raceway | USA |
| 7 | Circuit de Spa-Francorchamps | Belgium |

### 2024 Season Pack DLC

| # | Circuit | Country | Pack |
| --- | --- | --- | --- |
| 8 | Autodromo Enzo e Dino Ferrari (Imola) | Italy | Pack 1 |
| 9 | Circuit of the Americas | USA | Pack 2 |
| 10 | Autódromo José Carlos Pace (Interlagos) | Brazil | Pack 3 |
| 11 | Lusail International Circuit | Qatar | Pack 5 |

### ELMS DLC

| # | Circuit | Country | Pack |
| --- | --- | --- | --- |
| 12 | Circuit de Barcelona-Catalunya | Spain | Pack 3 |
| 13 | Circuit Paul Ricard | France | Pack 2 |
| 14 | Silverstone Circuit | UK | Pack 1 |

### US Track Pass

| # | Circuit | Country | Status |
| --- | --- | --- | --- |
| 15 | WeatherTech Raceway Laguna Seca | USA | announced |
| 16 | Daytona International Speedway | USA | announced |
| 17–20 | four further circuits | — | TBC |

### Alternate layouts

Each of these is a **separate test case**, not a duplicate: a chicane removed or
a section cut changes length, corner count and corner density — the exact three
properties the table above says decide coverage. Sarthe with the Mulsanne
chicanes removed is the most extreme straight in the game and is the single
best probe for `lib/resample.js` starving a straight.

| Venue | Layouts beyond the primary |
| --- | --- |
| Portimão | ELMS |
| Imola | ELMS |
| Circuit of the Americas | National |
| Bahrain | Endurance, Outer, Paddock |
| Fuji | Classic (No Chicane) |
| Circuit de la Sarthe | Mulsanne — No Chicanes |
| Lusail | Short |
| Monza | Curva Grande |
| Paul Ricard | 1a, 1av2, 1av2-short, 3a |
| Sebring | School |
| Silverstone | National, International, GP (WEC) |
| Spa-Francorchamps | Endurance (62-car) |

## Properties

Fill `Corners` from the circuit's official numbering — that is the number the
detector is measured against, and the one place an outside source is the arbiter.
**Leave a cell blank rather than guessing**; a guessed ground truth is worse than
none, because it will be quoted later as if it were measured.

`Source` records where a row's figures came from, so a later reader can tell a
measurement from a citation:

- **measured** — computed from an export we hold (`trace`, `.ld` channels)
- **published** — taken from the circuit's or LMU's own published figure, cited
- *(blank)* — not established

| Track | Length (km) | Longest straight | Corners (official) | Corners/km | Elevation / banking | Source | Driven (session IDs) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Circuit of the Americas | 5.513 | ~1.2 km (back straight) | 20 | 3.6 | Significant — T1 climb | measured (length, straight) · published (20) | S01 *(fixture + first upload)* |
| Circuit de la Sarthe | | | | | | | |
| Spa-Francorchamps | | | | | | | |
| Monza | | | | | | | |
| Sebring | | | | | | | |
| Portimão | | | | | | | |
| Bahrain | | | | | | | |
| Fuji | | | | | | | |
| Imola | | | | | | | |
| Interlagos | | | | | | | |
| Lusail | | | | | | | |
| Barcelona-Catalunya | | | | | | | |
| Paul Ricard | | | | | | | |
| Silverstone | | | | | | | |

> **These cells are blank on purpose.** The circuit and car lists were supplied
> as inventory only — they carry no lengths or corner counts — and this
> environment's egress blocks both `lemansultimate.com` and `traxion.gg`, so
> there is no source to cite. Filling them from recall would put a number in the
> one column that is supposed to be the detector's external arbiter, with no way
> for a later reader to tell it from a measurement. **Length also arrives free
> the moment a track is driven** — `trace.lengthKm` is measured from the export
> — so every row self-fills as the window proceeds; only `Corners (official)`
> genuinely needs an outside source.

## Coverage targets for Iteration 5

Chosen so the matrix covers the *properties*, not a track count:

- [ ] The **longest** track on the roster
- [ ] The **shortest** track on the roster
- [ ] The **highest corner density** on the roster
- [ ] The **longest single straight** on the roster
- [ ] One with **real elevation change**
- [ ] COTA, as the control

One track can satisfy several targets — that is the point of listing targets
rather than a number. Six ticks might take three tracks or six.

**Targets are not yet selectable from the table**, because selecting "longest"
and "highest density" needs the numeric columns. Two ways to proceed, and they
compose:

1. **Drive first, sort later.** Each upload measures its own length, straight
   and detected corner count, so the table fills itself. This is the honest
   route and it costs nothing — the cells are populated by the same act that
   ticks the box.
2. **Paste the figures.** Published length and official corner count for the 14
   venues, and the targets become selectable up front, which lets the 14-day
   schedule be laid out rather than discovered.

Until either happens, the schedule proceeds on the properties we can name
without numbers, which is enough for the first few days:

| Day-1 candidate | Why it, specifically |
| --- | --- |
| **Sarthe — Mulsanne No Chicanes** | The longest lap and the longest straight in the game, in one layout. If `lib/resample.js` starves a straight, this is where it shows. |
| **Monza** | Fewest corners of any base-game circuit, and long straights between them — the opposite extreme from COTA. A detector tuned on 20 corners must not invent them here. |
| **Spa-Francorchamps** | Real gradient. `G Force Vert` has never been read against a track known to have any. |
| **Sebring** | Notoriously rough surface, so the highest-frequency vertical content available — the other end of the `G Force Vert` probe from Spa. |

## Car roster

Recorded here because the test log annotates every note with its vehicle
(`docs/iteration-5-test-plan.md`, Track Notes), and because **class decides
which channels carry data**: the standing bar "unreliable data is flagged, never
hidden" exists because GTE exports arrive with Tyre Load, Grip Fract and Battery
empty. Driving one car per class is therefore a *correctness* probe, not variety
for its own sake.

| Class | Cars |
| --- | --- |
| **Hypercar** | Alpine A424 (+ 2026 Joker) · Aston Martin Valkyrie AMR LMH · BMW M Hybrid V8 (+ Evo 2026) · Cadillac V-Series.R (+ Evo 2026) · Ferrari 499P · Genesis GMR-001 LMDh · Glickenhaus SCG 007 · Isotta Fraschini Tipo 6-C · Lamborghini SC63 · Peugeot 9X8 (2023) · Peugeot 9X8 (2024) · Porsche 963 · Toyota GR010 Hybrid · Toyota TR010 Hybrid (2026) · Vanwall Vandervell 680 |
| **LMP2** | Oreca 07 Gibson · Oreca 07 Gibson (ELMS) |
| **LMP3** | Ligier JS P325 · Ginetta G61-LT-P3 Evo · Duqueine D09 · Adess AD25 |
| **GTE** | Aston Martin Vantage GTE · Chevrolet Corvette C8.R · Ferrari 488 GTE Evo · Porsche 911 RSR-19 |
| **LMGT3** | Aston Martin Vantage AMR LMGT3 Evo · BMW M4 LMGT3 (+ Evo) · Chevrolet Corvette Z06 LMGT3.R · Ferrari 296 LMGT3 (+ Evo) · Ford Mustang LMGT3 (+ Evo) · Lamborghini Huracán LMGT3 Evo 2 · Lexus RC F LMGT3 · Mercedes-AMG LMGT3 · McLaren 720S LMGT3 Evo · Porsche 911 LMGT3 R (992) (+ 2026) |

**Class coverage target — one export per class, five in total.** The reasons are
per-class and each one is a distinct code path:

- **Hypercar** and **LMGT3** carry `VirtualEnergySetting`; **GTE**, **LMP2** and
  **LMP3** carry fuel instead. The `.svm` energy-branch parser has only ever
  been run against one side of that split.
- **GTE** is the class the empty-channel flags were written for. It is the only
  class that proves the EMPTY badge renders on a real export rather than a
  synthetic one.
- **LMP3** is the least likely to have been exercised by anything, and the most
  likely to carry a channel inventory that differs from the 70 we decoded.

Everything else — the Evo variants, the 2026 Jokers — is variety, not coverage.
Drive them if a day is spare; do not spend a day of the window on them.
