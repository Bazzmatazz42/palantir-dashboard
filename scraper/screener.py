"""
Deal/revenue signal screener for the Palantir Dashboard scraper.

Every item from main.py passes through score_item() before routing:
  score >= 3  →  Inbox (pending.js)   — actionable deal/contract intelligence
  score < 3   →  KarpTube (karptube.js) — general media/commentary
"""

# ---------------------------------------------------------------------------
# Auto-pass source types — skip scoring entirely, always go to Inbox.
# NOTE: contract_api is intentionally EXCLUDED — those items are auto-merged
# directly to data.js by main.py, so they never need to go through Inbox.
# ---------------------------------------------------------------------------
INBOX_SOURCE_TYPES = {"sec_edgar"}

# Palantir IR items: pass if text contains any deal term, else KarpTube
PALANTIR_IR_DEAL_TERMS = {
    "contract", "award", "deal", "agreement", "partnership", "procurement",
    "customer", "client", "deployment", "expansion", "renewal", "order",
    "billion", "million",
}

# ---------------------------------------------------------------------------
# Scoring signal lists
# Each list is checked once per tier — first match scores, then move on.
# This prevents a single sentence with 5 synonyms from inflating the score.
# ---------------------------------------------------------------------------

# +3 — explicit contract/procurement language
CONTRACT_SIGNALS = [
    "contract award", "contract awarded", "awarded a contract", "task order",
    "delivery order", "indefinite delivery", "idiq", "blanket purchase agreement",
    "bpa", "sole source", "competitive bid", "solicitation", "rfp ", "rfi ",
    "request for proposal", "request for information", "notice of award",
    "contract modification", "contract vehicle",
]

# +3 — explicit dollar value or commercial metrics
DOLLAR_SIGNALS = [
    " million", " billion", "$m ", "$b ", "m deal", "b deal",
    "total contract value", "tcv", " arr ", "annual recurring revenue",
    "base period", "option period", "ceiling value", "contract ceiling",
    "estimated value", "award amount", "contract amount",
]

# +2 — deal action verbs / event language
DEAL_ACTION_SIGNALS = [
    "awarded", "wins contract", "won contract", "secures contract",
    "selected by", "chosen by", "tapped by", "inks deal",
    "signs agreement", "signs contract", "enters agreement",
    "announces contract", "receives contract", "contract win",
    "new deal", "new contract", "expanded contract", "contract extension",
    "announces deal", "closes deal",
]

