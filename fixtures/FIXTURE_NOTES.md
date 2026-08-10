# Fixture notes — `cota_gte_sanitized` (COTA, Ferrari 488 GTE Evo)

1. **Driver-name offset: `0x9E` is correct, not `0xA0`.** Confirmed by direct
   byte inspection of the real export — `0x9C`/`0x9D` are `\x00`, and the name
   string's first byte lands at `0x9E`. The findings-doc table previously said
   `0xA0` (off by two); `CLAUDE.md`, the JS parser, and the Python reference
   parser's `_DRIVER_OFFSET = 0x9E` were right. `docs/MoTeC_LD_format_findings.md`
   is corrected to match.

2. **Name field scrubbed, no other PII remains.** The 64-byte driver-name field
   at `0x9E` is overwritten with the literal placeholder `DRIVER_REDACTED\x00…`
   (padded with nulls to the field width) — **not** an all-zero field, so note
   the deviation from "zero the whole field" explicitly here. The placeholder
   carries no real identifier, and `golden_master_ld.json`'s `header.driver`
   matches it byte-for-byte, so fixture and golden master stay consistent.
   Verified with a recursive case-insensitive grep for the real name across
   `fixtures/`, `backend/`, and the rest of the tree (see step 5 below) — the
   only two hits were the two source materials received (a duplicated
   `MoTeC_LD_format_findings.md` and `backend/tests/unit/test_motec_parser.py`
   from the scaffold zip), both scrubbed before anything was committed. GPS
   channels are left as-is — they're game-world coordinates, not real-world
   PII (see `CLAUDE.md`).

3. **The `scale` field (`0x1C`) is real and load-bearing.** Complete decode
   formula: `phys = raw * mul / (scale * 10^dec) + shift`. `scale` is `1` for
   67 of the 70 channels — which is why it looked inert — but Ambient
   Temperature and Track Temperature use `50`, and Steering Wheel Position
   uses `9`. Dropping the term is exactly what made the two temperature
   channels decode to nonsense (−265 °C / +251 °C instead of the correct
   ~29–39 °C); they still carry `reliable=False` for a separate, known LMU
   offset issue, but the scale math itself is now right. The JS port must add
   this term (currently only implements `+ shift`).

4. **No datatype-category-3 channel is float32.** Category/size pairs present
   in this export: (cat 0, size 2) × 1 = int16; (cat 3, size 1) × 2 = int8;
   (cat 3, size 2) × 65 = int16; (cat 5, size 4) × 2 = int32 (GPS Latitude/
   Longitude — the only 4-byte channels). Reading the GPS pair as float32
   produces ±1e38 garbage; int32 gives correct game-world coordinates. The
   JS port's signed-int byte-size mapping (`{1:'b',2:'h',4:'i'}`) is correct
   as-is — no float branch needed anywhere in an LMU export.

5. **SHA-256 of the committed fixture triple** (Ring 4 G4.3 freshness
   anchor — golden masters above were generated from exactly these bytes):

   ```
   cota_gte_sanitized.ld   cc9b76ad8e02ee574657f4d0498a3161c7d23904ec1d9540fe8fc1b273dc1f7b
   cota_gte_sanitized.ldx  fd4c46ef54b606e7b8329881f32a960cfb6416e29fe776f3882266b09eb15e16
   cota_gte_sanitized.svm  31770f843abbce7ebe50454897c7f08d1463f888ae70794f2c73b01d21018583
   ```

   Reproduce with `sha256sum fixtures/cota_gte_sanitized.*` from the repo root.
