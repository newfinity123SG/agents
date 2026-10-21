#!/usr/bin/env python3
"""Nonpublishing migration guard tests for original Palm Beach Times v6 files."""
from pathlib import Path
import importlib.util
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "assets" / "newspaper-template.html"
SCRIPTS = ROOT / "scripts"


class MigrationBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = TEMPLATE.read_text(encoding="utf-8")

    def test_canonical_template_signature(self):
        self.assertIn('data-layout="pbt-broadsheet-v6"', self.template)
        self.assertIn('data-skill-build="pbt-v6.0"', self.template)

    def test_template_contains_required_slots(self):
        slots = ("MASTHEAD_LOGO", "WEATHER_OCEAN_DESK", "DAILY_JOKE_TILE",
                 "MARKET_CHARTS", "MARKET_DRIVERS", "COMIC_TILE",
                 "RESTAURANT_OPENINGS_TILE", "SCREEN_GUIDE_TILE")
        for slot in slots:
            with self.subTest(slot=slot):
                self.assertIn("{{" + slot + "}}", self.template)

    def test_original_assembly_and_validation_scripts_present(self):
        scripts = ("validate_edition.py", "publish_preflight.py",
                   "embed_masthead_image.py", "embed_comic_image.py",
                   "render_market_charts.py", "read_publish_payload.py")
        for filename in scripts:
            with self.subTest(filename=filename):
                self.assertTrue((SCRIPTS / filename).is_file())

    def test_validator_rejects_unrendered_template(self):
        spec = importlib.util.spec_from_file_location("pbt_validate", SCRIPTS / "validate_edition.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        errors = module.validate(self.template)
        self.assertTrue(errors, "Unrendered HTML should not be publishable")
        self.assertTrue(any("placeholder" in item.lower() for item in errors))

    def test_no_live_scheduler_or_delivery_action_in_migration_package(self):
        self.assertFalse((ROOT / "wrangler.toml").exists(),
                         "Never attach staging source package to production bindings by default.")


if __name__ == "__main__":
    unittest.main()