# +2 — named government / defense / enterprise customers
CUSTOMER_SIGNALS = [
    # -----------------------------------------------------------------------
    # US Cabinet Departments (current names — DoD renamed to Dept of War 2025)
    # -----------------------------------------------------------------------
    "department of war", "dept of war",          # renamed from DoD
    "department of defense", "dept of defense",  # legacy name still used widely
    " dod ", "pentagon",
    "department of state", "dept of state", "state department",
    "department of the treasury", "dept of the treasury",
    "department of justice", "dept of justice", " doj ",
    "department of the interior", "dept of the interior",
    "department of agriculture", "dept of agriculture", " usda ",
    "department of commerce", "dept of commerce",
    "department of labor", "dept of labor",
    "department of health and human services", " hhs ",
    "department of housing and urban development", " hud ",
    "department of transportation", "dept of transportation", " dot ",
    "department of energy", "dept of energy", " doe ",
    "department of education", "dept of education",
    "department of veterans affairs", "dept of veterans affairs", " dva ",
    "department of homeland security", "dept of homeland security", " dhs ",

    # -----------------------------------------------------------------------
    # US Military Branches & Combatant Commands
    # -----------------------------------------------------------------------
    "u.s. army", "us army", "u.s. navy", "us navy",
    "u.s. air force", "us air force", "u.s. marines", "us marines",
    "u.s. space force", "us space force", "u.s. coast guard", "us coast guard",
    "national guard", "army reserve", "naval reserve",
    "special operations command", " socom ", " jsoc ",
    "centcom", "indopacom", "eucom", "northcom", "southcom",
    "africom", "transcom", "stratcom", "cybercom", "spacecom",
    "defense advanced research", " darpa ",
    "missile defense agency", " mda ",
    "defense information systems", " disa ",
    "defense logistics agency", " dla ",
    "defense threat reduction", " dtra ",
    "defense contract management", " dcma ",
    "defense intelligence agency", " dia ",
    "national reconnaissance office", " nro ",
    "national geospatial-intelligence", " nga ",

    # -----------------------------------------------------------------------
    # US Intelligence Community
    # -----------------------------------------------------------------------
    "intelligence community", " ic ",
    "central intelligence agency", " cia ",
    "national security agency", " nsa ",
    "office of the director of national intelligence", " odni ",
    "defense intelligence agency", " dia ",
    "drug enforcement administration", " dea ",

    # -----------------------------------------------------------------------
    # US Law Enforcement & Border / Immigration
    # -----------------------------------------------------------------------
    " fbi ", "federal bureau of investigation",
    " atf ", "bureau of alcohol, tobacco",
    "u.s. marshals", "us marshals",
    "bureau of prisons", " bop ",
    "customs and border protection", " cbp ",
    "immigration and customs enforcement", " ice ",
    "transportation security administration", " tsa ",
    "secret service", "u.s. secret service",
    "border patrol",

    # -----------------------------------------------------------------------
    # US Health, Science & Civilian Agencies
    # -----------------------------------------------------------------------
    "centers for disease control", " cdc ",
    "national institutes of health", " nih ",
    "food and drug administration", " fda ",
    "centers for medicare", " cms ",
    "federal emergency management", " fema ",
    "environmental protection agency", " epa ",
    "national aeronautics and space", "nasa",
    "national institute of standards", " nist ",
    "national oceanic and atmospheric", "noaa",
    "securities and exchange commission", " sec ",
    "federal trade commission", " ftc ",
    "federal communications commission", " fcc ",
    "federal aviation administration", " faa ",
    "general services administration", " gsa ",
    "office of personnel management", " opm ",
    "social security administration", " ssa ",
    "small business administration", " sba ",
    "u.s. postal service", "usps",
    "nuclear regulatory commission", " nrc ",
    "u.s. patent and trademark", " uspto ",

    # -----------------------------------------------------------------------
    # International — Allied governments & militaries
    # -----------------------------------------------------------------------
    # UK
    "ministry of defence", " mod ", "nhs",
    "gchq", "mi6", "mi5",
    "uk government", "british army", "british government",
    "royal navy", "royal air force", "british forces",
    # NATO & Europe
    "nato", "european commission", "eu commission",
    "german army", "bundeswehr", "german government",
    "french army", "armée de terre", "french government",
    "dutch government", "netherlands ministry",
    "polish army", "polish government",
    "norwegian armed forces",
    "danish defence",
    # Middle East / Asia-Pacific
    "israeli defense forces", "idf", "israeli government",
    "saudi arabia", "uae government", "emirates",
    "japanese self-defense", "jsdf", "japanese government",
    "australian defence force", "adf", "australian government",
    "new zealand defence",
    # Ukraine & Eastern Europe
    "ukraine", "ukrainian armed forces", "ukrainian government",
    # Canada
    "canadian armed forces", "department of national defence",
    "public services and procurement canada",

    # -----------------------------------------------------------------------
    # Prime contractors (Palantir as subcontractor / teaming partner)
    # -----------------------------------------------------------------------
    "lockheed martin", "raytheon", "northrop grumman", "booz allen",
    "leidos", "general dynamics", "saic", "l3harris",
    "bae systems", "boeing defense", "mantech", "perspecta",
    "accenture federal", "deloitte federal", "ibm federal",
]

# +1 — expansion / renewal / partnership language
EXPANSION_SIGNALS = [
    "expands", "expansion", "renewal", "renews", "extends", "extension",
    "new customer", "new client", "partnership", " mou ", "memorandum",
    "pilot program", "proof of concept", " poc ", "deployment", "deployed",
    "implements", "implementation", "enterprise license", "go-live",
    "commercial agreement", "government agreement", "strategic agreement",
]

