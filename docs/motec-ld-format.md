# MoTeC `.ld` / `.ldx` — Format Findings (LMU)

Derived by direct inspection of a real LMU export:
`2026-06-30_-_19-32-27_-_Circuit_of_the_Americas_-_P1` (Ferrari 488 GTE Evo, COTA).
**Not** from a generic spec — these offsets are confirmed against the actual bytes.

## File header (`.ld`)

| Offset | Type | Field | Confirmed value |
|--------|------|-------|-----------------|
| 0x00 | u32 | LD marker | 0x40 |
| 0x08 | u32 | channel-meta pointer | 0x3448 |
| 0x0C | u32 | channel-data pointer | 0x5630 |
| 0x24 | u32 | event pointer | 0x6E2 |
| 0x4C | char[4] | device marker | "ADL" |
| 0x5E | char | date string | "30/06/2026" |
| 0x7E | char | time string | "19:32:27" |
| 0x9E | char | driver name | scrubbed per G0.2 — see note below (**confirmed 0x9E**, not 0xA0) |
| 0x15E | char | venue | "Circuit of the Americas" |

> **Note on the driver-name field.** **Resolved** (see `fixtures/FIXTURE_NOTES.md`):
> byte inspection of the real export confirms the name string starts at `0x9E`, not
> `0xA0` — this table previously said `0xA0`, which was wrong by two bytes.
> `CLAUDE.md` and the JS parser (`prototypes/ByteCraft_SessionUpload.jsx`, which reads
> a str32 at `0x9E`) were right. The committed sanitized fixture overwrites the
> 64-byte field at `0x9E` with a scrub placeholder — no real driver identifier is
> present in the repo.

## Channel metadata record — 124 bytes each, singly-linked

Starts at the meta pointer (0x3448). Each record:

| Offset | Type | Field | Notes |
|--------|------|-------|-------|
| 0x00 | u32 | prev pointer | 0 for first |
| 0x04 | u32 | next pointer | 0 ends the list |
| 0x08 | u32 | data pointer | absolute offset into `.ld` |
| 0x0C | u32 | sample count | e.g. 5898 |
| 0x12 | u16 | datatype category | 3 = float-ish, 0 = int |
| 0x14 | u16 | datatype size | **bytes per sample** (1, 2, or 4) |
| 0x16 | u16 | sample rate | **Hz** (10, 20, 25, 50, …) |
| 0x18 | s16 | shift | offset term |
| 0x1A | s16 | mul (multiplier) | |
| 0x1C | s16 | scale | **divisor term** — 1 for 67/70 channels, but 9 or 50 for three (see resolution below) |
| 0x1E | s16 | dec (decimal shift) | power-of-ten divisor |
| 0x20 | char[32] | channel name | e.g. "Ground Speed" |
| 0x40 | char[8] | short name | e.g. "Grd Spd" |
| 0x48 | char[12] | unit | e.g. "km/h" |

## 70 channels confirmed present

All ten agents are fully covered by the real export:

- **Telemetry**: Ground Speed, Throttle/Brake/Clutch Pos, Steering, Engine RPM, Gear, Steering Shaft Torque
- **G-forces**: G Force Lat / Long / Vert (25 Hz)
- **Tire (per corner FL/FR/RL/RR)**: Pressure, Load, Wear, Grip Fract, Ride Height; Temp split Inner/Centre/Outer (12 temp channels)
- **Brakes**: Brake Temp FL/FR/RL/RR, Brake Bias Rear
- **Powertrain/energy**: Fuel Level, Battery Charge Level, Eng Water/Oil Temp
- **Environment**: Ambient Temperature, Track Temperature
- **Wheel**: Wheel Rot Speed FL/FR/RL/RR
- **Lap/markers**: Beacon, Marker, Lap Number, Delta Best, Session Elapsed Time, Max Straight / Min Corner Speed
- **GPS**: Latitude, Longitude

## Value conversion — confirmed working

Per-channel samples are little-endian signed ints of `datatype size` bytes.
The multiplicative part of the formula is **confirmed correct**:

```
phys_partial = raw * mul / 10^dec
```

Verified exactly against:
- **Gear**: raw 0–5 → 0–5 ✓
- **Engine RPM**: raw 0–7996 → 0–7996 rpm (matches the 7,500 rev-limit setup) ✓
- **Ground Speed**: with standstill-baseline subtraction → 0–246 km/h (physically correct for GTE at COTA) ✓

## RESOLVED — the additive offset and the scale term

Three channels originally proved there's a per-channel **additive offset** not yet
pinned to a byte:
- Throttle: raw ±25000 → needs +25000 to read 0–100 %
- G Force Lat: reads 7.6–12.1 G → needs centering near 0
- Fuel Level: reads negative → needs offset

**Confirmed against the real bytes** (see `fixtures/FIXTURE_NOTES.md`): the complete
formula is

