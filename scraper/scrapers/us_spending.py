import hashlib
import requests
from datetime import datetime, timedelta, timezone


def scrape():
    url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"

    # Only pull awards from the last 24 hours
    now = datetime.now(timezone.utc)
    yesterday = (now - timedelta(hours=24)).strftime("%Y-%m-%d")
    today = now.strftime("%Y-%m-%d")

    base_payload = {
        "filters": {
            "recipient_search_text": ["Palantir Technologies"],
            "award_type_codes": ["A", "B", "C", "D"],
            "time_period": [{"start_date": yesterday, "end_date": today}],
        },
        "fields": [
            "Award ID", "Recipient Name", "Award Amount",
            "Awarding Agency", "Awarding Sub Agency",
            "Start Date", "End Date", "Description",
            "Contract Award Type", "generated_internal_id",
        ],
        "sort": "Start Date",
        "order": "desc",
        "limit": 100,
        "page": 1,
    }

    all_awards = []
    payload = dict(base_payload)

    for _ in range(3):  # max 3 pages (300 results) — daily volume won't exceed this
        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[us_spending] Error: {e}")
            break

        results = data.get("results", [])
        all_awards.extend(results)
        meta = data.get("page_metadata", {})
        if not meta.get("hasNext") or not results:
            break
        payload.pop("page", None)
        payload["last_record_unique_id"] = meta["last_record_unique_id"]
        payload["last_record_sort_value"] = meta["last_record_sort_value"]

    items = []
    for award in all_awards:
        award_id = award.get("Award ID") or award.get("generated_internal_id") or ""
        title = award.get("Description") or "US Federal Contract Award"
        agency = award.get("Awarding Sub Agency") or award.get("Awarding Agency") or ""
        amount = award.get("Award Amount") or 0
        start = award.get("Start Date") or ""

        uid = hashlib.sha256(f"usaspending-{award_id}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "USASpending.gov",
            "source_type": "contract_api",
            "category": "official",
            "title": title[:120],
            "snippet": f"{agency} · {fmt_amount(amount)} · Award ID: {award_id}",
            "url": f"https://www.usaspending.gov/award/{award_id}" if award_id else "https://www.usaspending.gov",
            "date": start[:10] if start else "",
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": {
                "entity": agency,
                "country": "United States",
                "value": round(amount / 1_000_000, 2) if amount else None,
                "year": int(start[:4]) if start and len(start) >= 4 else None,
            },
        })

    print(f"[us_spending] {len(items)} items (last 24h)")
    return items


def fmt_amount(v):
    if not v:
        return "Undisclosed"
    if v >= 1_000_000_000:
        return f"${v/1_000_000_000:.1f}B"
    if v >= 1_000_000:
        return f"${v/1_000_000:.1f}M"
    return f"${v:,.0f}"
