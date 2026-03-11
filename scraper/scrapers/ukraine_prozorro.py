"""Ukraine Prozorro procurement scraper.

The Prozorro public API (public.api.prozorro.gov.ua) no longer exposes
an unauthenticated /awards endpoint. The DoZorro search API is also blocked.

Ukrainian Palantir contracts are captured via Google News RSS and DDG queries.
The historical contracts already in data.js cover known UA contracts.

To re-enable: Prozorro has an authenticated API for bulk data access.
See https://prozorro.gov.ua/en/developers for registration.
"""
import hashlib
import requests
import urllib3
from datetime import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PalantirDashboardBot/1.0)",
    "Accept": "application/json",
}


def scrape():
    items = _try_scrape()
    print(f"[ukraine_prozorro] {len(items)} items")
    return items


def _try_scrape():
    """Try Prozorro search endpoints. Fails gracefully if unavailable."""

    # Try OpenTender Ukraine (alternative search portal)
    alt_urls = [
        "https://opentender.eu/api/tender/search?country=UA&query=palantir&size=20",
        "https://dozorro.org/api/v1/tenders?query=palantir&limit=20",
    ]
    for url in alt_urls:
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=20, verify=False)
            if resp.status_code == 200:
                data = resp.json()
                items = _parse_generic(data)
                if items:
                    return items
        except Exception:
            pass

    print("[ukraine_prozorro] API unavailable — UA contracts captured via Google News/DDG")
    return []


def _parse_generic(data):
    tenders = (
        data.get("data")
        or data.get("hits")
        or data.get("results")
        or data.get("tenders")
        or []
    )
    if not isinstance(tenders, list):
        return []

    items = []
    for t in tenders:
        if isinstance(t, dict) and "_source" in t:
            t = t["_source"]
        tid = t.get("id") or t.get("tenderID", "")
        title = t.get("title") or t.get("description") or "Ukrainian Government Contract"
        entity = ""
        pe = t.get("procuringEntity") or {}
        if isinstance(pe, dict):
            entity = pe.get("name", "Ukrainian Government")
        value_uah = 0
        val = t.get("value") or {}
        if isinstance(val, dict):
            value_uah = val.get("amount", 0) or 0
        date_str = (t.get("date") or t.get("dateModified") or "")[:10]

        # Only include if mentions Palantir
        combined = (str(title) + str(t)).lower()
        if "palantir" not in combined:
            continue

        uid = hashlib.sha256(f"prozorro-{tid}".encode()).hexdigest()[:16]
        items.append({
            "id": uid,
            "source": "Prozorro (Ukraine)",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"UAH {float(value_uah):,.0f}" if value_uah else str(entity),
            "url": f"https://prozorro.gov.ua/tender/{tid}" if tid else "https://prozorro.gov.ua",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(entity),
                "country": "Ukraine",
                "value": round(float(value_uah) / 1_000_000 * 0.024, 2) if value_uah else None,
                "year": int(date_str[:4]) if len(date_str) >= 4 else None,
            },
        })
    return items