```
phys = raw * mul / (scale * 10^dec) + shift
```

`shift` (0x18) is the additive term above. `scale` (0x1C) is `1` for 67 of the 70
channels — which is why it looked inert — but Ambient Temperature and Track
Temperature use `50`, and Steering Wheel Position uses `9`. Dropping `scale` is
what previously made the two temperature channels decode to nonsense (−265 °C /
+251 °C instead of the correct ~29–39 °C); they still carry `reliable=False` for a
separate, known LMU offset issue, but the scale math itself is now correct. The
production Python parser applies both terms; **the JS port must add `scale`** (it
already has `shift`; omitting it is what causes the `CAL` badges on 9 channels).

**Datatype note (also resolved):** no datatype-category-3 channel is float32.
Category/size pairs present: (cat 0, size 2) × 1 = int16; (cat 3, size 1) × 2 = int8;
(cat 3, size 2) × 65 = int16; (cat 5, size 4) × 2 = int32 — the two GPS channels are
the only 4-byte samples, and they are int32, not float32 (reading them as float32
produces ±1e38 garbage). No float branch is needed anywhere in an LMU export.

## `.svm` setup format — REQUIRES PARSER REWRITE

The real `.svm` is **nothing like** the format the v1 parser assumed.
Actual format (INI-style, CRLF line endings):

```
VehicleClassSetting="Ferrari_488_GTE_EVO GTE WEC2023"
[FRONTWING]
FWSetting=0//Standard
[REARWING]
RWSetting=5//P6
[CONTROLS]
BrakePressureSetting=28//68 kgf  (85%)
[DRIVELINE]
DiffPowerSetting=8//40%
[FRONTLEFT]
PressureSetting=0//140 kPa
RideHeightSetting=0//5.0 cm
```

Key realities:
- `[SECTION]` headers group parameters (GENERAL, FRONTWING, REARWING, BODYAERO,
  SUSPENSION, CONTROLS, ENGINE, DRIVELINE, FRONTLEFT/RIGHT, REARLEFT/RIGHT, BASIC).
- Each line is `KeySetting=N//human-readable`. **N is a click-index**, not the value.
  The real engineering value is in the `//` comment ("40%", "68 kgf (85%)", "5.0 cm").
- Energy branch confirmed in real data: the **GTE** file has `FuelSetting`/
  `FuelCapacitySetting` only; the **LMGT3 296** file additionally has
  `VirtualEnergySetting=100//100% (26.6 laps)`. The data-model branch is real.
- Tire pressures are **per corner** in `[FRONTLEFT]`…`[REARRIGHT]` as
  `PressureSetting=0//140 kPa`.
- `VehicleClassSetting` gives car + class + ruleset in one line — free metadata.

The v1 `setup.py` parser must be rewritten to this INI + comment-extraction model.
The Setup ORM model columns remain valid; only the parser changes.

## `.ldx` vs `.ld` — which wins for lap data (resolved 21 Aug 2026)

The two files describe laps differently and can disagree. The rule:

| Fact | Authoritative source | Why |
| --- | --- | --- |
| Lap **boundaries** / segmentation | **`.ld`** (Beacon / Lap Number channels) | The `.ldx` carries **no** per-lap markers at all — only a summary. |
| Lap **count**, fastest lap **number** and **time** | **`.ldx`** | Pre-decoded by MoTeC and finer than the `.ld`'s sample grid. |

**When they disagree, the `.ldx` value is displayed and the disagreement is
flagged in the UI** — never silently reconciled, never hidden
(`WORKING_PLAN.md` §4). Implemented in `frontend/src/lib/lapReconciliation.js`.

Two real cases, both found on production data during the 21 Aug acceptance run:

- **Sub-sample drift.** The COTA upload's `.ldx` reports the fastest lap as
  135.475 s; beacon segmentation computes 135.500 s for the same lap. 25 ms —
  less than one sample period. Not a conflict, so it is **not** flagged
  (`DRIFT_TOLERANCE_S = 0.05`); flagging it would fire on nearly every upload.
  The `.ldx` figure is shown for that lap so the lap row and the "Fastest lap"
  stat agree instead of differing by hundredths.
- **Unsupportable summary.** The committed fixture's `.ld` is truncated to 300
  samples while its `.ldx` is the full original, so the summary claims 3 laps
  with lap 2 fastest while the trace yields a single *partial* segment. There is
  no lap 2 to point at. This is flagged `FASTEST LAP UNVERIFIED` +
  `LAP COUNT DISAGREES`, and every seeded demo session hits it.

**Consequence for code:** never test "is this the best lap?" with
`lap.lap_no === session.fastest_lap_no`. On a session whose summary names a
missing lap that marks nothing and explains nothing. Use `isFastestLap()`,
which matches only against laps that exist *and* are timed — a summary pointing
at an out-lap is as unsupported as one pointing at nothing.
