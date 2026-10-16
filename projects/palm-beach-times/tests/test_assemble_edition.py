#!/usr/bin/env python3
"""Fail-closed newspaper assembly tests: do not construct fake daily editions."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from assemble_edition import assemble, PLACEHOLDER, TEMPLATE


class AssemblyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = TEMPLATE.read_text(encoding="utf-8")
        cls.required = set(PLACEHOLDER.findall(cls.template))

    def test_manifest_missing_all_fields_fails(self):
        with self.assertRaisesRegex(ValueError, "Missing required template fields"):
            assemble({"DATE_ISO": "2026-10-14"}, self.template)

    def test_unrecognized_field_fails(self):
        with self.assertRaisesRegex(ValueError, "Unknown template fields"):
            assemble(dict.fromkeys(self.required, "test") | {"DATE_ISO": "2026-10-14", "EXTRA_FIELD": "test"}, self.template)

    def test_invalid_date_fails(self):
        with self.assertRaises((ValueError, TypeError)):
            assemble({"DATE_ISO": "2026-02-30"}, self.template)

    def test_not_a_valid_paper_even_when_placeholders_all_present(self):
        values = dict.fromkeys(self.required, "TEST FRAGMENT")
        values["DATE_ISO"] = "2026-10-14"
        with self.assertRaisesRegex(ValueError, "Strict v6 validation failed|Generated edition date|Joke edition date"):
            assemble(values, self.template)

    def test_reject_injected_script_fragment(self):
        values = dict.fromkeys(self.required, "TEST FRAGMENT")
        values["DATE_ISO"] = "2026-10-14"
        values["FRONT_PAGE"] = "<script>alert('bad')</script>"
        with self.assertRaisesRegex(ValueError, "Executable scripts prohibited"):
            assemble(values, self.template)


if __name__ == "__main__":
    unittest.main()
