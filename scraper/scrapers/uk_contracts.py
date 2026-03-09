import hashlib
import requests
from datetime import datetime


def scrape():
    url = "https://www.contractsfinder.service.gov.uk/Published/Notices/PublicSearch/json"
    params = {
        "noticeType": "contract award",
        "keyword": "palantir",
        "page": 0,
        "size": 50,
    }

    try:
        resp = requests.get(url, params=params, timeout=30,
                            headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[uk_contracts] Error: {e}")
        return []

    items = []
    for notice in data.get("notices", []):
        title = notice.get("title", "UK Government Contract")
        org = notice.get("organisationName", "")
        value_low = notice.get("valueLow") or 0
        value_high = notice.get("valueHigh") or value_low
        value_gbp = (value_low + value_high) / 2 if value_high else value_low
        published = notice.get("publishedDate", "")[:10]
        notice_id = notice.get("id", "")
        award_date = notice.get("awardedDate", published)[:10]

        uid = hashlib.sha256(f"uk-{notice_id}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "UK Contracts Finder",
            "source_type": "contract_api",
            "category": "official",
            "title": title[:120],
            "snippet": f"{org} · £{value_gbp:,.0f}" if value_gbp else f"{org}",
            "url": f"https://www.contractsfinder.service.gov.uk/Notice/{notice_id}" if notice_id else "https://www.contractsfinder.service.gov.uk",
            "date": award_date or published,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": org,
                "country": "United Kingdom",
                "value": round(value_gbp / 1_000_000 * 1.27, 2) if value_gbp else None,  # approx USD
                "year": int(published[:4]) if published else None,
            },
        })

    print(f"[uk_contracts] {len(items)} items")
    return items
