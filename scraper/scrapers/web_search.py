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


def scrape(x_accounts):
    if not DDGS_AVAILABLE:
        return []

    items = []

    # Batch accounts into two query types:
    # 1. High-priority accounts — search their X profile directly
    # 2. General Palantir news search (catches anything not from accounts)

    priority_handles = [
        a["handle"] for a in x_accounts
        if a.get("tier") == 1 or a.get("category") in ("official", "leadership")
    ]

    queries = []

    # Per-account queries for high-priority accounts
    for handle in priority_handles[:10]:  # limit to avoid rate limits
        queries.append({
            "q": f'site:x.com/{handle} palantir',
            "label": f"@{handle} (X)",
            "category": "x_search",
        })

    # General X search for palantir contract news
    queries.append({
        "q": 'site:x.com "palantir" ("contract" OR "award" OR "billion" OR "million") -is:retweet',
        "label": "X — Palantir contract news",
        "category": "x_search",
    })

    # General web news (catches non-X sources too)
    queries.append({
        "q": 'palantir "contract" OR "award" site:breakingdefense.com OR site:defenseone.com OR site:fedscoop.com',
        "label": "Defense media — Palantir contracts",
        "category": "web_search",
    })

    with DDGS() as ddgs:
        for query_config in queries:
            try:
                results = ddgs.text(
                    query_config["q"],
                    max_results=8,
                    timelimit="d",  # last 24 hours
                )
                count = 0
                for r in (results or []):
                    uid = hashlib.sha256(f"ddg-{r.get('href', '')}".encode()).hexdigest()[:16]
                    items.append({
                        "id": uid,
                        "source": query_config["label"],
                        "source_type": query_config["category"],
                        "category": "media",
                        "title": (r.get("title") or "")[:120],
                        "snippet": (r.get("body") or "")[:300],
                        "url": r.get("href", ""),
                        "date": "",  # DuckDuckGo doesn't reliably return dates
                        "scraped_at": datetime.utcnow().isoformat() + "Z",
                        "contract_data": None,
                    })
                    count += 1
                print(f"[web_search] '{query_config['label']}': {count} results")
                time.sleep(1.5)  # be polite to DDG
            except Exception as e:
                print(f"[web_search] Query failed '{query_config['q']}': {e}")
                time.sleep(3)

    return items
