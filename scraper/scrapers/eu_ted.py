import hashlib
import requests
from datetime import datetime


def scrape():
    url = "https://api.ted.europa.eu/v3/notices/search"
    payload = {
        "query": "palantir",
        "fields": ["ND", "TI", "AU", "DT", "VT"],
        "page": 1,
        "limit": 50,
    }

    try:
        resp = requests.post(url, json=payload, timeout=30,
                             headers={"Accept": "application/json",
                                      "Content-Type": "application/json"})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[eu_ted] Error: {e}")
        return []

    items = []
    for notice in data.get("notices", []):
        nd = notice.get("ND", "")
        title = notice.get("TI", {}).get("EN") or notice.get("TI", {}).get("FR") or "EU/NATO Contract"
        authority = notice.get("AU", "")
        date_str = notice.get("DT", "")[:10]
        value = notice.get("VT")

        uid = hashlib.sha256(f"ted-{nd}".encode()).hexdigest()[:16]

        snippet_parts = [authority]
        if value:
            snippet_parts.append(f"€{float(value):,.0f}")
        snippet = " · ".join(filter(None, snippet_parts))

        items.append({
            "id": uid,
            "source": "EU TED",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": snippet,
            "url": f"https://ted.europa.eu/udl?uri=TED:NOTICE:{nd}:TEXT:EN:HTML" if nd else "https://ted.europa.eu",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(authority),
                "country": "EU/NATO",
                "value": round(float(value) / 1_000_000 * 1.08, 2) if value else None,  # approx USD
                "year": int(date_str[:4]) if date_str else None,
            },
        })

    print(f"[eu_ted] {len(items)} items")
    return items
