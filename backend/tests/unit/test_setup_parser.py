"""
Unit tests for app.ingest.setup.

Clean Agile (TDD): parser tested against fixture strings, no real .svm
file needed on disk for these tests — that's reserved for an integration
test once real sample files are available.
"""

import pytest

from app.ingest.setup import ParsedSetup, parse_filename_metadata, parse_setup


GTE_FIXTURE = """
// Ferrari 488 GTE Evo — Sarthe Race setup
FWing="3.0"
RWing="8.0"
RideHeightFront="55.0"
RideHeightRear="68.0"
SpringFront="180"
SpringRear="160"
BrakeBias="56.5"
DiffPower="45"
DiffCoast="30"
TirePressureFL="27.5"
TirePressureFR="27.5"
TirePressureRL="26.0"
TirePressureRR="26.0"
FuelLoad="92.0"
Gear1="2.917"
Gear2="2.214"
Gear3="1.778"
"""

HYPERCAR_FIXTURE = """
FWing="4.5"
RWing="9.5"
VirtualEnergy="100.0"
BrakeBias="58.0"
"""

MALFORMED_FIXTURE = """
this is not a key value line
FWing=
RWing="8.0"
"""


class TestParseSetup:
    def test_parses_wing_angles(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.front_wing_angle == pytest.approx(3.0)
        assert s.rear_wing_angle == pytest.approx(8.0)

    def test_parses_ride_heights(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.ride_height_front == pytest.approx(55.0)
        assert s.ride_height_rear == pytest.approx(68.0)

    def test_parses_brake_bias(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.brake_bias_pct == pytest.approx(56.5)

    def test_parses_differential(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.diff_power_pct == pytest.approx(45)
        assert s.diff_coast_pct == pytest.approx(30)

    def test_parses_all_four_tire_pressures(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.tire_pressure_fl == pytest.approx(27.5)
        assert s.tire_pressure_fr == pytest.approx(27.5)
        assert s.tire_pressure_rl == pytest.approx(26.0)
        assert s.tire_pressure_rr == pytest.approx(26.0)

    def test_parses_gear_ratios_in_order(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.gear_ratios == [pytest.approx(2.917), pytest.approx(2.214), pytest.approx(1.778)]

    def test_default_energy_type_is_fuel(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert s.energy_type == "fuel"
        assert s.fuel_load_kg == pytest.approx(92.0)

    def test_virtual_energy_type_when_category_is_hypercar(self) -> None:
        s = parse_setup(HYPERCAR_FIXTURE, car_category="Hypercar")
        assert s.energy_type == "virtual_energy"
        assert s.virtual_energy_pct == pytest.approx(100.0)

    def test_virtual_energy_type_when_category_is_lmgt3(self) -> None:
        s = parse_setup(HYPERCAR_FIXTURE, car_category="LMGT3")
        assert s.energy_type == "virtual_energy"

    def test_fuel_type_when_category_is_gte(self) -> None:
        s = parse_setup(GTE_FIXTURE, car_category="GTE")
        assert s.energy_type == "fuel"

    def test_fuel_type_when_category_is_lmp2(self) -> None:
        s = parse_setup(GTE_FIXTURE, car_category="LMP2")
        assert s.energy_type == "fuel"

    def test_unmapped_keys_preserved_in_raw_parsed(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        assert "FWing" in s.raw_parsed
        assert s.raw_parsed["FWing"] == "3.0"

    def test_comments_are_stripped(self) -> None:
        s = parse_setup(GTE_FIXTURE)
        # The comment line shouldn't appear as a parsed key
        assert "Ferrari" not in s.raw_parsed

    def test_malformed_lines_do_not_raise(self) -> None:
        # Should not throw — unparseable lines are simply skipped
        s = parse_setup(MALFORMED_FIXTURE)
        assert isinstance(s, ParsedSetup)

    def test_empty_value_does_not_populate_field(self) -> None:
        s = parse_setup(MALFORMED_FIXTURE)
        assert s.front_wing_angle is None

    def test_valid_line_after_malformed_still_parses(self) -> None:
        s = parse_setup(MALFORMED_FIXTURE)
        assert s.rear_wing_angle == pytest.approx(8.0)

    def test_empty_string_returns_empty_parsed_setup(self) -> None:
        s = parse_setup("")
        assert s.front_wing_angle is None
        assert s.gear_ratios == []
        assert s.raw_parsed == {}

    def test_no_car_category_defaults_to_fuel(self) -> None:
        s = parse_setup(GTE_FIXTURE, car_category=None)
        assert s.energy_type == "fuel"


class TestParseFilenameMetadata:
    def test_extracts_car_and_intent(self) -> None:
        meta = parse_filename_metadata("Ferrari488GTE_qualifying.svm")
        assert meta["car"] == "Ferrari488GTE"
        assert meta["intent"] == "qualifying"

    def test_handles_full_path(self) -> None:
        meta = parse_filename_metadata("UserData/player/Settings/Sarthe/Ferrari488GTE_race.svm")
        assert meta["car"] == "Ferrari488GTE"
        assert meta["intent"] == "race"

    def test_no_intent_keyword_returns_none_intent(self) -> None:
        meta = parse_filename_metadata("Ferrari488GTE_custom01.svm")
        assert meta["intent"] is None

    def test_case_insensitive_intent_match(self) -> None:
        meta = parse_filename_metadata("Porsche911_Race.svm")
        assert meta["intent"] == "Race"
