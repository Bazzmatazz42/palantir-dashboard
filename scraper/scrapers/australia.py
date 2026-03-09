import hashlib
import requests
from datetime import datetime


def scrape():
    # AusTender contract notices search
    url = "https://www.tenders.gov.au/Search/ListSearchJson"
    params = {
        "keyword": "palantir",
        "searchFields": "Supplier",
        "noticeType": "CN",  # Contract Notice
        "pageIndex": 1,
        "pageSize": 50,
    }

    try:
        resp = requests.get(url, params=params, timeout=30,
                            headers={
                                "Accept": "application/json",
                                "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)",
                            })
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[australia] Error: {e}")
        return []

    items = []
    for notice in data.get("noticeList", []):
        cn_id = notice.get("cnId", "")
        title = notice.get("publishedDesc", "Australian Contract")
        agency = notice.get("agencyName", "")
        value_aud = notice.get("contractValue") or 0
        date_str = (notice.get("publishDate") or "")[:10]

        uid = hashlib.sha256(f"aus-{cn_id}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "AusTender",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"{agency} · AUD ${float(value_aud):,.0f}" if value_aud else str(agency),
            "url": f"https://www.tenders.gov.au/Cn/Show/{cn_id}" if cn_id else "https://www.tenders.gov.au",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(agency),
                "country": "Australia",
                "value": round(float(value_aud) / 1_000_000 * 0.65, 2) if value_aud else None,  # approx USD
                "year": int(date_str[:4]) if date_str else None,
            },
        })

    print(f"[australia] {len(items)} items")
    return items
