"""Canada contracts scraper.

NOTE: The Open Canada proactive disclosure CSV (contracts over $10K) is ~400MB+
      and is not in the CKAN datastore, so keyword search via API is unavailable.
      The search.open.canada.ca ElasticSearch endpoint times out externally.

      Canadian Palantir contracts are captured via Google News RSS and DDG queries.
      The historical contracts already in data.js cover known CA contracts.

To re-enable: investigate if CanadaBuys (canadabuys.canada.ca) has an API,
or register for ProxyApi access to the open.canada.ca ElasticSearch endpoint.
"""
import requests
from datetime import datetime


def scrape():
    items = _scrape_canadabuys()
    print(f"[canada] {len(items)} items")
    return items


def _scrape_canadabuys():
    """Try CanadaBuys public tender notice API."""
    # CanadaBuys replaced BuyandsellGC; attempt their search API
    urls = [
        "https://canadabuys.canada.ca/en/api/tender-notices?q=palantir&limit=50",
        "https://canadabuys.canada.ca/api/v1/notices?q=palantir",
    ]
    for url in urls:
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)",
                         "Accept": "application/json"},
                timeout=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                items = _parse_canadabuys(data)
                if items is not None:
                    return items
        except Exception as e:
            print(f"[canada] {url[:50]} error: {e}")

    print("[canada] API unavailable — CA contracts captured via Google News/DDG")
    return []


def _parse_canadabuys(data):
    if not data:
        return None
    records = (
        data.get("results")
        or data.get("data")
        or data.get("items")
        or []
    )
    if not isinstance(records, list) or not records:
        return None

    import hashlib
    items = []
    for rec in records:
        contract_id = str(rec.get("id") or rec.get("reference_number") or "")
        title = (
            rec.get("title")
            or rec.get("description_en")
            or "Canadian Federal Contract"
        )
        dept = rec.get("buyer_name") or rec.get("owner_org_title") or ""
        vendor = rec.get("vendor_name", "")
        value_cad = 0
        try:
            value_cad = float(rec.get("contract_value") or 0)
        except (ValueError, TypeError):
            pass
        date_str = str(rec.get("contract_date") or rec.get("date") or "")[:10]

        uid = hashlib.sha256(f"canada-{contract_id}".encode()).hexdigest()[:16]
        snippet = dept
        if vendor:
            snippet += f" \u00b7 {vendor}"
        if value_cad:
            snippet += f" \u00b7 CAD ${value_cad:,.0f}"

        items.append({
            "id": uid,
            "source": "CanadaBuys / Open Canada",
            "source_type": "contract_api",
            "category": "official",
            "title": str(title)[:120],
            "snippet": snippet[:200],
            "url": (
                f"https://canadabuys.canada.ca/en/tender-notices/{contract_id}"
                if contract_id
                else "https://canadabuys.canada.ca"
            ),
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": str(dept),
                "country": "Canada",
                "value": round(value_cad / 1_000_000 * 0.74, 2) if value_cad else None,
                "year": int(date_str[:4]) if len(date_str) >= 4 else None,
            },
        })
    return items
