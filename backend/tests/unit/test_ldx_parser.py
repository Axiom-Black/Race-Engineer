"""
Unit tests for app.ingest.ldx.

Fixtures use the REAL values read from the uploaded COTA Ferrari 488 GTE
.ldx file, so these tests verify against ground truth rather than invented
data. Clean Agile (TDD): tests stand alone, no real file needed at run time.
"""

import pytest

from app.ingest.ldx import LdxData, parse_ldx, setup_summary

# Trimmed but faithful slice of the real COTA .ldx — same structure, same values.
REAL_LDX = """<?xml version="1.0"?>
<LDXFile Version="1.6">
 <Layers>
  <Details>
   <String Id="Total Laps" Value="3"/>
   <String Id="Fastest Time" Value="2:15.475"/>
   <String Id="Fastest Lap" Value="2"/>
   <Numeric Id="_Setup_FW" Value="Standard"  Unit="" DPS="0"/>
   <Numeric Id="_Setup_RW" Value="P6"  Unit="" DPS="0"/>
   <Numeric Id="_Setup_BrakePressure" Value="68 kgf  (85"  Unit="%" DPS="3"/>
   <Numeric Id="_Setup_RevLimit" Value="7500"  Unit="" DPS="0"/>
   <Numeric Id="_Setup_DiffPower" Value="40"  Unit="%" DPS="3"/>
   <Numeric Id="_Setup_DiffCoast" Value="100"  Unit="%" DPS="3"/>
   <Numeric Id="_Setup_FLPressure" Value="140"  Unit="kPa" DPS="3"/>
   <Numeric Id="_Setup_FLRideHeight" Value="5.0"  Unit="cm" DPS="3"/>
   <Numeric Id="_Setup_FLSpring" Value="220"  Unit="N/mm" DPS="3"/>
   <Numeric Id="_Setup_RLRideHeight" Value="6.7"  Unit="cm" DPS="3"/>
   <Numeric Id="_Setup_FLCompound" Value="Soft"  Unit="" DPS="0"/>
   <Numeric Id="_Setup_FrontToeOffset" Value="N/A"  Unit="" DPS="0"/>
   <Numeric Id="_Setup_RearAntiSway" Value="0"  Unit="" DPS="0"/>
  </Details>
 </Layers>
</LDXFile>"""


class TestSessionSummary:
    def test_total_laps(self) -> None:
        assert parse_ldx(REAL_LDX).total_laps == 3

    def test_fastest_lap_index(self) -> None:
        assert parse_ldx(REAL_LDX).fastest_lap == 2

    def test_fastest_time_converted_to_seconds(self) -> None:
        # 2:15.475 = 135.475 s
        assert parse_ldx(REAL_LDX).fastest_time_s == pytest.approx(135.475)

    def test_fastest_time_raw_preserved(self) -> None:
        assert parse_ldx(REAL_LDX).fastest_time_raw == "2:15.475"


class TestSetupBlock:
    def test_setup_prefix_stripped(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert "DiffPower" in ldx.setup
        assert "_Setup_DiffPower" not in ldx.setup

    def test_numeric_value_parsed(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["DiffPower"].numeric == pytest.approx(40.0)

    def test_unit_captured(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["FLSpring"].unit == "N/mm"
        assert ldx.setup["FLSpring"].numeric == pytest.approx(220.0)

    def test_non_numeric_value_keeps_string_numeric_none(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["FW"].value == "Standard"
        assert ldx.setup["FW"].numeric is None

    def test_ride_height_rear_differs_from_front(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["FLRideHeight"].numeric == pytest.approx(5.0)
        assert ldx.setup["RLRideHeight"].numeric == pytest.approx(6.7)


class TestTruncationDetection:
    def test_brake_pressure_flagged_truncated(self) -> None:
        # Real MoTeC bug: "68 kgf  (85" — open paren, no close
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["BrakePressure"].truncated is True

    def test_normal_value_not_flagged(self) -> None:
        ldx = parse_ldx(REAL_LDX)
        assert ldx.setup["DiffPower"].truncated is False


class TestSetupSummary:
    def test_skips_na_and_detached(self) -> None:
        summary = setup_summary(parse_ldx(REAL_LDX))
        assert "FrontToeOffset" not in summary   # N/A
        assert "RearAntiSway" not in summary      # value "0"

    def test_includes_real_values_with_units(self) -> None:
        summary = setup_summary(parse_ldx(REAL_LDX))
        assert summary["DiffPower"] == "40 %"
        assert summary["FLSpring"] == "220 N/mm"

    def test_includes_string_valued_setup(self) -> None:
        summary = setup_summary(parse_ldx(REAL_LDX))
        assert summary["FW"] == "Standard"


class TestErrorHandling:
    def test_malformed_xml_raises_valueerror(self) -> None:
        with pytest.raises(ValueError):
            parse_ldx("<LDXFile><not closed")

    def test_missing_details_raises_valueerror(self) -> None:
        with pytest.raises(ValueError):
            parse_ldx('<?xml version="1.0"?><LDXFile Version="1.6"></LDXFile>')

    def test_returns_ldxdata_type(self) -> None:
        assert isinstance(parse_ldx(REAL_LDX), LdxData)

    def test_empty_details_yields_empty_setup(self) -> None:
        xml = '<?xml version="1.0"?><LDXFile><Layers><Details></Details></Layers></LDXFile>'
        ldx = parse_ldx(xml)
        assert ldx.setup == {}
        assert ldx.total_laps is None
