#!/usr/bin/env python3
"""
Palantir Dashboard — Historical Content Pre-loader
Fetches 4 years of content (Sept 2020 — present) from:
  - YouTube channels (yt-dlp, full video metadata, no download)
  - Substack newsletters (public API, full post history)
  - Reddit subreddits (JSON API, paginated)

Writes to palantir-dashboard/karptube.js — extends existing content.
Run once manually; daily scraper handles incremental updates after.
"""
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DASHBOARD_DIR = os.path.join(ROOT, "palantir-dashboard")
KARPTUBE_JS_PATH = os.path.join(DASHBOARD_DIR, "karptube.js")

# Palantir listed on NYSE: 30 Sep 2020
CUTOFF_DATE = "2020-09-30"
CUTOFF_TS = datetime(2020, 9, 30, tzinfo=timezone.utc)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
    )
}

# ---------------------------------------------------------------------------
# YouTube channels (full video history via yt-dlp)
# ---------------------------------------------------------------------------

YOUTUBE_CHANNELS = [
    {
        "name": "Palantir Tech (Official)",
        "url": "https://www.youtube.com/@palantirtech/videos",
        "source_type": "video",
        "filter_palantir": False,
    },
    {
        "name": "Code and Connor",
        "url": "https://www.youtube.com/@codestrap8031/videos",
        "source_type": "video",
        "filter_palantir": False,
    },
    {
        "name": "Palantir Bullets (Arny Trezzi)",
        "url": "https://www.youtube.com/@ArnyTrezzi/videos",
        "source_type": "video",
        "filter_palantir": False,
    },
    {
        "name": "Palantir Weekly (Amit Kukreja)",
        "url": "https://www.youtube.com/@AmitKukreja/videos",
        "source_type": "video",
        "filter_palantir": False,
    },
    {
        "name": "American Optimist (Joe Lonsdale)",
        "url": "https://www.youtube.com/@Joe_Lonsdale/videos",
        "source_type": "video",
        "filter_palantir": True,  # broad channel, filter to Palantir content
    },
]


