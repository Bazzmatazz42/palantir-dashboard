import hashlib
import requests
from datetime import datetime


def scrape():
    # Canada Open Government proactive disclosure dataset
    url = "https://search.open.canada.ca/en/ct/search/"
    params = {
        "search_text": "palantir",
        "sort": "score desc",
        "page": 1,
        "num_per_page": 50,
    }

    try:
        resp = requests.get(url, params=params, timeout=30,
                            headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[canada] Primary endpoint error: {e}")
        # Fallback: CKAN open data API
        return _scrape_ckan()

    items = []
    for hit in data.get("hits", {}).get("hits", []):
        src = hit.get("_source", {})
        contract_id = src.get("contract_id", "")
        title = src.get("description_en") or src.get("description_fr") or "Canadian Federal Contract"
        dept = src.get("owner_org_title", "")
        value_cad = src.get("contract_value") or 0
        date_str = (src.get("contract_date") or "")[:10]

        uid = hashlib.sha256(f"canada-{contract_id}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "CanadaBuys / Open Canada",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"{dept} · CAD ${float(value_cad):,.0f}" if value_cad else str(dept),
            "url": f"https://search.open.canada.ca/en/ct/id/{contract_id}" if contract_id else "https://open.canada.ca",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(dept),
                "country": "Canada",
                "value": round(float(value_cad) / 1_000_000 * 0.74, 2) if value_cad else None,  # approx USD
                "year": int(date_str[:4]) if date_str else None,
            },
        })

    print(f"[canada] {len(items)} items")
    return items


def _scrape_ckan():
    url = "https://open.canada.ca/data/en/api/3/action/datastore_search"
    params = {
        "resource_id": "fac950c0-00d5-4ec1-a4d3-9cbebf98a305",
        "q": "palantir",
        "limit": 50,
    }
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[canada] CKAN fallback error: {e}")
        return []

    items = []
    for rec in data.get("result", {}).get("records", []):
        uid = hashlib.sha256(f"canada-ckan-{rec.get('_id', '')}".encode()).hexdigest()[:16]
        items.append({
            "id": uid,
            "source": "CanadaBuys / Open Canada",
            "source_type": "contract_api",
            "category": "official",
            "title": str(rec.get("description_en", "Canadian Contract"))[:120],
            "snippet": rec.get("owner_org_title", ""),
            "url": "https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b",
            "date": str(rec.get("contract_date", ""))[:10],
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": rec.get("owner_org_title", ""),
                "country": "Canada",
                "value": None,
                "year": None,
            },
        })
    print(f"[canada] CKAN fallback: {len(items)} items")
    return items
