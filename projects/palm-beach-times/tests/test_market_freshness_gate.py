import json
import unittest
from pathlib import Path
from scripts.market_freshness_gate import assess_market_readiness

FIXTURE=Path(__file__).parent / "fixtures" / "market_input_2026-10-16.json"
class MarketFreshnessGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload=json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_friday_morning_uses_real_thursday_close(self):
        result=assess_market_readiness(self.payload,"2026-10-15","2026-10-16","2026-10-16T07:00:00-04:00")
        self.assertTrue(result["ready"],result["failures"])

    def test_newer_expected_session_blocks_reuse(self):
        result=assess_market_readiness(self.payload,"2026-10-16","2026-10-17","2026-10-17T07:00:00-04:00")
        self.assertFalse(result["ready"])
        self.assertIn("wrong_or_stale_trading_session",result["failures"])

    def test_missing_data_fail_closed(self):
        self.assertFalse(assess_market_readiness(None,"2026-10-15","2026-10-16","2026-10-16T07:00:00-04:00")["ready"])

    def test_future_publication_timestamp_blocked(self):
        self.assertFalse(assess_market_readiness(self.payload,"2026-10-15","2026-10-16","2026-10-17T07:00:00-04:00")["ready"])

    def test_expected_session_must_be_provided(self):
        self.assertFalse(assess_market_readiness(self.payload,"","2026-10-16","2026-10-16T07:00:00-04:00")["ready"])

if __name__=="__main__":
    unittest.main()
