#!/usr/bin/env python3
"""
Source Registry — single source of truth for all scraper sources.
Loads sources_master.json, provides typed views, tracks stats.
"""
import json
import os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY_PATH = os.path.join(ROOT, "palantir-dashboard", "sources_master.json")
JS_PATH = os.path.join(ROOT, "palantir-dashboard", "sources_master.js")

_data = None  # full JSON dict
_by_id = None  # {id: source}


def load():
    global _data, _by_id
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        _data = json.load(f)
    _by_id = {s["id"]: s for s in _data["sources"]}
    return _data


def _ensure_loaded():
    if _by_id is None:
        load()


def get_rss_sources(destinations=None):
    """All active rss_feed / newsletter / blog sources. Returns list of {name, url, filter_palantir, category, id}."""
    _ensure_loaded()
    rss_scrapers = {"rss_feed"}
    sources = [s for s in _by_id.values()
               if s.get("status") == "active" and s.get("scraper") in rss_scrapers]
    if destinations:
        sources = [s for s in sources if s.get("destination") in destinations]
    return sources


def get_youtube_sources():
    """Active YouTube channels with channel_id set (can use RSS)."""
    _ensure_loaded()
    return [s for s in _by_id.values()
            if s.get("status") == "active" and s.get("scraper") == "youtube_rss"
            and s.get("channel_id")]


def get_reddit_sources():
    """Active Reddit sources."""
    _ensure_loaded()
    return [s for s in _by_id.values()
            if s.get("status") == "active" and s.get("scraper") == "reddit_rss"]


def get_x_handles(destinations=None):
    """Active X handle sources. Returns list with handle, tier, category, destination."""
    _ensure_loaded()
    sources = [s for s in _by_id.values()
               if s.get("status") == "active" and s.get("scraper") == "x_ddg"
               and s.get("handle")]
    if destinations:
        sources = [s for s in sources if s.get("destination") in destinations]
    return sources


def get_ddg_queries(destinations=None):
    """Active DDG query sources."""
    _ensure_loaded()
    sources = [s for s in _by_id.values()
               if s.get("status") == "active" and s.get("scraper") == "ddg_web"
               and s.get("query")]
    if destinations:
        sources = [s for s in sources if s.get("destination") in destinations]
    return sources


def get_contract_apis():
    """Active contract API sources (dedicated modules)."""
    _ensure_loaded()
    return [s for s in _by_id.values()
            if s.get("status") == "active" and s.get("type") == "contract_api"]


def get_disclosure_sources():
    """Active SEC and IR sources."""
    _ensure_loaded()
    return [s for s in _by_id.values()
            if s.get("status") == "active" and s.get("type") in ("sec_edgar", "ir_page")]


def update_stats(source_id, count):
    """Call after each scraper run with how many new items this source yielded."""
    _ensure_loaded()
    if source_id not in _by_id:
        return
    src = _by_id[source_id]
    stats = src.setdefault("stats", {"total_items": 0, "last_run": None, "last_count": 0, "history": []})
    stats["last_run"] = datetime.now(timezone.utc).isoformat()
    stats["last_count"] = count
    stats["total_items"] = stats.get("total_items", 0) + count
    history = stats.setdefault("history", [])
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if history and history[-1].get("date") == today:
        history[-1]["count"] = history[-1].get("count", 0) + count
    else:
        history.append({"date": today, "count": count})
    stats["history"] = history[-90:]  # keep 90 days


def save():
    """Write sources_master.json and regenerate sources_master.js."""
    _ensure_loaded()
    _data["sources"] = list(_by_id.values())
    _data["updated"] = datetime.now(timezone.utc).isoformat()
    with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
        json.dump(_data, f, indent=2, ensure_ascii=False)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    js = f"// Auto-generated from sources_master.json. Last updated: {ts}\nwindow.SOURCES_MASTER = {json.dumps(_data, indent=2, ensure_ascii=False)};\n"
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"[source_registry] Saved {len(_by_id)} sources")
