"""AusTender procurement scraper.

NOTE: The AusTender JSON search API (tenders.gov.au/Search/ListSearchJson)
      now returns 404. The replacement API requires authentication.
      Data.gov.au resource IDs for AusTender CN data are no longer accurate.

      AU Palantir contracts are captured via Google News RSS and DDG queries.

To re-enable: check current AusTender API docs at tenders.gov.au or
contact the Digital Transformation Agency for updated API access.
"""
import hashlib
import requests
from datetime import datetime

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, */*",
}


def scrape():
    items = _scrape_austender()
    print(f"[australia] {len(items)} items")
    return items


def _scrape_austender():
    """Try AusTender API. Falls back gracefully if unavailable."""
    url = "https://www.tenders.gov.au/Search/ListSearchJson"
    params = {
        "keyword": "palantir",
        "searchFields": "Supplier,Description",
        "noticeType": "CN",
        "pageIndex": 1,
        "pageSize": 50,
    }
    try:
        resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            return _parse_notices(data)
    except Exception:
        pass

    print("[australia] AusTender API unavailable — AU contracts captured via Google News/DDG")
    return []


def _parse_notices(data):
    items = []
    notices = data.get("noticeList") or data.get("data") or []
    for notice in notices:
        cn_id = notice.get("cnId") or notice.get("id", "")
        title = notice.get("publishedDesc") or notice.get("title") or "Australian Contract"
        agency = notice.get("agencyName") or notice.get("agency", "")
        value_aud = notice.get("contractValue") or 0
        date_str = (notice.get("publishDate") or "")[:10]

        uid = hashlib.sha256(f"aus-{cn_id}".encode()).hexdigest()[:16]
        items.append({
            "id": uid,
            "source": "AusTender",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"{agency} \u00b7 AUD ${float(value_aud):,.0f}" if value_aud else str(agency),
            "url": f"https://www.tenders.gov.au/Cn/Show/{cn_id}" if cn_id else "https://www.tenders.gov.au",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(agency),
                "country": "Australia",
                "value": round(float(value_aud) / 1_000_000 * 0.65, 2) if value_aud else None,
                "year": int(date_str[:4]) if date_str else None,
            },
        })
    return items
