"""Deterministic staging retry and cache policy for an authorized market source.

This never fetches a provider. The scheduler may retry transient failures but
must revalidate the complete cached record with the market freshness gate.
"""
from __future__ import annotations

MAX_ATTEMPTS=3
DELAYS_SECONDS=(0,60,240)

def decide_market_retry(attempt, adapter_result, cache_result=None):
    if not isinstance(attempt,int) or isinstance(attempt,bool) or attempt<1:
        return {"action":"fail_closed","reason":"invalid_attempt"}
    if not isinstance(adapter_result,dict):
        return {"action":"fail_closed","reason":"invalid_result"}
    if adapter_result.get("ready") is True:
        return {"action":"accept","reason":"verified_fresh","payload":adapter_result.get("payload")}
    # A cache hit is usable ONLY if it was rechecked against the currently expected exchange session.
    if isinstance(cache_result,dict) and cache_result.get("ready") is True:
        return {"action":"use_verified_cache","reason":"cache_revalidated","payload":cache_result.get("payload")}
    if adapter_result.get("retryable") is not True:
        return {"action":"fail_closed","reason":adapter_result.get("reason","non_retryable")}
    if attempt>=MAX_ATTEMPTS:
        return {"action":"fail_closed","reason":"retry_budget_exhausted"}
    return {"action":"retry","reason":adapter_result.get("reason","transient_error"),
            "delaySeconds":DELAYS_SECONDS[attempt],"nextAttempt":attempt+1}