# +1 — financial results or forward guidance with business context
BUSINESS_SIGNALS = [
    "revenue growth", "bookings", "remaining deal value", " rdv ",
    "net new contract", "commercial win", "government win",
    "total revenue", "u.s. commercial", "government revenue",
    "customer count", "customer growth", "boot camp", "aip deployment",
]

# Noise penalty — subtract 2 per signal if present AND score is still low
# (won't kill a genuinely high-scoring item)
NOISE_SIGNALS = [
    "stock price", "share price", "price target", "analyst rating",
    "buy rating", "sell rating", "overvalued", "undervalued",
    "retail investor", "hedge fund", "short seller", "short interest",
    "options chain", "earnings play", "trading strategy",
    "technical analysis", "support level", "resistance level",
    "reddit", "wsb", "wallstreetbets", "meme stock", "satire",
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def score_item(item):
    """
    Returns (score: int, reason: str).
    score >= 3 → route to Inbox
    score <  3 → route to KarpTube
    """
    source_type = item.get("source_type", "")
    source = item.get("source", "")

    # NOTE: contract_api items are auto-merged directly to data.js by main.py
    # and do NOT reach the Inbox. INBOX_SOURCE_TYPES now only covers sec_edgar.

    # Auto-pass: SEC filings always go to Inbox
    if source_type in INBOX_SOURCE_TYPES:
        return 10, f"auto-pass: {source_type}"

    # --- Mandatory Palantir mention gate ---
    # ALL non-auto-pass items must explicitly mention Palantir or PLTR.
    # This prevents generic financial news (Match Group, Nature's Sunshine, etc.)
    # from scoring into the Inbox just because their snippets contain " million".
    text = (item.get("title", "") + " " + item.get("snippet", "")).lower()
    if "palantir" not in text and "pltr" not in text:
        return 0, "no Palantir mention"

    # Palantir IR: pass only if deal terms present
    if source_type == "palantir_ir" or "palantir ir" in source.lower():
        matched = [t for t in PALANTIR_IR_DEAL_TERMS if t in text]
        if matched:
            return 8, f"auto-pass: Palantir IR with deal terms ({', '.join(matched[:3])})"
        return 1, "Palantir IR — no deal terms found"

    # Keyword scoring for RSS / web / X items
    # text is already computed above
    score = 0
    reasons = []

    _check(text, CONTRACT_SIGNALS,    3, "contract signal", reasons)
    _check(text, DOLLAR_SIGNALS,      3, "dollar signal",   reasons)
    _check(text, DEAL_ACTION_SIGNALS, 2, "deal action",     reasons)
    _check(text, CUSTOMER_SIGNALS,    2, "customer",        reasons)
    _check(text, EXPANSION_SIGNALS,   1, "expansion",       reasons)
    _check(text, BUSINESS_SIGNALS,    1, "business",        reasons)

    # Re-compute score from reasons
    score = sum(r[1] for r in reasons)

    # Noise penalty (only bites if score is marginal)
    noise_hits = [sig for sig in NOISE_SIGNALS if sig in text]
    if noise_hits and score < 5:
        penalty = min(len(noise_hits) * 2, score)  # never go negative
        score -= penalty
        reasons.append((f"noise penalty ({', '.join(noise_hits[:2])})", -penalty))

    reason_str = "; ".join(f"{label} +{pts}" if pts > 0 else f"{label} {pts}"
                           for label, pts in reasons) if reasons else "no deal signals found"
    return score, reason_str


def is_inbox_item(item):
    """
    Convenience wrapper.
    Returns (should_inbox: bool, score: int, reason: str)
    """
    score, reason = score_item(item)
    return score >= 3, score, reason


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _check(text, signals, points, label, reasons):
    """Check a signal list, append to reasons on first match."""
    for sig in signals:
        if sig in text:
            reasons.append((f"{label}: '{sig}'", points))
            return
