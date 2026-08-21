# Fixture notes — `cota_gte_sanitized` (COTA, Ferrari 488 GTE Evo)

1. **Driver-name offset: `0x9E` is correct, not `0xA0`.** Confirmed by direct
   byte inspection of the real export — `0x9C`/`0x9D` are `\x00`, and the name
   string's first byte lands at `0x9E`. The findings-doc table previously said
   `0xA0` (off by two); `CLAUDE.md`, the JS parser, and the Python reference
   parser's `_DRIVER_OFFSET = 0x9E` were right. `docs/motec-ld-format.md`
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
   `motec-ld-format.md` and `backend/tests/unit/test_motec_parser.py`
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
   cota_gte_sanitized.ld   0f60f6588bf77dd3891acabb1e91573009b4e670b386300ab6d2d5596ef98ef1
   cota_gte_sanitized.ldx  fd4c46ef54b606e7b8329881f32a960cfb6416e29fe776f3882266b09eb15e16
   cota_gte_sanitized.svm  31770f843abbce7ebe50454897c7f08d1463f888ae70794f2c73b01d21018583
   ```

   Reproduce with `sha256sum fixtures/cota_gte_sanitized.*` from the repo root.

6. **The fixture was replaced on 21 Aug 2026 (P0) — read this before trusting
   any older note about it.**

   The previous `.ld` had **every one of the 70 channel records' sample-count
   fields overwritten with `2c01` (= 300 little-endian)**. The telemetry bytes
   were all still present; only the declared counts were falsified, so the
   parser read 300 samples per channel and lap segmentation saw **one partial
   lap**. The file was still 849 KB — the truncation bought no space at all,
   and cost the ability to test anything about laps.

   That is not a hypothetical cost. The old fixture hid two real defects that
   both reached `main`:

   - the **out-lap** reported as a 174.3 s lap the driver never set (17 Aug), and
   - the **`.ldx`/`.ld` lap reconciliation** bug (21 Aug), where the seeded demo
     session advertised a fastest lap that did not exist in its own trace —
     visible to every new account in production.

   Neither was expressible with a single-segment fixture.

   The current `.ld` is the same session with **only** the driver field at
   `0x9E` scrubbed to `DRIVER_REDACTED` (15 bytes, the same length as the real
   name, so no offsets shift). Nothing else is altered. Its shape:

   | Property | Value |
   | --- | --- |
   | Channels | 70 |
   | Total decoded values | **412,850** |
   | Distinct sample counts | 589, 590, 1179, 2359, 2949, 5898, 11796, 14745, 29490 |
   | Lap boundaries | **5** — out-lap, 3 timed laps, trailing partial |
   | Timed lap times | 138.78 s, 135.50 s, 136.20 s |
   | Cross-check | the `.ldx` independently reports Total Laps 3, Fastest Lap 2 |

   The nine distinct sample counts matter: channels log at different rates, so
   any code assuming one uniform count per session is wrong, and this fixture
   now proves it.

   The `.ldx` and `.svm` are **unchanged** — they were already the full,
   sanitized originals (only the `.ld` had been doctored), which is why their
   hashes above are the same as before.

7. **Golden-master format v2 (21 Aug 2026).** `golden_master_ld.json` records a
   **SHA-256 over each channel's complete decoded array** rather than embedding
   every value. Full arrays at 412,850 values would be ~6 MB of committed JSON;
   the hashed form is **33 KB** and covers *every* sample, where storing every
   Nth sample could not see a regression between the samples it kept. Decode
   parameters, count, extremes and the first/last five values are kept in plain
   text so a mismatch is diagnosable rather than merely detected.

   Regenerate with:

   ```
   python backend/scripts/generate_golden_masters.py           # write
   python backend/scripts/generate_golden_masters.py --check   # verify
   ```

   The generator is committed (it previously did not exist, which made "generated
   from exactly these bytes" a promise rather than a check) and `--check` runs in
   CI as part of Ring 1. The Python reference remains the arbiter: the JS port is
   verified against **its** hashes, never the reverse.

   The canonical form the hash is taken over is defined identically in three
   places and must stay byte-identical across all of them — 6 fixed decimals,
   negative zero normalised to zero, joined by `,`, hashed as UTF-8:
   `backend/scripts/generate_golden_masters.py`,
   `backend/tests/unit/test_motec_parser.py`, and
   `frontend/src/lib/motec/golden.test.js`. All 70 channel hashes were confirmed
   to agree between Python and JavaScript.

---

**Erratum (10 Aug 2026, review):** the sentence in §3 saying the temperature
channels "still carry `reliable=False`" is stale — the committed parser removes
the unreliable flag for Ambient/Track Temperature entirely (see
`UNRELIABLE_CHANNELS` in `backend/app/ingest/motec.py`): with the scale term
applied they decode correctly, so the old flag was masking our own decode bug,
not an LMU defect. The golden master records `reliable: true` for both.
`TESTING_GATES.md` G1.3 updated to match.
