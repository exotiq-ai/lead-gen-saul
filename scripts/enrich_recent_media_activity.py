#!/usr/bin/env python3
from __future__ import annotations

"""Enrich Exotiq leads with recent public media/activity hooks.

No paid APIs, no sends, no deletes. Writes only leads.score_breakdown JSON fields.
Sources tried, in order:
- Public Instagram profile metadata/embedded page text, when an IG handle/url exists.
- Company-specific Google News RSS for PR/news.
- Large-fleet partnership/event queries: influencers, celebrities, brand partnerships, launches, rallies, and events.
- Website homepage OpenGraph/title fallback for a business-observation hook.

The script is intentionally conservative: it stores source URL/date/fetched_at/confidence
and never pretends a weak website observation is an IG/news item.
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv
from supabase import create_client

TENANT_ID = "00000000-0000-0000-0000-000000000001"
OUTDIR = Path.home() / ".hermes" / "work" / "exotiq-enrichment"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(value: str | None, limit: int = 220) -> str | None:
    if not value:
        return None
    text = unescape(re.sub(r"\s+", " ", value)).strip()
    text = re.sub(r"\bLog in.*", "", text, flags=re.I).strip()
    if not text or len(text) < 12:
        return None
    return text[:limit].rstrip(" ,.;")


def first_text(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def ig_handle_from_breakdown(sb: dict[str, Any]) -> str | None:
    raw = first_text(
        sb.get("company_ig_handle"), sb.get("instagram_handle"), sb.get("ig_handle"),
        sb.get("instagram_url"), sb.get("instagram_profile_url"), sb.get("instagram"),
    )
    if not raw:
        return None
    m = re.search(r"instagram\.com/([^\s/?#]+)/?", raw, re.I)
    if m:
        return m.group(1).strip("/@")
    m = re.search(r"@([A-Za-z0-9._]+)", raw)
    if m:
        return m.group(1).strip("/@")
    if re.fullmatch(r"[A-Za-z0-9._]{2,40}", raw.strip()):
        return raw.strip("@/")
    return None


def fetch(url: str, timeout: int = 2) -> str | None:
    try:
        r = SESSION.get(url, timeout=timeout)
        if r.status_code >= 400:
            return None
        return r.text[:600_000]
    except requests.RequestException:
        return None


def meta_content(html: str, *names: str) -> str | None:
    for name in names:
        patterns = [
            rf'<meta[^>]+property=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
            rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.I)
            if m:
                return clean_text(m.group(1))
    return None


def latest_instagram_summary(handle: str) -> dict[str, Any] | None:
    url = f"https://www.instagram.com/{handle}/"
    html = fetch(url)
    if not html:
        return None
    desc = meta_content(html, "og:description", "description")
    if not desc:
        return None
    # Public IG often exposes profile bio/counts but not latest posts without auth.
    return {
        "latest_instagram_post_summary": desc,
        "latest_instagram_post_url": url,
        "latest_instagram_post_observed_at": now_iso(),
        "latest_instagram_post_fetched_at": now_iso(),
        "latest_instagram_post_confidence": "LOW_PROFILE_METADATA",
        "personalization_hook_source": "instagram_profile_metadata",
    }


def company_tokens(company: str) -> list[str]:
    stop = {"exotic", "exotics", "rental", "rentals", "luxury", "car", "cars", "auto", "miami", "new", "york", "los", "angeles", "billionaires", "beach", "premium", "luxe"}
    return [t for t in re.findall(r"[a-z0-9]+", company.lower()) if len(t) >= 4 and t not in stop]


def google_news_search(company: str, location: str | None, extra_terms: str, summary_key: str, source: str) -> dict[str, Any] | None:
    query = f'"{company}" {extra_terms}'
    if location:
        query += f" {location}"
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=en-US&gl=US&ceid=US:en"
    xml = fetch(url)
    if not xml:
        return None
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    tokens = company_tokens(company)
    if not tokens:
        return None
    for item in root.findall("./channel/item")[:5]:
        title = clean_text(item.findtext("title"), 180)
        if not title:
            continue
        title_l = title.lower()
        if not all(t in title_l for t in tokens):
            continue
        link = item.findtext("link")
        pub = item.findtext("pubDate")
        published = None
        if pub:
            try:
                published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
            except Exception:
                published = None
        return {
            summary_key: title,
            f"{summary_key.removesuffix('_summary')}_url": link,
            f"{summary_key.removesuffix('_summary')}_published_at": published,
            f"{summary_key.removesuffix('_summary')}_fetched_at": now_iso(),
            f"{summary_key.removesuffix('_summary')}_confidence": "MEDIUM_GOOGLE_NEWS_RSS_COMPANY_MATCH",
            "personalization_hook_source": source,
        }
    return None


def google_news(company: str, location: str | None) -> dict[str, Any] | None:
    return google_news_search(company, location, "exotic rental", "latest_news_pr_summary", "google_news_rss")


def partnership_news(company: str, location: str | None) -> dict[str, Any] | None:
    terms = [
        "influencer OR celebrity OR creator exotic rental",
        "brand partnership OR partnership OR collaboration exotic rental",
        "event OR launch OR rally OR grand opening exotic rental",
    ]
    for term in terms:
        hit = google_news_search(
            company,
            location,
            term,
            "latest_brand_partnership_summary",
            "google_news_rss_partnership_event",
        )
        if hit:
            return hit
    return None


def fleet_size_from_breakdown(sb: dict[str, Any]) -> int:
    raw = sb.get("fleet_size") or sb.get("estimated_fleet_size") or sb.get("fleet_count")
    try:
        return int(float(str(raw)))
    except (TypeError, ValueError):
        return 0


def is_large_fleet(lead: dict[str, Any]) -> bool:
    sb = lead.get("score_breakdown") or {}
    return (lead.get("score") or 0) >= 80 or fleet_size_from_breakdown(sb) >= 20


def website_observation(domain: str | None) -> dict[str, Any] | None:
    if not domain:
        return None
    dom = domain.strip().rstrip("/.,)")
    if not dom or any(bad in dom for bad in ("instagram.com", "facebook.com", "turo.com")):
        return None
    url = dom if re.match(r"https?://", dom, re.I) else f"https://{dom}"
    html = fetch(url)
    if not html:
        return None
    title = meta_content(html, "og:title", "twitter:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
        title = clean_text(m.group(1) if m else None, 120)
    desc = meta_content(html, "og:description", "description")
    summary = clean_text(". ".join([x for x in [title, desc] if x]), 220)
    if not summary:
        return None
    return {
        "latest_business_observation_summary": summary,
        "latest_business_observation_url": url,
        "latest_business_observation_fetched_at": now_iso(),
        "latest_business_observation_confidence": "LOW_WEBSITE_METADATA",
        "personalization_hook_source": "website_metadata",
    }


def should_refresh(sb: dict[str, Any], max_age_days: int) -> bool:
    fetched = first_text(
        sb.get("latest_instagram_post_fetched_at"),
        sb.get("latest_news_pr_fetched_at"),
        sb.get("latest_business_observation_fetched_at"),
    )
    if not fetched:
        return True
    try:
        dt = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
    except ValueError:
        return True
    return (datetime.now(timezone.utc) - dt).days >= max_age_days


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant-id", default=TENANT_ID)
    ap.add_argument("--limit", type=int, default=60)
    ap.add_argument("--min-score", type=int, default=40)
    ap.add_argument("--max-age-days", type=int, default=14)
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--include-public-ig", action="store_true", help="Try unauthenticated public Instagram metadata. Off by default because IG often blocks/omits latest posts.")
    ap.add_argument("--include-website-fallback", action="store_true", help="Also store low-confidence website metadata when no IG/news signal is found")
    ap.add_argument("--sleep", type=float, default=0.5)
    args = ap.parse_args()

    load_dotenv(".env.local")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 2
    db = create_client(url, key)
    OUTDIR.mkdir(parents=True, exist_ok=True)

    fields = "id, company_name, company_domain, company_location, score, score_breakdown"
    resp = db.table("leads").select(fields).eq("tenant_id", args.tenant_id).gte("score", args.min_score).order("score", desc=True).limit(args.limit).execute()
    leads = resp.data or []

    backup_path = OUTDIR / f"recent_media_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    backup_path.write_text(json.dumps(leads, indent=2, default=str))

    updated = 0
    skipped_fresh = 0
    no_signal = 0
    audit: list[dict[str, Any]] = []
    for lead in leads:
        sb = lead.get("score_breakdown") or {}
        if not should_refresh(sb, args.max_age_days):
            skipped_fresh += 1
            continue
        patch: dict[str, Any] | None = None
        handle = ig_handle_from_breakdown(sb) if args.include_public_ig else None
        if handle:
            patch = latest_instagram_summary(handle)
            time.sleep(args.sleep)
        if not patch and is_large_fleet(lead):
            patch = partnership_news(lead.get("company_name") or "", lead.get("company_location"))
            time.sleep(args.sleep)
        if not patch:
            patch = google_news(lead.get("company_name") or "", lead.get("company_location"))
            time.sleep(args.sleep)
        if not patch and args.include_website_fallback:
            patch = website_observation(lead.get("company_domain"))
            time.sleep(args.sleep)
        if not patch:
            no_signal += 1
            audit.append({"id": lead["id"], "company_name": lead.get("company_name"), "status": "no_recent_public_signal"})
            continue
        new_sb = {**sb, **patch}
        audit.append({"id": lead["id"], "company_name": lead.get("company_name"), "status": "updated" if args.live else "would_update", "patch": patch})
        if args.live:
            db.table("leads").update({"score_breakdown": new_sb, "updated_at": now_iso()}).eq("id", lead["id"]).eq("tenant_id", args.tenant_id).execute()
        updated += 1

    audit_path = OUTDIR / f"recent_media_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    audit_path.write_text(json.dumps(audit, indent=2, default=str))
    print(json.dumps({
        "live": args.live,
        "selected": len(leads),
        "updated_or_would_update": updated,
        "skipped_fresh": skipped_fresh,
        "no_signal": no_signal,
        "backup": str(backup_path),
        "audit": str(audit_path),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
