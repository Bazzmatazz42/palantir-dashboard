"""UK Contracts Finder / Find a Tender scraper.

NOTE: Both Contracts Finder and Find a Tender APIs have been restructured.
      The old JSON endpoints (/Published/Notices/PublicSearch/json) return 404.
      The new FTS OCDS API endpoint also returns 404 without proper authentication.

      For now this scraper returns 0 items. UK Palantir contracts are captured
      via Google News RSS and DDG queries in the RSS/web_search scrapers.

To re-enable: investigate the current API docs at:
  - https://www.contractsfinder.service.gov.uk/apidocumentation/
  - https://www.find-tender.service.gov.uk/
"""
import hashlib
import requests
from datetime import datetime

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; PalantirDashboardBot/1.0)",
    "Accept": "application/json",
}


def scrape():
    items = _scrape_find_a_tender()
    print(f"[uk_contracts] {len(items)} items")
    return items


def _scrape_find_a_tender():
    """Try Find a Tender OCDS API. Fails gracefully if endpoint is unavailable."""
    # Try multiple known endpoint patterns
    attempts = [
        ("GET", "https://www.find-tender.service.gov.uk/api/1.0/ocds/opportunities/",
         {"q": "palantir", "limit": 50}),
        ("GET", "https://www.find-tender.service.gov.uk/api/1.0/ocds/opportunities",
         {"q": "palantir", "limit": 50}),
    ]
    for method, url, params in attempts:
        try:
            resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                return _parse_fts(data)
        except Exception:
            pass

    # All attempts failed — graceful fallback
    print("[uk_contracts] API unavailable — UK contracts captured via Google News/DDG")
    return []


def _parse_fts(data):
    items = []
    for release in data.get("releases", []):
        tender = release.get("tender", {})
        buyer = release.get("buyer", {})
        title = tender.get("title") or "UK Government Contract"
        org = buyer.get("name", "")
        date_str = (release.get("date") or "")[:10]
        ocid = release.get("ocid", "")
        notice_id = ocid.split("-")[-1] if ocid else ""
        value_gbp = (tender.get("value") or {}).get("amount", 0) or 0

        uid = hashlib.sha256(f"uk-fts-{ocid}".encode()).hexdigest()[:16]
        items.append({
            "id": uid,
            "source": "UK Find a Tender",
            "source_type": "contract_api",
            "category": "official",
            "title": title[:120],
            "snippet": f"{org} \u00b7 \u00a3{value_gbp:,.0f}" if value_gbp else org,
            "url": f"https://www.find-tender.service.gov.uk/Notice/{notice_id}" if notice_id else "https://www.find-tender.service.gov.uk",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": org,
                "country": "United Kingdom",
                "value": round(value_gbp / 1_000_000 * 1.27, 2) if value_gbp else None,
                "year": int(date_str[:4]) if date_str else None,
            },
        })
    return items
