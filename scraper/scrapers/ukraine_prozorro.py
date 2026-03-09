import hashlib
import requests
from datetime import datetime


def scrape():
    # Prozorro public API — search tenders by supplier name
    url = "https://public.api.prozorro.gov.ua/api/2.5/tenders"
    params = {
        "opt_fields": "title,value,procuringEntity,dateModified,status",
        "opt_limit": 50,
        "opt_descending": 1,
    }

    # Prozorro doesn't support free-text supplier search directly;
    # we search the awards endpoint for Palantir as a supplier
    awards_url = "https://public.api.prozorro.gov.ua/api/2.5/awards"

    try:
        resp = requests.get(awards_url, timeout=30,
                            headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[ukraine_prozorro] Error: {e}")
        return []

    items = []
    for award_ref in data.get("data", []):
        award_id = award_ref.get("id", "")
        # Fetch individual award to check supplier
        try:
            detail_resp = requests.get(
                f"https://public.api.prozorro.gov.ua/api/2.5/awards/{award_id}",
                timeout=15
            )
            detail = detail_resp.json().get("data", {})
        except Exception:
            continue

        suppliers = detail.get("suppliers", [])
        supplier_names = [s.get("name", "").lower() for s in suppliers]
        if not any("palantir" in n for n in supplier_names):
            continue

        title = detail.get("title", "Ukrainian Government Contract")
        value_uah = (detail.get("value") or {}).get("amount") or 0
        date_str = (detail.get("date") or "")[:10]
        tender_id = detail.get("bid", {}).get("tenderId", "")

        uid = hashlib.sha256(f"prozorro-{award_id}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "Prozorro (Ukraine)",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": f"UAH {float(value_uah):,.0f}" if value_uah else "Ukrainian procurement",
            "url": f"https://prozorro.gov.ua/tender/{tender_id}" if tender_id else "https://prozorro.gov.ua",
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": "Ukrainian Government",
                "country": "Ukraine",
                "value": round(float(value_uah) / 1_000_000 * 0.024, 2) if value_uah else None,  # approx USD
                "year": int(date_str[:4]) if date_str else None,
            },
        })

    print(f"[ukraine_prozorro] {len(items)} items")
    return items
