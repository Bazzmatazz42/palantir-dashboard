import hashlib
import time
from datetime import datetime

try:
    from ddgs import DDGS
    DDGS_AVAILABLE = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        DDGS_AVAILABLE = True
    except ImportError:
        DDGS_AVAILABLE = False
        print("[web_search] ddgs/duckduckgo-search not installed")

# DDG news queries — ordered by expected yield.
# NOTE: site:x.com/handle queries are disabled (DDG returns no results due
# to X's limited web indexing). General news queries work better.
_NEWS_QUERIES = [
    ("Palantir government contract award", "news"),
    ("Palantir AIP defense military", "news"),
    ("Palantir Technologies news deal", "news"),
    ("Palantir earnings revenue quarterly", "news"),
    ("Palantir DOGE government data", "news"),
    ("Palantir Alex Karp interview statement", "news"),
    ("Palantir NATO military AI", "news"),
    ("Palantir UK Australia Europe contract", "news"),
]

# X-specific general query (broad, no per-handle site: restriction)
_X_QUERIES = [
    ('site:x.com "palantir" contract OR award OR "signed" OR "billion"', "x_search"),
    ('site:x.com "palantir" AIP OR Gotham OR Foundry OR TITAN', "x_search"),
]


def scrape(x_accounts):
    if not DDGS_AVAILABLE:
        return []

    items = []

    with DDGS() as ddgs:
        # --- News queries (high yield, broad coverage) ---
        for query, source_type in _NEWS_QUERIES:
            try:
                results = ddgs.news(query, max_results=8, timelimit="w")
                count = 0
                for r in (results or []):
                    url = r.get("url") or r.get("link") or ""
                    uid = hashlib.sha256(f"ddg-news-{url}".encode()).hexdigest()[:16]
                    date_str = ""
                    raw_date = r.get("date") or r.get("published") or ""
                    if raw_date:
                        date_str = str(raw_date)[:10]
                    items.append({
                        "id": uid,
                        "source": f"Web News — {query[:40]}",
                        "source_type": source_type,
                        "category": "media",
                        "title": (r.get("title") or "")[:120],
                        "snippet": (r.get("body") or r.get("excerpt") or "")[:300],
                        "url": url,
                        "date": date_str,
                        "scraped_at": datetime.utcnow().isoformat() + "Z",
                        "contract_data": None,
                    })
                    count += 1
                print(f"[web_search] '{query}': {count} results")
                time.sleep(1.0)
            except Exception as e:
                print(f"[web_search] Query failed '{query}': {e}")
                time.sleep(2)

        # --- X/Twitter general queries ---
        for query, source_type in _X_QUERIES:
            try:
                results = ddgs.text(query, max_results=10, timelimit="w")
                count = 0
                for r in (results or []):
                    url = r.get("href") or r.get("url") or ""
                    if "x.com" not in url and "twitter.com" not in url:
                        continue
                    uid = hashlib.sha256(f"ddg-x-{url}".encode()).hexdigest()[:16]
                    items.append({
                        "id": uid,
                        "source": "X — Palantir",
                        "source_type": source_type,
                        "category": "media",
                        "title": (r.get("title") or "")[:120],
                        "snippet": (r.get("body") or "")[:300],
                        "url": url,
                        "date": "",
                        "scraped_at": datetime.utcnow().isoformat() + "Z",
                        "contract_data": None,
                    })
                    count += 1
                print(f"[web_search] X search '{query[:50]}': {count} results")
                time.sleep(1.5)
            except Exception as e:
                print(f"[web_search] X query failed: {e}")
                time.sleep(2)

    return items
