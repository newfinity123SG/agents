#!/usr/bin/env python3
"""Contract regression tests for nonpublishing edition verification."""
from pathlib import Path
import importlib.util
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location(
    "verify_published", ROOT / "scripts" / "verify_published.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PublishedVerificationContract(unittest.TestCase):
    def test_mismatched_routes_rejected_before_parsing(self):
        with self.assertRaisesRegex(ValueError, "bytes differ"):
            mod.verify(b"a", b"a", b"b", "2026-10-14")

    def test_wrong_date_rejected(self):
        sample = b'<html data-edition-date="2026-10-13" data-joke-date="2026-10-13"></html>'
        with self.assertRaisesRegex(ValueError, "Edition date mismatch"):
            mod.verify(sample, sample, sample, "2026-10-14")

    def test_wrong_joke_date_rejected(self):
        sample = b'<html data-edition-date="2026-10-14" data-joke-date="2026-10-13"></html>'
        with self.assertRaisesRegex(ValueError, "Joke date mismatch"):
            mod.verify(sample, sample, sample, "2026-10-14")

    def test_invalid_edition_rejected(self):
        sample = b'<html data-edition-date="2026-10-14" data-joke-date="2026-10-14"></html>'
        with self.assertRaisesRegex(ValueError, "Invalid v6"):
            mod.verify(sample, sample, sample, "2026-10-14")


if __name__ == "__main__":
    unittest.main()
