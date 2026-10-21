import json
import unittest
from pathlib import Path
from scripts.market_provider_adapter import normalize_market_collection

FIXTURE=Path(__file__).parent/"fixtures"/"market_input_2026-10-16.json"
NOW="2026-10-16T07:00:00-04:00"
def record():
    p=json.loads(FIXTURE.read_text())
    return {"http_status":200,"usage_permitted":True,"provider":"Authorized historical regression fixture",
            "retrieved_at":"2026-10-16T06:30:00-04:00","session_date":p["session_date"],
            "as_of":p["as_of"],"indices":[{**row,"volume_proxy":v,"volume_aligned":True}
            for row,v in zip(p["indices"],("SPY","DIA","QQQ"))]}
def check(r):
    return normalize_market_collection(r,"2026-10-15","2026-10-16",NOW)
class MarketProviderAdapterTests(unittest.TestCase):
    def test_valid_fixture(self): self.assertTrue(check(record())["ready"])
    def test_rate_limit(self):
        r=check({"http_status":429,"retry_after":"120"})
        self.assertEqual(r["reason"],"provider_rate_limited")
        self.assertTrue(r["retryable"])
    def test_no_permission(self):
        r=record();r["usage_permitted"]=False
        self.assertEqual(check(r)["reason"],"source_permission_unverified")
    def test_bad_proxy(self):
        r=record();r["indices"][0]["volume_proxy"]="QQQ"
        self.assertEqual(check(r)["reason"],"invalid_provider_payload")
    def test_stale_session(self):
        r=record();r["session_date"]="2026-10-14"
        self.assertFalse(check(r)["ready"])
    def test_missing_data(self): self.assertFalse(check(None)["ready"])
if __name__=="__main__":unittest.main()
