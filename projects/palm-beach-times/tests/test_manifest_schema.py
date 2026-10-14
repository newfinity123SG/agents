#!/usr/bin/env python3
"""Assert the edition manifest schema exactly matches the locked v6 template."""
import json
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
TEMPLATE=ROOT/"assets"/"newspaper-template.html"
SCHEMA=ROOT/"schema"/"edition-manifest.schema.json"

class SchemaContractTests(unittest.TestCase):
    def test_schema_matches_every_original_template_token(self):
        html=TEMPLATE.read_text(encoding="utf-8")
        expected=set(re.findall(r"\{\{([A-Z0-9_]+)\}\}",html))
        schema=json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertEqual(expected,set(schema["properties"]))
        self.assertEqual(expected,set(schema["required"]))
        self.assertFalse(schema["additionalProperties"])

if __name__=="__main__":
    unittest.main()
