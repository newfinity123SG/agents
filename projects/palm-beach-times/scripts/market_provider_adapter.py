"""Offline market provider adapter with explicit provenance and failure classes.

This adapter does not call Yahoo or any market endpoint. It receives provider
responses from an authorized collector, transforms them to the locked renderer
contract, and refuses partial, unlicensed, rate-limited or stale inputs.
"""
from __future__ import annotations
from datetime import datetime, timezone
from scripts.market_freshness_gate import assess_market_readiness

KEYS = ("sp500", "dow", "nasdaq")
PROXIES = {"sp500": "SPY", "dow": "DIA", "nasdaq": "QQQ"}

def normalize_market_collection(record, expected_session, edition_date, now_iso):
    if not isinstance(record, dict):
        return {"ready": False, "reason": "no_provider_response", "retryable": True}
    status = record.get("http_status")
    if status == 429:
        return {"ready": False, "reason": "provider_rate_limited", "retryable": True,
                "retryAfter": record.get("retry_after")}
    if not isinstance(status, int) or status != 200:
        return {"ready": False, "reason": "provider_unavailable", "retryable": status in (None, 500, 502, 503, 504)}
    if record.get("usage_permitted") is not True:
        return {"ready": False, "reason": "source_permission_unverified", "retryable": False}
    if record.get("provider") is None or not record.get("retrieved_at"):
        return {"ready": False, "reason": "source_provenance_missing", "retryable": False}
    try:
        received = datetime.fromisoformat(record["retrieved_at"].replace("Z", "+00:00"))
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        if received.tzinfo is None or received > now or (now-received).total_seconds()>86400:
            return {"ready": False, "reason": "collection_timestamp_invalid", "retryable": True}
        entries = record["indices"]
        if not isinstance(entries, list) or len(entries)!=3:
            raise ValueError("three indices required")
        normalized=[]
        for key in KEYS:
            rows=[x for x in entries if isinstance(x,dict) and x.get("key")==key]
            if len(rows)!=1 or rows[0].get("volume_proxy")!=PROXIES[key] or rows[0].get("volume_aligned") is not True:
                raise ValueError("volume proxy unverified")
            normalized.append({"key":key, "previous_close":rows[0]["previous_close"],
                               "points":rows[0]["points"]})
        payload={"session_date": record["session_date"], "as_of":record["as_of"],
                 "source":str(record["provider"])+"; verified "+"/".join(PROXIES.values())+" volume proxies",
                 "indices":normalized}
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"ready": False, "reason": "invalid_provider_payload", "retryable": False}
    check=assess_market_readiness(payload,expected_session,edition_date,now_iso)
    if not check["ready"]:
        return {"ready":False,"reason":"failed_freshness_or_integrity",
                "retryable":False,"failures":check["failures"]}
    return {"ready":True,"reason":"ready","payload":payload,
            "provenance":{"provider":record["provider"],"retrievedAt":record["retrieved_at"],
                          "usagePermitted":True},"publishing":False,"modelTokens":0}
