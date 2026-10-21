"""Historical October 16 production market input: preflight and v6 chart integration."""
import json
import re
import unittest
from pathlib import Path
from scripts.check_market_input import verify
from scripts.render_market_charts import render

FIXTURE = Path(__file__).parent / "fixtures" / "market_input_2026-10-16.json"

class HistoricalChartIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_saved_market_input_passes_preflight(self):
        result = verify(self.data)
        self.assertTrue(result["pass"], result["errors"])
        self.assertEqual(result["sessionDate"], "2026-10-15")
        self.assertEqual({k: v["points"] for k, v in result["counts"].items()},
                         {"sp500": 79, "dow": 79, "nasdaq": 79})

    def test_original_renderer_produces_rich_v6_charts(self):
        html = render(self.data)
        self.assertEqual(html.count('class="market-chart"'), 3)
        self.assertEqual(html.count('data-point-count="79"'), 3)
        self.assertEqual(html.count('class="market-volume-panel"'), 3)
        self.assertEqual(html.count('class="market-reference-line"'), 3)
        self.assertGreaterEqual(html.count('class="market-volume-bar"'), 237)
        self.assertIn('data-market-style="raw-intraday-volume"', html)
        self.assertIn("Session 2026-10-15", html)
        self.assertNotIn("{{", html)
        self.assertEqual(html, render(self.data))

    def test_mutated_data_fails_preflight_before_render(self):
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        for point in data["indices"][0]["points"]:
            point["volume"] = 0
        self.assertFalse(verify(data)["pass"])

if __name__ == "__main__":
    unittest.main()