def fetch_youtube_channel(channel):
    """Use yt-dlp to extract video metadata without downloading."""
    try:
        import yt_dlp
    except ImportError:
        print("[youtube] yt-dlp not installed — run: pip install yt-dlp")
        return []

    name = channel["name"]
    url = channel["url"]
    must_mention = channel.get("filter_palantir", False)

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,      # metadata only, no download
        "ignoreerrors": True,
        "dateafter": "20200930",   # from PLTR listing
    }

    items = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                print(f"[youtube] {name}: no info returned")
                return []

            entries = info.get("entries") or []
            count = 0
            for entry in entries:
                if not entry:
                    continue

                title = entry.get("title") or ""
                video_url = entry.get("webpage_url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}"
                description = (entry.get("description") or "")[:300]
                upload_date = entry.get("upload_date") or ""  # YYYYMMDD
                duration = entry.get("duration") or 0

                # Date check
                date_str = ""
                if upload_date and len(upload_date) == 8:
                    date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
                    if date_str < CUTOFF_DATE:
                        continue

                # Palantir filter
                combined = (title + " " + description).lower()
                if must_mention and "palantir" not in combined and "pltr" not in combined:
                    continue

                uid = hashlib.sha256(f"yt-{entry.get('id', video_url)}".encode()).hexdigest()[:16]

                snippet = description[:280]
                if duration:
                    mins = int(duration) // 60
                    snippet = f"{mins}m video. {snippet}".strip()

                items.append({
                    "id": uid,
                    "source": name,
                    "source_type": "video",
                    "category": "media",
                    "title": title[:160],
                    "snippet": snippet[:400],
                    "url": video_url,
                    "date": date_str,
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                })
                count += 1

            print(f"[youtube] {name}: {count} videos (from {len(entries)} total)")
    except Exception as e:
        print(f"[youtube] {name} error: {e}")

    return items


# ---------------------------------------------------------------------------
# Substack newsletters (public API, full history)
# ---------------------------------------------------------------------------

SUBSTACK_SOURCES = [
    {
        "name": "First Breakfast",
        "subdomain": "firstbreakfast",
        "filter_palantir": False,
    },
    {
        "name": "Arny Trezzi (Palantir Bullets)",
        "subdomain": "arnytrezzi",
        "filter_palantir": False,
    },
    {
        "name": "Amit Kukreja",
        "subdomain": "amitsdeepdives",
        "filter_palantir": False,
    },
    {
        "name": "Big Technology (Alex Kantrowitz)",
        "subdomain": "bigtechnology",
        "filter_palantir": True,
    },
    {
        "name": "Import AI (Jack Clark)",
        "subdomain": "importai",
        "filter_palantir": True,
    },
    {
        "name": "Nonzero Newsletter",
        "subdomain": "nonzero",
        "filter_palantir": True,
    },
]


def fetch_substack(source):
    """Fetch full post history via Substack's public archive API."""
    name = source["name"]
    subdomain = source["subdomain"]
    must_mention = source.get("filter_palantir", False)
    base_url = f"https://{subdomain}.substack.com/api/v1/archive"

    items = []
    offset = 0
    page_size = 50

    while True:
        try:
            resp = requests.get(
                base_url,
                params={"sort": "new", "limit": page_size, "offset": offset},
                headers=HEADERS,
                timeout=20,
            )
            if resp.status_code != 200:
                print(f"[substack] {name}: HTTP {resp.status_code}")
                break
            posts = resp.json()
            if not posts:
                break
        except Exception as e:
            print(f"[substack] {name} error: {e}")
            break

        stopped_early = False
        for post in posts:
            post_date = (post.get("post_date") or post.get("published_at") or "")[:10]
            if post_date and post_date < CUTOFF_DATE:
                stopped_early = True
                break

            title = post.get("title") or ""
            subtitle = post.get("subtitle") or ""
            slug = post.get("slug") or ""
            post_url = post.get("canonical_url") or f"https://{subdomain}.substack.com/p/{slug}"

            combined = (title + " " + subtitle).lower()
            if must_mention and "palantir" not in combined and "pltr" not in combined:
                continue

            uid = hashlib.sha256(f"sub-{subdomain}-{slug}".encode()).hexdigest()[:16]
            items.append({
                "id": uid,
                "source": name,
                "source_type": "newsletter",
                "category": "media",
                "title": title[:160],
                "snippet": subtitle[:400],
                "url": post_url,
                "date": post_date,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })

        if stopped_early or len(posts) < page_size:
            break

        offset += page_size
        time.sleep(0.4)

    print(f"[substack] {name}: {len(items)} posts")
    return items


# ---------------------------------------------------------------------------
# Reddit (JSON API, time-based pagination)
# ---------------------------------------------------------------------------

REDDIT_SOURCES = [
    {"name": "r/PLTR", "subreddit": "PLTR"},
    {"name": "r/palantir", "subreddit": "palantir"},
]


def fetch_reddit(source):
    """Fetch Reddit posts via public JSON API, paginated back to cutoff."""
    name = source["name"]
    subreddit = source["subreddit"]
    url = f"https://www.reddit.com/r/{subreddit}/new.json"

    items = []
    after = None

    for page in range(40):  # max 40 pages × 100 = 4000 posts
        params = {"limit": 100, "sort": "new"}
        if after:
            params["after"] = after

        try:
            resp = requests.get(url, params=params, headers={
                **HEADERS,
                "Accept": "application/json",
            }, timeout=20)
            if resp.status_code == 429:
                time.sleep(5)
                continue
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[reddit] {name} page {page}: {e}")
            break

        posts = data.get("data", {}).get("children", [])
        after = data.get("data", {}).get("after")

        stopped_early = False
        for post_wrap in posts:
            p = post_wrap.get("data", {})
            created_utc = p.get("created_utc", 0)
            post_dt = datetime.fromtimestamp(created_utc, tz=timezone.utc)
            if post_dt < CUTOFF_TS:
                stopped_early = True
                break

            date_str = post_dt.strftime("%Y-%m-%d")
            title = p.get("title") or ""
            selftext = (p.get("selftext") or "")[:300]
            post_url = p.get("url") or f"https://reddit.com{p.get('permalink', '')}"
            score = p.get("score", 0)

            uid = hashlib.sha256(f"reddit-{p.get('id', '')}".encode()).hexdigest()[:16]
            items.append({
                "id": uid,
                "source": name,
                "source_type": "blog",
                "category": "media",
                "title": title[:160],
                "snippet": f"Score: {score}. {selftext}".strip()[:400],
                "url": post_url,
                "date": date_str,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })

        if stopped_early or not after:
            break

        time.sleep(1.0)  # Reddit rate limit

    print(f"[reddit] {name}: {len(items)} posts")
    return items


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def load_existing():
    if not os.path.exists(KARPTUBE_JS_PATH):
        return []
    with open(KARPTUBE_JS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    start = content.find("[")
    end = content.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    try:
        return json.loads(content[start:end])
    except Exception:
        return []


def write_karptube(items):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    content = (
        f"// Auto-generated by preload_history.py. Last updated: {ts}\n"
        f"window.KARPTUBE_ITEMS = {json.dumps(items, indent=2, ensure_ascii=False)};\n"
    )
    with open(KARPTUBE_JS_PATH, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"\n[preload] Written {len(items)} items to karptube.js")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    print(f"[preload] Starting historical pre-load at {datetime.now(timezone.utc).isoformat()}Z")
    print(f"[preload] Fetching content from {CUTOFF_DATE} onwards\n")

    existing = load_existing()
    existing_ids = {item["id"] for item in existing}
    print(f"[preload] Existing karptube.js: {len(existing)} items\n")

    all_new = []

    # --- YouTube ---
    print("=== YouTube Channels ===")
    for ch in YOUTUBE_CHANNELS:
        items = fetch_youtube_channel(ch)
        for item in items:
            if item["id"] not in existing_ids:
                all_new.append(item)
                existing_ids.add(item["id"])
        time.sleep(2)

    # --- Substack ---
    print("\n=== Substack Newsletters ===")
    for src in SUBSTACK_SOURCES:
        items = fetch_substack(src)
        for item in items:
            if item["id"] not in existing_ids:
                all_new.append(item)
                existing_ids.add(item["id"])
        time.sleep(1)

    # --- Reddit ---
    print("\n=== Reddit ===")
    for src in REDDIT_SOURCES:
        items = fetch_reddit(src)
        for item in items:
            if item["id"] not in existing_ids:
                all_new.append(item)
                existing_ids.add(item["id"])
        time.sleep(1)

    print(f"\n[preload] {len(all_new)} new items collected")

    # Merge with existing, sort newest first
    merged = all_new + existing
    merged.sort(
        key=lambda x: x.get("date") or x.get("scraped_at") or "",
        reverse=True,
    )

    # No cap on preload — keep everything
    write_karptube(merged)
    print(f"[preload] Done. Total karptube.js: {len(merged)} items")
    print(f"[preload] Breakdown: YouTube + Substack + Reddit added {len(all_new)} historical items")


if __name__ == "__main__":
    run()
