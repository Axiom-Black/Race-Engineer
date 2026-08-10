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
| 0xA0 | char | driver name | "Ohioma Eboreime" |
| 0x15E | char | venue | "Circuit of the Americas" |

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
| 0x1C | s16 | scale | |
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

## OPEN ITEM — the additive offset

Three channels prove there's a per-channel **additive offset** not yet pinned to a byte:
- Throttle: raw ±25000 → needs +25000 to read 0–100 %
- G Force Lat: reads 7.6–12.1 G → needs centering near 0
- Fuel Level: reads negative → needs offset

The `shift` field at 0x18 is the likely source but the exact formula
combining shift/scale/mul/dec is not yet locked. **This is the one remaining
decode task** before the parser is production-correct. It's a bounded problem —
solvable against this same file by fitting the formula to the three channels
whose physical range we already know (throttle 0–100, brake 0–100, gear 0–6).

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
