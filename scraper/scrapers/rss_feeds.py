import hashlib
import feedparser
import requests
from datetime import datetime, timedelta, timezone

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "application/rss+xml, application/atom+xml, "
        "application/xml, text/xml;q=0.9, */*;q=0.8"
    ),
}


def _fetch_feed(url):
    """Fetch feed content via requests then parse with feedparser.
    This handles redirects, HTTPS quirks, and encoding issues
    that feedparser.parse(url) silently fails on."""
    try:
        resp = requests.get(url, timeout=20, headers=_HEADERS)
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"
        feed = feedparser.parse(resp.content)
        return feed, None
    except requests.exceptions.RequestException as e:
        return None, str(e)


def scrape(feeds):
    items = []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    for feed_config in feeds:
        name = feed_config["name"]
        url = feed_config["url"]
        must_mention_palantir = feed_config.get("filter_palantir", True)

        feed, err = _fetch_feed(url)
        if feed is None:
            print(f"[rss] {name}: fetch error — {err}")
            continue
        if feed.bozo and not feed.entries:
            print(f"[rss] {name}: parse error — {feed.bozo_exception}")
            continue

        count = 0
        for entry in feed.entries[:50]:
            title = entry.get("title", "")
            summary = entry.get("summary", "") or entry.get("description", "")
            link = entry.get("link", "")

            # Strip HTML tags from summary
            summary_clean = _strip_tags(summary)[:300]

            combined_text = (title + " " + summary_clean).lower()

            if must_mention_palantir and "palantir" not in combined_text:
                continue

            # Parse date and enforce 24h cutoff
            date_str = ""
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                try:
                    pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
                    if pub_dt < cutoff:
                        continue
                    date_str = pub_dt.strftime("%Y-%m-%d")
                except Exception:
                    pass
            else:
                # No date available — skip to avoid flooding inbox with old undated items
                continue

            uid = hashlib.sha256(f"rss-{link}".encode()).hexdigest()[:16]

            items.append({
                "id": uid,
                "source": name,
                "source_type": "rss",
                "category": feed_config.get("category", "media"),
                "title": title[:120],
                "snippet": summary_clean[:280],
                "url": link,
                "date": date_str,
                "scraped_at": datetime.utcnow().isoformat() + "Z",
                "contract_data": None,
            })
            count += 1

        print(f"[rss] {name}: {count} items")

    return items


def _strip_tags(html):
    import re
    clean = re.sub(r"<[^>]+>", " ", html or "")
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean
