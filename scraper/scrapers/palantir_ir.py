import hashlib
import re
import requests
from datetime import datetime
from bs4 import BeautifulSoup


IR_URL = "https://investors.palantir.com/news-releases"


def scrape():
    try:
        resp = requests.get(IR_URL, timeout=30,
                            headers={"User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)"})
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        print(f"[palantir_ir] Error: {e}")
        return []

    items = []
    # IR pages typically list press releases as <a> links with dates
    for link in soup.find_all("a", href=True):
        href = link["href"]
        if "news-releases-details" not in href and "news-releases/news" not in href:
            continue

        title = link.get_text(strip=True)
        if not title or len(title) < 10:
            continue

        # Build absolute URL
        if href.startswith("http"):
            full_url = href
        else:
            full_url = "https://investors.palantir.com" + href

        # Try to find a nearby date element
        date_str = ""
        parent = link.parent
        if parent:
            date_match = re.search(r"\b(\d{4}[-/]\d{2}[-/]\d{2}|\w+ \d+,? \d{4})\b", parent.get_text())
            if date_match:
                raw_date = date_match.group(1)
                try:
                    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%B %d %Y", "%m/%d/%Y"):
                        try:
                            date_str = datetime.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                            break
                        except ValueError:
                            continue
                except Exception:
                    pass

        uid = hashlib.sha256(f"ir-{full_url}".encode()).hexdigest()[:16]

        items.append({
            "id": uid,
            "source": "Palantir IR",
            "source_type": "press_release",
            "category": "official",
            "title": title[:120],
            "snippet": "Official Palantir investor relations announcement",
            "url": full_url,
            "date": date_str,
            "scraped_at": datetime.utcnow().isoformat() + "Z",
            "contract_data": None,
        })

    # Deduplicate by URL
    seen = set()
    unique = []
    for item in items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)

    print(f"[palantir_ir] {len(unique)} items")
    return unique[:50]
