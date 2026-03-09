import hashlib
import feedparser
from datetime import datetime, timezone


def scrape(feeds):
    items = []

    for feed_config in feeds:
        name = feed_config["name"]
        url = feed_config["url"]
        must_mention_palantir = feed_config.get("filter_palantir", True)

        try:
            feed = feedparser.parse(url)
            if feed.bozo and not feed.entries:
                print(f"[rss] Failed to parse {name}: {feed.bozo_exception}")
                continue
        except Exception as e:
            print(f"[rss] Error fetching {name}: {e}")
            continue

        count = 0
        for entry in feed.entries[:20]:
            title = entry.get("title", "")
            summary = entry.get("summary", "") or entry.get("description", "")
            link = entry.get("link", "")

            # Strip HTML tags from summary
            summary_clean = _strip_tags(summary)[:300]

            combined_text = (title + " " + summary_clean).lower()

            if must_mention_palantir and "palantir" not in combined_text:
                continue

            # Parse date
            date_str = ""
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                try:
                    date_str = datetime(*published[:6], tzinfo=timezone.utc).strftime("%Y-%m-%d")
                except Exception:
                    pass

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
