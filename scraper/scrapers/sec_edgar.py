import hashlib
import requests
from datetime import datetime, timedelta


PALANTIR_CIK = "0001321655"


def scrape():
    # Fetch Palantir's own recent 8-K filings from EDGAR
    url = f"https://data.sec.gov/submissions/CIK{PALANTIR_CIK}.json"

    try:
        resp = requests.get(url, timeout=30,
                            headers={"User-Agent": "palantir-dashboard-research/1.0 research@example.com"})
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[sec_edgar] Error fetching submissions: {e}")
        return []

    filings = data.get("filings", {}).get("recent", {})
    forms = filings.get("form", [])
    dates = filings.get("filingDate", [])
    accessions = filings.get("accessionNumber", [])
    descriptions = filings.get("primaryDocument", [])
    items_list = filings.get("items", [])

    cutoff = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")

    items = []
    for i, form in enumerate(forms):
        if form not in ("8-K", "8-K/A"):
            continue
        date_str = dates[i] if i < len(dates) else ""
        if date_str < cutoff:
            continue

        accession = accessions[i] if i < len(accessions) else ""
        accession_clean = accession.replace("-", "")
        doc = descriptions[i] if i < len(descriptions) else ""
        filing_items = items_list[i] if i < len(items_list) else ""

        uid = hashlib.sha256(f"edgar-{accession}".encode()).hexdigest()[:16]
        edgar_url = f"https://www.sec.gov/Archives/edgar/data/{int(PALANTIR_CIK)}/{accession_clean}/{doc}" if doc else f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={PALANTIR_CIK}&type=8-K"

        items.append({
            "id": uid,
            "source": "SEC EDGAR",
            "source_type": "sec_filing",
            "category": "official",
            "title": f"Palantir 8-K Filing — {date_str}",
            "snippet": f"Form {form} · Items: {filing_items}" if filing_items else f"Form {form} · {accession}",
            "url": edgar_url,
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": None,
        })

    print(f"[sec_edgar] {len(items)} items")
    return items
