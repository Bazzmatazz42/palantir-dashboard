"""EU TED procurement scraper.

NOTE: TED API v3 (api.ted.europa.eu) requires a registered API key.
      TED API v2 was shut down in early 2024.
      Until an API key is configured, this scraper returns 0 items.

To enable: register at https://developer.ted.europa.eu/ for a free API key,
then add TED_API_KEY to GitHub Actions secrets and load it here via
os.environ.get('TED_API_KEY').
"""
import hashlib
import os
import requests
from datetime import datetime


def scrape():
    api_key = os.environ.get("TED_API_KEY", "")
    if not api_key:
        print("[eu_ted] Skipped — TED_API_KEY not set (register at developer.ted.europa.eu)")
        return []
    return _scrape_v3(api_key)


def _scrape_v3(api_key):
    url = "https://api.ted.europa.eu/v3/notices/search"
    payload = {
        "query": "palantir",
        "fields": ["ND", "TI-0000", "AU-1-0000", "DT", "TW"],
        "pagination": {"page": 1, "limit": 50},
        "sort": [{"field": "DT", "order": "desc"}],
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[eu_ted] Error: {e}")
        return []

    items = []
    notices = data.get("notices") or data.get("results") or []
    for notice in notices:
        nd = notice.get("ND", "")
        ti = notice.get("TI-0000") or notice.get("TI") or {}
        if isinstance(ti, dict):
            title = ti.get("ENG") or ti.get("FRA") or next(iter(ti.values()), "EU Contract")
        elif isinstance(ti, list):
            title = ti[0] if ti else "EU Contract"
        else:
            title = str(ti) or "EU Contract"

        au = notice.get("AU-1-0000") or notice.get("AU") or ""
        authority = au[0] if isinstance(au, list) and au else str(au)
        date_str = (notice.get("DT") or "")[:10]
        value = notice.get("TW") or notice.get("VT")

        uid = hashlib.sha256(f"ted-{nd}".encode()).hexdigest()[:16]
        items.append({
            "id": uid,
            "source": "EU TED",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"{authority} \u00b7 \u20ac{float(value):,.0f}" if value else str(authority),
            "url": f"https://ted.europa.eu/udl?uri=TED:NOTICE:{nd}:TEXT:EN:HTML" if nd else "https://ted.europa.eu",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": authority,
                "country": "EU/NATO",
                "value": round(float(value) / 1_000_000 * 1.08, 2) if value else None,
                "year": int(date_str[:4]) if date_str else None,
            },
        })

    print(f"[eu_ted] {len(items)} items")
    return items
