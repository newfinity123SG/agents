import unittest
from datetime import datetime, timedelta, timezone
from scripts.check_market_input import verify

def sample():
    date="2026-10-15"
    start=datetime(2026,10,15,13,30,tzinfo=timezone.utc)
    points=[{"time":(start+timedelta(minutes=5*i)).isoformat(),"value":1000+i,"volume":100+i} for i in range(48)]
    return {"session_date":date,"as_of":"2026-10-15T16:00:00-04:00",
            "source":"Verified market feed with aligned proxies",
            "indices":[{"key":key,"previous_close":995,"points":[dict(x) for x in points]} for key in ("sp500","dow","nasdaq")]}

class MarketInputCheck(unittest.TestCase):
    def test_valid_aligned(self): self.assertTrue(verify(sample())["pass"])
    def test_misaligned(self):
        p=sample()
        p["indices"][1]["points"][0]["time"]="2026-10-15T13:31:00+00:00"
        self.assertIn("index_timestamps_not_aligned",verify(p)["errors"])
    def test_fake_volume(self):
        p=sample()
        for point in p["indices"][0]["points"]:point["volume"]=0
        self.assertIn("sp500:insufficient_positive_volume",verify(p)["errors"])
    def test_wrong_session(self):
        p=sample()
        p["indices"][2]["points"][0]["time"]="2026-10-14T13:30:00+00:00"
        self.assertIn("nasdaq:invalid_point",verify(p)["errors"])

if __name__=="__main__":unittest.main()
