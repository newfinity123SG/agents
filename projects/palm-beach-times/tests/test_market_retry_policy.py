import unittest
from scripts.market_retry_policy import decide_market_retry

class RetryTests(unittest.TestCase):
 def test_success(self):
  self.assertEqual(decide_market_retry(1,{"ready":True,"payload":{"test":1}})["action"],"accept")
 def test_retry_budget(self):
  self.assertEqual(decide_market_retry(1,{"ready":False,"retryable":True})["delaySeconds"],60)
  self.assertEqual(decide_market_retry(2,{"ready":False,"retryable":True})["delaySeconds"],240)
  self.assertEqual(decide_market_retry(3,{"ready":False,"retryable":True})["action"],"fail_closed")
 def test_rate_limit_retry(self):
  self.assertEqual(decide_market_retry(1,{"ready":False,"retryable":True,"reason":"provider_rate_limited"})["action"],"retry")
 def test_cache_not_implicitly_approved(self):
  self.assertEqual(decide_market_retry(3,{"ready":False,"retryable":True},{"ready":False})["action"],"fail_closed")
 def test_validated_cache_allowed(self):
  self.assertEqual(decide_market_retry(3,{"ready":False,"retryable":True},{"ready":True,"payload":{"ok":True}})["action"],"use_verified_cache")
 def test_non_retryable(self):
  self.assertEqual(decide_market_retry(1,{"ready":False,"retryable":False,"reason":"source_permission_unverified"})["action"],"fail_closed")

if __name__=="__main__":unittest.main()
