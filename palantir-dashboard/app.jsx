const { useState, useMemo, useCallback } = React;
const { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area, ComposedChart, Line, ReferenceLine } = window.Recharts;

const CONTRACTS = window.CONTRACTS;
const COLORS = window.COLORS;
const PIE_COLORS = window.PIE_COLORS;
const RUN_RATES = window.RUN_RATES;
const PLTR_DOCS = window.PALANTIR_OFFICIAL_DOCS;
const SOURCES_MASTER = window.SOURCES_MASTER || { sources: [] };

const fmt = (v) => {
  if (v === null || v === undefined) return "Undisclosed";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}B`;
  if (v >= 1) return `$${v.toFixed(0)}M`;
  if (v > 0) return `$${(v * 1000).toFixed(0)}K`;
  return "$0";
};

const StatusBadge = ({ status }) => {
  const colors = { Active: COLORS.green, Completed: COLORS.textMuted, "Under Review": COLORS.gold };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${colors[status] || COLORS.textMuted}22`, color: colors[status] || COLORS.textMuted, border: `1px solid ${colors[status] || COLORS.textMuted}44`, letterSpacing: 0.5, textTransform: "uppercase" }}>
      {status}
    </span>
  );
};

const Stat = ({ label, value, sub, color }) => (
  <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "16px 20px", minWidth: 140, flex: 1 }}>
    <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: color || COLORS.accent, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{sub}</div>}
  </div>
);

const TABS = ["Overview", "Explorer", "By Country", "Timeline", "Deal Flow", "Run Rate", "Financials", "PLTR Docs", "Sources", "Feed Hub", "KarpTube", "Inbox"];

// Slice-and-dice treemap: returns array of {x,y,w,h,...item} in 0-100 coordinate space
// scaledValue is used for layout; item.value holds the real count
function computeTreemap(items, x, y, w, h) {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];
  const total = items.reduce((s, d) => s + d._sv, 0);
  let cum = 0, splitIdx = 1;
  for (let i = 0; i < items.length - 1; i++) {
    cum += items[i]._sv;
    splitIdx = i + 1;
    if (cum / total >= 0.5) break;
  }
  const first = items.slice(0, splitIdx);
  const second = items.slice(splitIdx);
  const r = first.reduce((s, d) => s + d._sv, 0) / total;
  if (w >= h) {
    return [...computeTreemap(first, x, y, w * r, h), ...computeTreemap(second, x + w * r, y, w * (1 - r), h)];
  } else {
    return [...computeTreemap(first, x, y, w, h * r), ...computeTreemap(second, x, y + h * r, w, h * (1 - r))];
  }
}

// Notable Palantir events for timeline reference lines
const PALANTIR_EVENTS = [
  { year: 2020, label: "IPO (Sep 2020)", color: "#f59e0b" },
  { year: 2021, label: "S&P 500 attempt", color: "#94a3b8" },
  { year: 2022, label: "Ukraine war contracts", color: "#ef4444" },
  { year: 2023, label: "AIP launch", color: "#06b6d4" },
  { year: 2024, label: "S&P 500 inclusion", color: "#10b981" },
  { year: 2025, label: "DOGE / gov expansion", color: "#f59e0b" },
];

// Shared rich USD formatter
function fmtUSD(v) {
  if (v == null) return "N/A";
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}B`;
  if (v >= 1) return `$${v.toFixed(0)}M`;
  return `$${(v * 1000).toFixed(0)}K`;
}

// Universal contract detail card (used in drill-downs everywhere)
const ContractCard = ({ c, color, onClick }) => {
  const col = color || COLORS.accent;
  const statusColor = { Active: COLORS.green, Completed: COLORS.textMuted, "Under Review": COLORS.gold }[c.status] || COLORS.accent;
  return (
    <div onClick={onClick} style={{ background: `${col}08`, border: `1px solid ${col}30`, borderRadius: 8, padding: 14, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, lineHeight: 1.3, flex: 1, marginRight: 8 }}>{c.entity}</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: col, whiteSpace: "nowrap" }}>{fmtUSD(c.value)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: 9, marginBottom: c.description ? 8 : 0 }}>
        {[["Year", c.year, null], ["Status", c.status, statusColor], ["Sector", c.sector, null], ["Country", c.country, null], ["Product", c.product, null], ["Procurement", c.procurement, null], ["Quarter", c.quarter, null], ["Source", c.source, null]].map(([label, val, fc]) => val ? (
          <div key={label}><span style={{ color: COLORS.textMuted, fontWeight: 600 }}>{label} </span><span style={{ color: fc || COLORS.textDim }}>{val}</span></div>
        ) : null)}
      </div>
      {c.description && <div style={{ fontSize: 9, color: COLORS.textMuted, lineHeight: 1.4, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>{c.description}</div>}
    </div>
  );
};

function PalantirDashboard() {
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("All");
  const [filterCountry, setFilterCountry] = useState("All");
  const [filterSector, setFilterSector] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortCol, setSortCol] = useState("year");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedContract, setSelectedContract] = useState(null);
  const [docsSection, setDocsSection] = useState("earnings");
  const [srcSearch, setSrcSearch] = useState("");
  const [srcCountry, setSrcCountry] = useState("All");
  const [srcType, setSrcType] = useState("All");
  const [srcSort, setSrcSort] = useState("contract");
  const [srcSortDir, setSrcSortDir] = useState("asc");

  // ===== FINANCIALS STATE =====
  const [finView, setFinView] = useState("quarterly");
  const [finDrillQ, setFinDrillQ] = useState(null);
  const [finCat, setFinCat] = useState("Revenue");
  const [finPrimary, setFinPrimary] = useState("rev");
  const [finCompare, setFinCompare] = useState("null");
  const [finRange, setFinRange] = useState("all");
  const [finChartType, setFinChartType] = useState("bar");
  const [finShowEvents, setFinShowEvents] = useState(true);
  const [finMetric, setFinMetric] = useState("revenue"); // legacy, kept for compat

  // ===== KARPTUBE STATE =====
  const [karpItems, setKarpItems] = useState(() => window.KARPTUBE_ITEMS || []);
  const [ktSearch, setKtSearch] = useState("");
  const [ktFilter, setKtFilter] = useState("All");
  const [ktSource, setKtSource] = useState("All");
  const [ktSort, setKtSort] = useState("date_desc");
  const [ktFetching, setKtFetching] = useState(false);
  const [ktLastPulled, setKtLastPulled] = useState(null);
  const [ktLiveCount, setKtLiveCount] = useState(0);
  const [ktFetchStatus, setKtFetchStatus] = useState(""); // per-feed progress message

  // ===== FEED HUB STATE =====
  const [fhSources, setFhSources] = useState(() => {
    const base = SOURCES_MASTER.sources || [];
    try {
      const edits = JSON.parse(localStorage.getItem("feed_hub_edits") || "{}");
      const addedIds = new Set(base.map(s => s.id));
      const newSources = Object.values(edits).filter(e => e._new && !addedIds.has(e.id));
      return [...base.map(s => edits[s.id] ? {...s, ...edits[s.id]} : s), ...newSources];
    } catch { return base; }
  });
  const [fhEdits, setFhEdits] = useState(() => {
    try { return JSON.parse(localStorage.getItem("feed_hub_edits") || "{}"); }
    catch { return {}; }
  });
  const [fhFilter, setFhFilter] = useState({ status: "All", type: "All", dest: "All", search: "" });
  const [fhShowAdd, setFhShowAdd] = useState(false);
  const [fhAddForm, setFhAddForm] = useState({
    name: "", type: "rss", scraper: "rss_feed", destination: "screened",
    url: "", handle: "", channel_id: "", query: "", filter_palantir: true,
    category: "media", description: "", note: "", tier: 2
  });
  const [fhShowExport, setFhShowExport] = useState(false);
  const [fhGhToken, setFhGhToken] = useState(() => localStorage.getItem("feed_hub_gh_token") || "");
  const [fhCommitting, setFhCommitting] = useState(false);
  const [fhCommitStatus, setFhCommitStatus] = useState("");

  // ===== INBOX STATE =====
  const pendingItems = useMemo(() => window.PENDING_ITEMS || [], []);
  const [approved, setApproved] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pltr_approved") || "[]")); }
    catch { return new Set(); }
  });
  const [declined, setDeclined] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("pltr_declined") || "[]")); }
    catch { return new Set(); }
  });
  const [inboxFilter, setInboxFilter] = useState("pending");
  const [inboxSourceFilter, setInboxSourceFilter] = useState("All");
  const [byCountrySort, setByCountrySort] = useState("value");
  const [byCountrySortDir, setByCountrySortDir] = useState("desc");
  const [byCountryContractSort, setByCountryContractSort] = useState("value");
  const [exportModal, setExportModal] = useState(false);
  const [exportCode, setExportCode] = useState("");
  const [sourcesSort, setSourcesSort] = useState("type");
  const [sourcesCatFilter, setSourcesCatFilter] = useState("All");

  // ===== DEAL FLOW STATE =====
  const [procDrill, setProcDrill] = useState(null);
  const [sizeDrill, setSizeDrill] = useState(null);

  // ===== DRILL-DOWN STATES =====
  const [sectorDrill, setSectorDrill] = useState(null);
  const [countryDrillOv, setCountryDrillOv] = useState(null);
  const [yearDrill, setYearDrill] = useState(null);
  const [modalContract, setModalContract] = useState(null);

  // ===== RUN RATE STATE =====
  const [rrSearch, setRrSearch] = useState("");
  const [rrSort, setRrSort] = useState("av");
  const [rrSortDir, setRrSortDir] = useState("desc");
  const [rrSectorFilter, setRrSectorFilter] = useState("All");

  // ===== GLOBAL TIME-SERIES VIEW MODE =====
  const [viewMode, setViewMode] = useState("annual"); // "annual" | "cumulative"

  // ===== GLOBAL DATA FILTERS =====
  const [gYear, setGYear] = useState("All");
  const [gSector, setGSector] = useState("All");
  const [gCountry, setGCountry] = useState("All");

  // ===== DEAL FLOW SIZE MODE =====
  const [sizeMode, setSizeMode] = useState("overview"); // "overview" | "byYear"

  // ===== PER-CHART SORT CONTROLS =====
  const [sectorSort, setSectorSort] = useState("value");
  const [countrySort, setCountrySort] = useState("value");

  const pendingCount = useMemo(
    () => pendingItems.filter(i => !approved.has(i.id) && !declined.has(i.id)).length,
    [pendingItems, approved, declined]
  );

  const handleApprove = useCallback((id) => {
    setApproved(prev => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem("pltr_approved", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleDecline = useCallback((id) => {
    setDeclined(prev => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem("pltr_declined", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleExportApproved = useCallback(() => {
    const REGION_MAP = {
      "United States": "North America", "Canada": "North America",
      "United Kingdom": "Europe", "Germany": "Europe", "France": "Europe",
      "Netherlands": "Europe", "Poland": "Europe", "Romania": "Europe",
      "Ukraine": "Europe", "Estonia": "Europe", "Latvia": "Europe",
      "Australia": "Oceania", "New Zealand": "Oceania",
      "Japan": "Asia Pacific", "South Korea": "Asia Pacific", "Singapore": "Asia Pacific",
      "Israel": "Middle East", "UAE": "Middle East", "Saudi Arabia": "Middle East",
    };
    const esc = s => (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const approvedContracts = pendingItems.filter(
      i => approved.has(i.id) && i.source_type === "contract_api" && i.contract_data
    );
    const maxId = Math.max(...CONTRACTS.map(c => c.id), 0);
    const entries = approvedContracts.map((item, idx) => {
      const cd = item.contract_data;
      const id = maxId + idx + 1;
      const region = REGION_MAP[cd.country] || "Other";
      return [
        `  { id: ${id}, name: "${esc(item.title)}", entity: "${esc(cd.entity)}", country: "${esc(cd.country)}", region: "${region}",`,
        `    sector: "Defense", sub: "", product: "", value: ${cd.value != null ? cd.value : "null"}, currency: "${cd.currency || "USD"}",`,
        `    year: ${cd.year || "null"}, quarter: "", status: "Active", statusDetail: "", procurement: "",`,
        `    source: "${esc(item.source)}", url: "${esc(item.url)}", docs: [`,
        `    { label: "${esc(item.source)} — ${esc(item.title)}", url: "${esc(item.url)}", type: "fed_record" },`,
        `  ]}`,
      ].join("\n");
    });
    const header = [
      "// ===== APPROVED CONTRACTS EXPORT =====",
      `// Generated: ${new Date().toISOString()}`,
      `// ${approvedContracts.length} contract(s) from approved inbox items (source_type: contract_api)`,
      "// TODO: Fill in empty fields — sub, product, procurement, statusDetail, quarter",
      "// Then append these entries to window.CONTRACTS in data.js",
      "",
    ].join("\n");
    setExportCode(header + entries.join(",\n\n"));
    setExportModal(true);
  }, [pendingItems, approved]);

  // ===== SHARED MEDIA TYPE TAXONOMY =====
  // Single source of truth — used by KarpTube AND Inbox so colors never diverge.
  // Groups: official data (green) | legal docs (gold) | current comms (cyan) |
  //         raw feeds (accentDim) | analysis (purple) | broadcast (pink) |
  //         social/reactive (red) | generic web (textDim)
  const MEDIA_TYPE_META = {
    contract_api:  { label: "CONTRACT",      color: COLORS.green },
    official:      { label: "OFFICIAL",      color: COLORS.green },
    sec_filing:    { label: "SEC FILING",    color: COLORS.gold },
    press_release: { label: "PRESS RELEASE", color: COLORS.accent },
    news:          { label: "NEWS",          color: COLORS.accent },
    article:       { label: "ARTICLE",       color: COLORS.accent },
    rss:           { label: "RSS FEED",      color: COLORS.accentDim },
    newsletter:    { label: "NEWSLETTER",    color: COLORS.purple },
    blog:          { label: "BLOG",          color: COLORS.purple },
    podcast:       { label: "PODCAST",       color: COLORS.pink },
    video:         { label: "VIDEO",         color: COLORS.pink },
    x_post:        { label: "X / SOCIAL",   color: COLORS.red },
    x_search:      { label: "X / SOCIAL",   color: COLORS.red },
    web_search:    { label: "WEB",           color: COLORS.textDim },
  };

  // ===== SHARED TOOLTIP STYLES — lighter bg so text is always visible =====
  const TT_STYLE = { background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 11 };
  const TT_LABEL = { color: COLORS.text, fontWeight: 600 };
  const TT_ITEM  = { color: COLORS.text };

  const years = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.year).filter(Boolean).sort((a, b) => b - a).map(String))], []);
  const countries = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.country).sort())], []);
  const sectors = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.sector).sort())], []);
  const statuses = ["All", "Active", "Completed", "Under Review"];

  // ===== GLOBAL FILTER OPTION LISTS =====
  const allYears = useMemo(() => ["All", ...Array.from(new Set(CONTRACTS.map(c => c.year).filter(Boolean))).sort((a,b) => b-a)], []);
  const allSectors = useMemo(() => ["All", ...Array.from(new Set(CONTRACTS.map(c => c.sector).filter(Boolean))).sort()], []);
  const allCountries = useMemo(() => ["All", ...Array.from(new Set(CONTRACTS.map(c => c.country).filter(Boolean))).sort()], []);

  // ===== GLOBALLY FILTERED CONTRACT SET =====
  const filteredContracts = useMemo(() => {
    return CONTRACTS.filter(c => {
      if (gYear !== "All" && c.year !== Number(gYear)) return false;
      if (gSector !== "All" && c.sector !== gSector) return false;
      if (gCountry !== "All" && c.country !== gCountry) return false;
      return true;
    });
  }, [gYear, gSector, gCountry]);

  const filtered = useMemo(() => {
    let data = filteredContracts;
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(c => c.name.toLowerCase().includes(s) || c.entity.toLowerCase().includes(s) || c.product.toLowerCase().includes(s) || c.sub.toLowerCase().includes(s) || (c.statusDetail || "").toLowerCase().includes(s));
    }
    if (filterYear !== "All") data = data.filter(c => String(c.year) === filterYear);
    if (filterCountry !== "All") data = data.filter(c => c.country === filterCountry);
    if (filterSector !== "All") data = data.filter(c => c.sector === filterSector);
    if (filterStatus !== "All") data = data.filter(c => c.status === filterStatus);
    data = [...data].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (sortCol === "value") { av = av || 0; bv = bv || 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredContracts, search, filterYear, filterCountry, filterSector, filterStatus, sortCol, sortDir]);

  const totalVal = useMemo(() => filteredContracts.reduce((s, c) => s + (c.value || 0), 0), [filteredContracts]);
  const activeVal = useMemo(() => filteredContracts.filter(c => c.status === "Active").reduce((s, c) => s + (c.value || 0), 0), [filteredContracts]);
  const activeCount = useMemo(() => filteredContracts.filter(c => c.status === "Active").length, [filteredContracts]);
  const countryCount = useMemo(() => new Set(filteredContracts.map(c => c.country)).size, [filteredContracts]);

  const toggleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }, [sortCol]);

  const bySector = useMemo(() => {
    const map = {}; const countMap = {};
    filteredContracts.forEach(c => { map[c.sector] = (map[c.sector] || 0) + (c.value || 0); countMap[c.sector] = (countMap[c.sector] || 0) + 1; });
    const arr = Object.entries(map).map(([name, value]) => ({ name, value, count: countMap[name] || 0 }));
    if (sectorSort === "count") return arr.sort((a, b) => b.count - a.count);
    return arr.sort((a, b) => b.value - a.value);
  }, [filteredContracts, sectorSort]);

  const byCountry = useMemo(() => {
    const map = {}; const countMap = {};
    filteredContracts.forEach(c => { map[c.country] = (map[c.country] || 0) + (c.value || 0); countMap[c.country] = (countMap[c.country] || 0) + 1; });
    const arr = Object.entries(map).map(([name, value]) => ({ name, value, count: countMap[name] || 0 }));
    if (countrySort === "count") return arr.sort((a, b) => b.count - a.count);
    return arr.sort((a, b) => b.value - a.value);
  }, [filteredContracts, countrySort]);

  const byYear = useMemo(() => {
    const map = {};
    filteredContracts.forEach(c => {
      if (!c.year) return;
      if (!map[c.year]) map[c.year] = { year: c.year, total: 0, count: 0, cumulative: 0 };
      map[c.year].total += (c.value || 0);
      map[c.year].count += 1;
    });
    const arr = Object.values(map).sort((a, b) => a.year - b.year);
    let cum = 0;
    arr.forEach(d => { cum += d.total; d.cumulative = cum; });
    return arr;
  }, [filteredContracts]);

  // Year-over-year deltas for time series
  const yoyDeltas = useMemo(() => {
    const map = {};
    byYear.forEach((d, i) => {
      if (i === 0) { map[d.year] = { countDelta: null, valueDelta: null }; return; }
      const prev = byYear[i - 1];
      map[d.year] = {
        countDelta: prev.count > 0 ? Math.round(((d.count - prev.count) / prev.count) * 100) : null,
        valueDelta: prev.total > 0 ? Math.round(((d.total - prev.total) / prev.total) * 100) : null,
      };
    });
    return map;
  }, [byYear]);

  // US Gov vs International by year (stacked bar — Overview)
  const byYearRegion = useMemo(() => {
    const map = {};
    filteredContracts.forEach(c => {
      if (!c.year) return;
      if (!map[c.year]) map[c.year] = { year: c.year, "US Gov": 0, "International": 0 };
      if (c.country === "United States") map[c.year]["US Gov"] += (c.value || 0);
      else map[c.year]["International"] += (c.value || 0);
    });
    return Object.values(map).sort((a, b) => a.year - b.year);
  }, [filteredContracts]);

  // Cumulative US Gov vs International (for global viewMode)
  const byYearRegionCumul = useMemo(() => {
    let usGov = 0, intl = 0;
    return byYearRegion.map(d => {
      usGov += d["US Gov"];
      intl += d["International"];
      return { year: d.year, "US Gov": usGov, "International": intl };
    });
  }, [byYearRegion]);

  // Contract value size buckets (Deal Flow) — granular with contracts array
  const valueBuckets = useMemo(() => {
    const buckets = [
      { name: "< $1M",        min: 0,    max: 1,        count: 0, total: 0, contracts: [] },
      { name: "$1M–$5M",      min: 1,    max: 5,        count: 0, total: 0, contracts: [] },
      { name: "$5M–$25M",     min: 5,    max: 25,       count: 0, total: 0, contracts: [] },
      { name: "$25M–$100M",   min: 25,   max: 100,      count: 0, total: 0, contracts: [] },
      { name: "$100M–$500M",  min: 100,  max: 500,      count: 0, total: 0, contracts: [] },
      { name: "$500M–$1B",    min: 500,  max: 1000,     count: 0, total: 0, contracts: [] },
      { name: "> $1B",        min: 1000, max: Infinity,  count: 0, total: 0, contracts: [] },
    ];
    filteredContracts.forEach(c => {
      const v = c.value || 0;
      const b = buckets.find(b => v >= b.min && v < b.max);
      if (b) { b.count++; b.total += v; b.contracts.push(c); }
    });
    return buckets.filter(b => b.count > 0);
  }, [filteredContracts]);

  // Top countries by value (horizontal bar — replaces donut)
  const topCountries = useMemo(() => {
    const map = {};
    filteredContracts.forEach(c => {
      map[c.country] = (map[c.country] || 0) + (c.value || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [filteredContracts]);

  // Avg and max contract value (stat cards)
  const avgContractVal = useMemo(() => {
    const valued = filteredContracts.filter(c => c.value);
    return valued.length ? valued.reduce((s, c) => s + c.value, 0) / valued.length : 0;
  }, [filteredContracts]);
  const maxContract = useMemo(() => filteredContracts.reduce((m, c) => (c.value || 0) > (m.value || 0) ? c : m, {}), [filteredContracts]);

  // Top contracts by run rate for Run Rate tab
  const topByRunRate = useMemo(() => {
    return (window.RUN_RATES
      ? CONTRACTS.filter(c => window.RUN_RATES[c.id])
          .map(c => ({ name: c.name.length > 30 ? c.name.slice(0, 28) + "\u2026" : c.name, av: window.RUN_RATES[c.id].av, entity: c.entity }))
          .sort((a, b) => b.av - a.av)
          .slice(0, 10)
      : []);
  }, []);

  const byEntity = useMemo(() => {
    const map = {};
    filteredContracts.forEach(c => {
      const key = c.entity.length > 28 ? c.entity.slice(0, 26) + "\u2026" : c.entity;
      map[key] = (map[key] || 0) + (c.value || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [filteredContracts]);

  const countryDetail = useMemo(() => {
    const map = {};
    filteredContracts.forEach(c => {
      if (!map[c.country]) map[c.country] = { contracts: [], total: 0, count: 0 };
      map[c.country].contracts.push(c);
      map[c.country].total += (c.value || 0);
      map[c.country].count += 1;
    });
    return Object.entries(map).sort((a, b) => {
      const [, ad] = a; const [, bd] = b;
      if (byCountrySort === "value") return byCountrySortDir === "desc" ? bd.total - ad.total : ad.total - bd.total;
      if (byCountrySort === "count") return byCountrySortDir === "desc" ? bd.count - ad.count : ad.count - bd.count;
      if (byCountrySort === "name")  return byCountrySortDir === "desc" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]);
      return bd.total - ad.total;
    });
  }, [filteredContracts, byCountrySort, byCountrySortDir]);

  const Select = ({ value, onChange, options, label }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer", minWidth: 100 }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const SortHeader = ({ col, children, width }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: "pointer", padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: sortCol === col ? COLORS.accent : COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, whiteSpace: "nowrap", width, userSelect: "none" }}>
      {children} {sortCol === col ? (sortDir === "desc" ? "\u2193" : "\u2191") : ""}
    </th>
  );

  // ===== OVERVIEW TAB =====
  const renderOverview = () => {
    const usGovTotal = filteredContracts.filter(c => c.country === "United States").reduce((s, c) => s + (c.value || 0), 0);
    const usGovPct = totalVal > 0 ? ((usGovTotal / totalVal) * 100).toFixed(0) : 0;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Stat cards */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Stat label="Total Contracts" value={filteredContracts.length} sub={filteredContracts.length === CONTRACTS.length ? "Since 2005" : `of ${CONTRACTS.length} total`} color={COLORS.accent} />
          <Stat label="Active Deals" value={activeCount} sub={`${fmt(activeVal)} ceiling`} color={COLORS.green} />
          <Stat label="Total Ceiling Value" value={fmt(totalVal)} sub="All currencies (USD equiv.)" color={COLORS.gold} />
          <Stat label="US Gov Share" value={`${usGovPct}%`} sub={`${fmt(usGovTotal)} of total`} color={COLORS.purple} />
          <Stat label="Countries / Orgs" value={countryCount} sub="Including NATO, UN" color={COLORS.pink} />
          <Stat label="Avg Contract Size" value={fmt(avgContractVal)} sub={`Max: ${fmt(maxContract.value || 0)}`} color={COLORS.accentDim} />
        </div>

        {/* Row 1 — 3 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {/* Sector value */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>VALUE BY SECTOR</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {sectorDrill && (
                  <button onClick={() => setSectorDrill(null)} style={{ background: `${COLORS.accent}18`, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, borderRadius: 5, padding: "3px 10px", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>← All</button>
                )}
                <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 5, padding: 2, gap: 2 }}>
                  {[["value","$ Value"],["count","Count"]].map(([v,l]) => (
                    <button key={v} onClick={() => setSectorSort(v)} style={{ padding: "3px 9px", fontSize: 9, fontWeight: 700, borderRadius: 3, cursor: "pointer", border: "none", background: sectorSort === v ? COLORS.accent : "transparent", color: sectorSort === v ? "#0a0e17" : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase", transition: "all 0.15s" }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {sectorDrill ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, marginBottom: 10 }}>{sectorDrill}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, maxHeight: 460, overflowY: "auto" }}>
                  {filteredContracts.filter(c => c.sector === sectorDrill).sort((a, b) => (b.value || 0) - (a.value || 0)).map((c, i) => (
                    <ContractCard key={i} c={c} color={PIE_COLORS[0]} onClick={() => setModalContract(c)} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>{bySector.filter(d => d.value > 0).length} sectors · click bar to drill in</div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={bySector.filter(d => sectorSort === "count" ? d.count > 0 : d.value > 0)} layout="vertical" margin={{ left: 10, right: 50 }}
                    onClick={e => { if (e && e.activePayload && e.activePayload[0]) setSectorDrill(e.activePayload[0].payload.name); }}>
                    <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={sectorSort === "count" ? v => v : v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v.toFixed(0)}M`} />
                    <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={120} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                            <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 5 }}>{d.name}</div>
                            <div style={{ color: COLORS.gold }}>Value: <strong>{fmtUSD(d.value)}</strong></div>
                            <div style={{ color: COLORS.accent, marginTop: 3 }}>Contracts: <strong>{d.count}</strong></div>
                            <div style={{ color: COLORS.textMuted, marginTop: 4, fontSize: 9 }}>Click to drill in</div>
                          </div>
                        );
                      }} />
                    <Bar dataKey={sectorSort} radius={[0, 4, 4, 0]} maxBarSize={24} cursor="pointer" label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => sectorSort === "count" ? v : v >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v.toFixed(0)}M` }}>
                      {bySector.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Top countries */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>BY COUNTRY</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {countryDrillOv && (
                  <button onClick={() => setCountryDrillOv(null)} style={{ background: `${COLORS.gold}18`, color: COLORS.gold, border: `1px solid ${COLORS.gold}44`, borderRadius: 5, padding: "3px 10px", fontSize: 9, fontWeight: 700, cursor: "pointer" }}>← All</button>
                )}
                <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 5, padding: 2, gap: 2 }}>
                  {[["value","$ Value"],["count","Count"]].map(([v,l]) => (
                    <button key={v} onClick={() => setCountrySort(v)} style={{ padding: "3px 9px", fontSize: 9, fontWeight: 700, borderRadius: 3, cursor: "pointer", border: "none", background: countrySort === v ? COLORS.gold : "transparent", color: countrySort === v ? "#0a0e17" : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase", transition: "all 0.15s" }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {countryDrillOv ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, marginBottom: 10 }}>{countryDrillOv}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8, maxHeight: 460, overflowY: "auto" }}>
                  {filteredContracts.filter(c => c.country === countryDrillOv).sort((a, b) => (b.value || 0) - (a.value || 0)).map((c, i) => (
                    <ContractCard key={i} c={c} color={PIE_COLORS[i % PIE_COLORS.length]} onClick={() => setModalContract(c)} />
                  ))}
                </div>
              </div>
            ) : (() => {
              const disclosedCountries = countrySort === "count" ? byCountry.filter(d => d.count > 0).slice(0, 15) : topCountries.filter(d => d.value > 0);
              const undisclosedCount = byCountry.filter(d => d.value === 0).length;
              return (
                <>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>
                    {disclosedCountries.length} with disclosed value{undisclosedCount > 0 && ` · ${undisclosedCount} undisclosed`} · click bar to drill in
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={disclosedCountries} layout="vertical" margin={{ left: 10, right: 56 }}
                      onClick={e => { if (e && e.activePayload && e.activePayload[0]) setCountryDrillOv(e.activePayload[0].payload.name); }}>
                      <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={countrySort === "count" ? v => v : v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v.toFixed(0)}M`} />
                      <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={100} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                              <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 5 }}>{d.name}</div>
                              <div style={{ color: COLORS.gold }}>Value: <strong>{fmtUSD(d.value)}</strong></div>
                              <div style={{ color: COLORS.accent, marginTop: 3 }}>Contracts: <strong>{d.count}</strong></div>
                              <div style={{ color: COLORS.textMuted, marginTop: 4, fontSize: 9 }}>Click to drill in</div>
                            </div>
                          );
                        }} />
                      <Bar dataKey={countrySort} radius={[0, 4, 4, 0]} maxBarSize={14} cursor="pointer" label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => countrySort === "count" ? v : v >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v.toFixed(0)}M` }}>
                        {disclosedCountries.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              );
            })()}
          </div>

          {/* Top entities */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>TOP AWARDING ENTITIES ($M)</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Top 12 entities · all time</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byEntity} layout="vertical" margin={{ left: 10, right: 56 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v.toFixed(0)}M`} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={150} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [`$${v >= 1000 ? (v/1000).toFixed(2)+"B" : v.toFixed(0)+"M"}`, "Value"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={COLORS.accentDim} maxBarSize={22} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => v >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v.toFixed(0)}M` }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Contract Value Over Time */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>CONTRACT VALUE OVER TIME</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>
              {viewMode === "cumulative" ? "Total cumulative contract value (all time)" : "Annual contract value awarded per year"}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={byYear} margin={{ left: 10, right: 20, top: 10 }}>
                <defs>
                  <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v}M`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const yoy = yoyDeltas[label];
                  return (
                    <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                      {payload.map((p, i) => (
                        <div key={i} style={{ color: p.color, marginBottom: 3 }}>{p.name}: <strong>{fmtUSD(p.value)}</strong></div>
                      ))}
                      {yoy && yoy.valueDelta != null && (
                        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6, fontSize: 10 }}>
                          <span style={{ color: yoy.valueDelta >= 0 ? COLORS.green : COLORS.pink }}>
                            {yoy.valueDelta >= 0 ? "▲" : "▼"} {Math.abs(yoy.valueDelta)}% vs prev year
                          </span>
                          {yoy.countDelta != null && (
                            <span style={{ color: COLORS.textMuted, marginLeft: 10 }}>
                              {yoy.countDelta >= 0 ? "+" : ""}{yoy.countDelta}% contracts
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }} />
                {PALANTIR_EVENTS.map(ev => (
                  <ReferenceLine key={ev.year} x={ev.year} stroke={ev.color} strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: ev.label, position: "top", fill: ev.color, fontSize: 7, angle: -45, dy: -4 }} />
                ))}
                {viewMode === "cumulative"
                  ? <Area type="monotone" dataKey="cumulative" stroke={COLORS.accent} fill="url(#grad1)" strokeWidth={2} name="Cumulative Value" />
                  : <Area type="monotone" dataKey="total" stroke={COLORS.gold} fill="url(#grad2)" strokeWidth={2} name="Annual Value" />
                }
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* US Gov vs International by year */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>US GOV vs INTERNATIONAL ($M)</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>{viewMode === "cumulative" ? "Cumulative contract value by customer type" : "Annual contract value split by customer type"}</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={viewMode === "cumulative" ? byYearRegionCumul : byYearRegion} margin={{ left: 10, right: 20, top: 10 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v}M`} />
                <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const usGov = payload.find(p => p.dataKey === "US Gov")?.value || 0;
                    const intl = payload.find(p => p.dataKey === "International")?.value || 0;
                    const total = usGov + intl;
                    return (
                      <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                        <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                        <div style={{ color: COLORS.accent }}>US Gov: <strong>{fmtUSD(usGov)}</strong>{total > 0 && <span style={{ color: COLORS.textMuted }}> ({((usGov/total)*100).toFixed(0)}%)</span>}</div>
                        <div style={{ color: COLORS.gold, marginTop: 3 }}>International: <strong>{fmtUSD(intl)}</strong>{total > 0 && <span style={{ color: COLORS.textMuted }}> ({((intl/total)*100).toFixed(0)}%)</span>}</div>
                        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6, color: COLORS.textDim, fontSize: 10 }}>Total: <strong>{fmtUSD(total)}</strong></div>
                      </div>
                    );
                  }} />
                <Legend wrapperStyle={{ fontSize: 10, color: COLORS.textDim }} />
                {(() => {
                  const regionData = viewMode === "cumulative" ? byYearRegionCumul : byYearRegion;
                  const avg = regionData.length > 0 ? regionData.reduce((s, d) => s + d["US Gov"] + d["International"], 0) / regionData.length : 0;
                  return <ReferenceLine y={avg} stroke={COLORS.textMuted} strokeDasharray="5 3" label={{ value: "Avg/yr", position: "insideTopRight", fill: COLORS.textMuted, fontSize: 9 }} />;
                })()}
                <Bar dataKey="US Gov" stackId="a" fill={COLORS.accent} name="US Gov" />
                <Bar dataKey="International" stackId="a" fill={COLORS.gold} name="International" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    );
  };

  // ===== EXPLORER TAB =====
  const renderExplorer = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, display: "block", marginBottom: 4 }}>Search</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contracts, entities, products\u2026" style={{ width: "100%", background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <Select label="Year" value={filterYear} onChange={setFilterYear} options={years} />
        <Select label="Country" value={filterCountry} onChange={setFilterCountry} options={countries} />
        <Select label="Sector" value={filterSector} onChange={setFilterSector} options={sectors} />
        <Select label="Status" value={filterStatus} onChange={setFilterStatus} options={statuses} />
        <button onClick={() => { setSearch(""); setFilterYear("All"); setFilterCountry("All"); setFilterSector("All"); setFilterStatus("All"); }} style={{ background: COLORS.border, color: COLORS.textDim, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600, marginBottom: 1 }}>RESET</button>
      </div>
      <div style={{ fontSize: 12, color: COLORS.textMuted }}>{filtered.length} contracts \u00b7 ${filtered.reduce((s, c) => s + (c.value || 0), 0).toFixed(0)}M total ceiling</div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: COLORS.card }}>
              <SortHeader col="year" width={50}>Year</SortHeader>
              <SortHeader col="name" width={220}>Contract</SortHeader>
              <SortHeader col="entity" width={160}>Entity</SortHeader>
              <SortHeader col="country" width={90}>Country</SortHeader>
              <SortHeader col="sector" width={100}>Sector</SortHeader>
              <SortHeader col="value" width={80}>Value</SortHeader>
              <SortHeader col="status" width={80}>Status</SortHeader>
              <th style={{ padding: "10px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}`, background: selectedContract === c.id ? COLORS.cardHover : "transparent", cursor: "pointer", transition: "background 0.15s" }} onClick={() => setSelectedContract(selectedContract === c.id ? null : c.id)} onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover} onMouseLeave={e => e.currentTarget.style.background = selectedContract === c.id ? COLORS.cardHover : "transparent"}>
                <td style={{ padding: "10px 8px", color: COLORS.textDim }}>{c.year}</td>
                <td style={{ padding: "10px 8px", color: COLORS.text, fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: "10px 8px", color: COLORS.textDim }}>{c.entity}</td>
                <td style={{ padding: "10px 8px", color: COLORS.textDim }}>{c.country}</td>
                <td style={{ padding: "10px 8px" }}><span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${COLORS.accentDim}22`, color: COLORS.accentDim, fontWeight: 600 }}>{c.sector}</span></td>
                <td style={{ padding: "10px 8px", color: COLORS.gold, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(c.value)}</td>
                <td style={{ padding: "10px 8px" }}><StatusBadge status={c.status} /></td>
                <td style={{ padding: "10px 8px", color: COLORS.textMuted, fontSize: 14 }}>{selectedContract === c.id ? "\u25be" : "\u25b8"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No contracts match your filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {selectedContract && (() => {
        const c = CONTRACTS.find(x => x.id === selectedContract);
        if (!c) return null;
        return (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.accent}33`, borderRadius: 10, padding: 20, marginTop: 4, animation: "fadeIn 0.2s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{c.name}</div>
                <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{c.entity} \u00b7 {c.country}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.gold }}>{fmt(c.value)}</div>
                <StatusBadge status={c.status} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 12 }}>
              {[["Sector", c.sector], ["Sub-Category", c.sub], ["Product(s)", c.product], ["Procurement", c.procurement], ["Year / Quarter", `${c.year} ${c.quarter || ""}`], ["Source", c.source]].map(([l, v]) => (
                <div key={l}><span style={{ color: COLORS.textMuted, fontWeight: 600 }}>{l}: </span><span style={{ color: COLORS.text }}>{v}</span></div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}><span style={{ color: COLORS.textMuted, fontWeight: 600 }}>Detail: </span>{c.statusDetail}</div>
            {c.docs && c.docs.length > 0 && (
              <div style={{ marginTop: 16, padding: 14, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, background: COLORS.accent, borderRadius: "50%" }} />
                  Official Documentation & Source Records
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.docs.map((doc, di) => {
                    const typeConfig = {
                      official: { label: "OFFICIAL", bg: "#22c55e18", color: "#22c55e", border: "#22c55e33", icon: "\u25c6" },
                      fed_record: { label: "FED RECORD", bg: "#f59e0b18", color: "#f59e0b", border: "#f59e0b33", icon: "\u25c8" },
                      palantir_ir: { label: "PLTR IR", bg: "#a78bfa18", color: "#a78bfa", border: "#a78bfa33", icon: "\u25c7" },
                      parliament: { label: "PARLIAMENT", bg: "#06b6d418", color: "#06b6d4", border: "#06b6d433", icon: "\u25a3" },
                      press: { label: "PRESS", bg: "#64748b18", color: "#94a3b8", border: "#64748b33", icon: "\u25aa" },
                    };
                    const tc = typeConfig[doc.type] || typeConfig.press;
                    return (
                      <a key={di} href={doc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: tc.bg, border: `1px solid ${tc.border}`, textDecoration: "none", transition: "all 0.15s", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.background = `${tc.color}22`; e.currentTarget.style.borderColor = `${tc.color}66`; }} onMouseLeave={e => { e.currentTarget.style.background = tc.bg; e.currentTarget.style.borderColor = tc.border; }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${tc.color}22`, color: tc.color, letterSpacing: 0.8, whiteSpace: "nowrap", minWidth: 72, textAlign: "center", border: `1px solid ${tc.border}` }}>{tc.icon} {tc.label}</span>
                        <span style={{ color: COLORS.text, fontSize: 12, fontWeight: 500, flex: 1 }}>{doc.label}</span>
                        <span style={{ color: tc.color, fontSize: 11, flexShrink: 0 }}>\u2192</span>
                      </a>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: COLORS.textMuted, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>Legend:</span> <span style={{ color: "#22c55e" }}>{"\u25c6"} OFFICIAL</span> = Awarding agency/govt portal \u00b7 <span style={{ color: "#f59e0b" }}>{"\u25c8"} FED RECORD</span> = USASpending/SAM.gov \u00b7 <span style={{ color: "#a78bfa" }}>{"\u25c7"} PLTR IR</span> = Palantir Investor Relations \u00b7 <span style={{ color: "#06b6d4" }}>{"\u25a3"} PARLIAMENT</span> = Legislative record \u00b7 <span style={{ color: "#94a3b8" }}>{"\u25aa"} PRESS</span> = Trade/news coverage
                </div>
              </div>
            )}
            {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 11, color: COLORS.accent, textDecoration: "none" }}>View Primary Source \u2192</a>}
          </div>
        );
      })()}
    </div>
  );

  // ===== BY COUNTRY TAB =====
  const renderByCountry = () => {
    const COUNTRY_SORT_OPTS = [
      { key: "value", label: "Total Value" },
      { key: "count", label: "Contract Count" },
      { key: "name",  label: "Country Name" },
    ];
    const CONTRACT_SORT_OPTS = [
      { key: "value",  label: "Value" },
      { key: "year",   label: "Year" },
      { key: "status", label: "Status" },
      { key: "name",   label: "Name" },
    ];
    const sortContracts = (contracts) => {
      return [...contracts].sort((a, b) => {
        if (byCountryContractSort === "value")  return (b.value || 0) - (a.value || 0);
        if (byCountryContractSort === "year")   return (b.year || 0) - (a.year || 0);
        if (byCountryContractSort === "status") return (a.status || "").localeCompare(b.status || "");
        if (byCountryContractSort === "name")   return (a.name || "").localeCompare(b.name || "");
        return (b.value || 0) - (a.value || 0);
      });
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Summary bar: top 10 countries */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20, marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>CONTRACT VALUE BY COUNTRY — TOP 10 ($M)</div>
          {(() => {
            const top10 = topCountries.filter(d => d.value > 0).slice(0, 10);
            const undisclosed = byCountry.filter(d => d.value === 0).length;
            return (
              <>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>
                  Top {top10.length} countries by disclosed ceiling value
                  {undisclosed > 0 && <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>· {undisclosed} with undisclosed value (not shown)</span>}
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={top10} layout="vertical" margin={{ left: 10, right: 60 }}>
                    <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v.toFixed(0)}M`} />
                    <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={110} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [`$${v >= 1000 ? (v/1000).toFixed(2)+"B" : v.toFixed(0)+"M"}`, "Value"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => v >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v.toFixed(0)}M` }}>
                      {top10.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            );
          })()}
        </div>

        {/* Sort controls */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "12px 16px", background: COLORS.card, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Sort Countries</span>
            {COUNTRY_SORT_OPTS.map(o => (
              <button key={o.key} onClick={() => { if (byCountrySort === o.key) setByCountrySortDir(d => d === "asc" ? "desc" : "asc"); else { setByCountrySort(o.key); setByCountrySortDir("desc"); } }}
                style={{ padding: "5px 12px", background: byCountrySort === o.key ? COLORS.accent : COLORS.border, color: byCountrySort === o.key ? "#0a0e17" : COLORS.textDim, border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {o.label} {byCountrySort === o.key ? (byCountrySortDir === "desc" ? "\u2193" : "\u2191") : ""}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: COLORS.border }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Sort Contracts</span>
            {CONTRACT_SORT_OPTS.map(o => (
              <button key={o.key} onClick={() => setByCountryContractSort(o.key)}
                style={{ padding: "5px 12px", background: byCountryContractSort === o.key ? COLORS.gold : COLORS.border, color: byCountryContractSort === o.key ? "#0a0e17" : COLORS.textDim, border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {countryDetail.map(([country, data]) => (
          <div key={country} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{country}</div>
              <div style={{ display: "flex", gap: 20 }}>
                <span style={{ fontSize: 13, color: COLORS.textDim }}>{data.count} contract{data.count > 1 ? "s" : ""}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.gold }}>{fmt(data.total)}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortContracts(data.contracts).map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: COLORS.bg, borderRadius: 6, fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
                    <StatusBadge status={c.status} />
                    <span style={{ color: COLORS.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ color: COLORS.textMuted, whiteSpace: "nowrap" }}>{c.entity}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexShrink: 0 }}>
                    {c.sub && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${COLORS.purple}22`, color: COLORS.purple, whiteSpace: "nowrap" }}>{c.sub}</span>}
                    <span style={{ color: COLORS.gold, fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right" }}>{fmt(c.value)}</span>
                    <span style={{ color: COLORS.textMuted, minWidth: 30, textAlign: "right" }}>{c.year}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ===== TIMELINE TAB =====
  const renderTimeline = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
      <div style={{ position: "absolute", left: 55, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${COLORS.accent}66, ${COLORS.border})`, zIndex: 0 }} />
      {CONTRACTS.sort((a, b) => { if (a.year !== b.year) return b.year - a.year; return (b.value || 0) - (a.value || 0); }).map(c => (
        <div key={c.id} style={{ display: "flex", gap: 16, alignItems: "flex-start", position: "relative", zIndex: 1, padding: "6px 0" }}>
          <div style={{ minWidth: 50, textAlign: "right", fontSize: 12, fontWeight: 700, color: COLORS.textDim, paddingTop: 8 }}>{c.year}</div>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.status === "Active" ? COLORS.accent : COLORS.textMuted, border: `2px solid ${COLORS.bg}`, marginTop: 8, flexShrink: 0, boxShadow: c.status === "Active" ? `0 0 8px ${COLORS.accent}44` : "none" }} />
          <div style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: COLORS.text }}>{c.name}</span>
              <span style={{ color: COLORS.gold, fontWeight: 700 }}>{fmt(c.value)}</span>
            </div>
            <div style={{ color: COLORS.textDim, marginTop: 2 }}>{c.entity} \u00b7 {c.country} <StatusBadge status={c.status} /></div>
            <div style={{ color: COLORS.textMuted, marginTop: 4, fontSize: 11 }}>{c.statusDetail}</div>
          </div>
        </div>
      ))}
    </div>
  );

  // ===== DEAL FLOW TAB =====
  const renderDealFlow = () => {
    const byYearCount = byYear.map(d => ({ ...d }));
    const byYearCountCumul = (() => {
      let c = 0, v = 0;
      return byYearCount.map(d => { c += d.count; v += d.total; return { ...d, count: c, total: v }; });
    })();
    const dealFlowData = viewMode === "cumulative" ? byYearCountCumul : byYearCount;
    const statusData = [
      { name: "Active",       value: filteredContracts.filter(c => c.status === "Active").length,       fill: COLORS.green },
      { name: "Completed",    value: filteredContracts.filter(c => c.status === "Completed").length,    fill: COLORS.textMuted },
      { name: "Under Review", value: filteredContracts.filter(c => c.status === "Under Review").length, fill: COLORS.gold },
    ];
    const procurementData = {};
    filteredContracts.forEach(c => { procurementData[c.procurement] = (procurementData[c.procurement] || 0) + 1; });
    const procArr = Object.entries(procurementData).map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + "\u2026" : name, value })).sort((a, b) => b.value - a.value);
    const productData = {};
    filteredContracts.forEach(c => { c.product.split(",").forEach(p => { const key = p.trim(); if (key) productData[key] = (productData[key] || 0) + 1; }); });
    const prodArr = Object.entries(productData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Row 1: 2 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          {/* Col 1: Count + Value per year */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            {yearDrill ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <button onClick={() => setYearDrill(null)} style={{ background: `${COLORS.accent}18`, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>← Back</button>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{yearDrill} Contracts</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted }}>{filteredContracts.filter(c => c.year === yearDrill).length} total</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, maxHeight: 460, overflowY: "auto" }}>
                  {filteredContracts.filter(c => c.year === yearDrill).sort((a, b) => (b.value || 0) - (a.value || 0)).map((c, i) => (
                    <ContractCard key={i} c={c} color={PIE_COLORS[i % PIE_COLORS.length]} onClick={() => setModalContract(c)} />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>CONTRACTS AWARDED — {viewMode === "cumulative" ? "CUMULATIVE" : "COUNT & VALUE PER YEAR"}</div>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>{viewMode === "cumulative" ? "Running total of contract count and value over time" : "Bars = contract count (left axis) · Line = total value $M (right axis) · click bar for year drill-down"}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={dealFlowData} margin={{ left: 0, right: 20, top: 10 }} barCategoryGap="30%"
                    onClick={e => { if (e && e.activePayload && e.activePayload[0] && viewMode !== "cumulative") setYearDrill(e.activePayload[0].payload.year); }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} />
                    <YAxis yAxisId="count" orientation="left" tick={{ fill: COLORS.accent, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="value" orientation="right" tick={{ fill: COLORS.gold, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}B` : `$${v}M`} />
                    <Tooltip contentStyle={TT_STYLE} labelStyle={TT_LABEL} itemStyle={TT_ITEM}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        const yoy = yoyDeltas[label];
                        return (
                          <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                            <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                            <div style={{ color: COLORS.accent }}>Contracts: <strong>{d.count}</strong></div>
                            <div style={{ color: COLORS.gold, marginTop: 3 }}>Value: <strong>{fmtUSD(d.total)}</strong></div>
                            {yoy && yoy.countDelta != null && (
                              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6, fontSize: 10 }}>
                                <span style={{ color: yoy.countDelta >= 0 ? COLORS.green : COLORS.pink }}>
                                  {yoy.countDelta >= 0 ? "▲" : "▼"} {Math.abs(yoy.countDelta)}% contracts YoY
                                </span>
                                {yoy.valueDelta != null && (
                                  <div style={{ color: yoy.valueDelta >= 0 ? COLORS.green : COLORS.pink, marginTop: 2 }}>
                                    {yoy.valueDelta >= 0 ? "▲" : "▼"} {Math.abs(yoy.valueDelta)}% value YoY
                                  </div>
                                )}
                              </div>
                            )}
                            {viewMode !== "cumulative" && <div style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 4 }}>Click to see {label} contracts</div>}
                          </div>
                        );
                      }} />
                    <Legend wrapperStyle={{ fontSize: 10, color: COLORS.textDim }} />
                    {PALANTIR_EVENTS.map(ev => (
                      <ReferenceLine key={ev.year} yAxisId="count" x={ev.year} stroke={ev.color} strokeDasharray="4 3" strokeWidth={1.5}
                        label={{ value: ev.label, position: "top", fill: ev.color, fontSize: 7, angle: -45, dy: -4 }} />
                    ))}
                    {(() => {
                      const avgCount = dealFlowData.length > 0 ? dealFlowData.reduce((s, d) => s + d.count, 0) / dealFlowData.length : 0;
                      return <ReferenceLine yAxisId="count" y={avgCount} stroke={COLORS.textMuted} strokeDasharray="5 3" label={{ value: "Avg", position: "insideTopLeft", fill: COLORS.textMuted, fontSize: 9 }} />;
                    })()}
                    <Bar yAxisId="count" dataKey="count" fill={COLORS.accent} radius={[3, 3, 0, 0]} name="# Contracts" maxBarSize={32} opacity={0.85} cursor={viewMode !== "cumulative" ? "pointer" : "default"} />
                    <Line yAxisId="value" type="monotone" dataKey="total" stroke={COLORS.gold} strokeWidth={2} dot={{ fill: COLORS.gold, r: 3 }} name="Value ($M)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Col 2: Status breakdown */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>STATUS BREAKDOWN</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 16 }}>{filteredContracts.length} contracts{filteredContracts.length < CONTRACTS.length ? ` (of ${CONTRACTS.length})` : ""}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {statusData.map(s => {
                const pct = filteredContracts.length ? ((s.value / filteredContracts.length) * 100).toFixed(0) : 0;
                return (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontSize: 11, color: s.fill, fontWeight: 700 }}>{s.value} <span style={{ color: COLORS.textMuted, fontWeight: 400 }}>({pct}%)</span></span>
                    </div>
                    <div style={{ background: COLORS.border, borderRadius: 4, height: 8 }}>
                      <div style={{ width: `${pct}%`, background: s.fill, borderRadius: 4, height: 8, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Row 2: Contract size distribution — full width */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          {sizeDrill === null ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>CONTRACT SIZE DISTRIBUTION</div>
                    <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 5, padding: 2, gap: 2 }}>
                      {[["overview","Overview"],["byYear","By Year"]].map(([v,l]) => (
                        <button key={v} onClick={() => setSizeMode(v)} style={{ padding: "3px 9px", fontSize: 9, fontWeight: 700, borderRadius: 3, cursor: "pointer", border: "none", background: sizeMode === v ? COLORS.accent : "transparent", color: sizeMode === v ? "#0a0e17" : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase", transition: "all 0.15s" }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 3 }}>{sizeMode === "byYear" ? "Stacked count by year and bucket · filtered set" : "By contract ceiling value · click any bar to see constituent contracts"}</div>
                </div>
                {/* Inline legend — color swatches right-aligned inside the card header */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", justifyContent: "flex-end", maxWidth: "60%" }}>
                  {valueBuckets.map((b, i) => (
                    <span key={b.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: COLORS.textMuted, whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
              {sizeMode === "byYear" ? (
                (() => {
                  const BUCKET_NAMES = ["< $1M","$1M–$5M","$5M–$25M","$25M–$100M","$100M–$500M","$500M–$1B","> $1B"];
                  const BUCKET_MIN =   [0, 1, 5, 25, 100, 500, 1000];
                  const BUCKET_MAX =   [1, 5, 25, 100, 500, 1000, Infinity];
                  const yearBucketMap = {};
                  filteredContracts.forEach(c => {
                    if (!c.year) return;
                    if (!yearBucketMap[c.year]) yearBucketMap[c.year] = {};
                    const v = c.value || 0;
                    BUCKET_NAMES.forEach((bn, bi) => {
                      if (v >= BUCKET_MIN[bi] && v < BUCKET_MAX[bi]) {
                        yearBucketMap[c.year][bn] = (yearBucketMap[c.year][bn] || 0) + 1;
                      }
                    });
                  });
                  const byYearData = Object.entries(yearBucketMap).map(([year, bkts]) => ({ year: Number(year), ...bkts })).sort((a, b) => a.year - b.year);
                  const activeBuckets = BUCKET_NAMES.filter(bn => byYearData.some(d => d[bn]));
                  return (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={byYearData} margin={{ left: 10, right: 20, top: 24, bottom: 10 }} barCategoryGap="18%">
                        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: "Contracts", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 9, dy: 30 }} />
                        <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 11 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} />
                        <Legend wrapperStyle={{ fontSize: 9, color: COLORS.textDim }} />
                        {activeBuckets.map((bn, bi) => (
                          <Bar key={bn} dataKey={bn} stackId="a" fill={PIE_COLORS[BUCKET_NAMES.indexOf(bn) % PIE_COLORS.length]} radius={bi === activeBuckets.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()
              ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={valueBuckets} margin={{ left: 10, right: 20, top: 24, bottom: 30 }} barCategoryGap="18%"
                  onClick={e => { if (e && e.activePayload && e.activePayload[0]) setSizeDrill(e.activePayload[0].payload.name); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" dy={6} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: "Contracts", angle: -90, position: "insideLeft", fill: COLORS.textMuted, fontSize: 9, dy: 30 }} />
                  <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 11 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM}
                    formatter={(v, n, props) => {
                      const tot = props.payload.total;
                      return [`${v} contracts · $${tot >= 1000 ? (tot/1000).toFixed(1)+"B" : tot.toFixed(0)+"M"} total value`, ""];
                    }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Contracts" cursor="pointer"
                    label={{ position: "top", formatter: v => v > 0 ? v : "", fill: COLORS.textDim, fontSize: 10, fontWeight: 700 }}>
                    {valueBuckets.map((b, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </>
          ) : (
            (() => {
              const bucket = valueBuckets.find(b => b.name === sizeDrill) || { contracts: [], total: 0 };
              const bIdx = valueBuckets.findIndex(b => b.name === sizeDrill);
              const bColor = PIE_COLORS[bIdx % PIE_COLORS.length];
              const drillContracts = [...bucket.contracts].sort((a, b) => (b.value || 0) - (a.value || 0));
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <button onClick={() => setSizeDrill(null)} style={{ background: `${bColor}18`, color: bColor, border: `1px solid ${bColor}44`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>← Back</button>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{sizeDrill}</span>
                      <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 10 }}>{drillContracts.length} contract{drillContracts.length !== 1 ? "s" : ""} · ${bucket.total >= 1000 ? (bucket.total/1000).toFixed(1)+"B" : bucket.total.toFixed(0)+"M"} total value</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {drillContracts.map((c, i) => {
                      const statusColor = c.status === "Active" ? COLORS.green : c.status === "Completed" ? COLORS.textMuted : c.status === "Under Review" ? COLORS.gold : COLORS.accent;
                      return (
                        <div key={i} style={{ background: `${bColor}08`, border: `1px solid ${bColor}30`, borderRadius: 8, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, lineHeight: 1.3, flex: 1, marginRight: 8 }}>{c.entity}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: bColor, whiteSpace: "nowrap" }}>${c.value != null ? (c.value >= 1000 ? (c.value/1000).toFixed(2)+"B" : c.value.toFixed(0)+"M") : "N/A"}</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", fontSize: 9 }}>
                            {[["Year", c.year], ["Status", c.status], ["Sector", c.sector], ["Country", c.country], ["Product", c.product], ["Procurement", c.procurement]].map(([label, val]) => (
                              <div key={label}>
                                <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>{label} </span>
                                <span style={{ color: label === "Status" ? statusColor : COLORS.textDim }}>{val || "—"}</span>
                              </div>
                            ))}
                          </div>
                          {c.description && <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 8, lineHeight: 1.4, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>{c.description}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* Row 4: Procurement type — full width */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            {procDrill ? (
              /* DRILL-DOWN VIEW */
              (() => {
                const rawName = procArr.find((d, i) => {
                  const origName = Object.entries(procurementData).sort((a,b)=>b[1]-a[1])[i]?.[0] || "";
                  return d.name === procDrill || origName === procDrill;
                });
                const drillContracts = filteredContracts.filter(c => {
                  const p = (c.procurement || "").trim();
                  const truncated = p.length > 22 ? p.slice(0, 20) + "\u2026" : p;
                  return truncated === procDrill || p === procDrill;
                });
                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <button onClick={() => setProcDrill(null)} style={{ background: `${COLORS.accent}18`, color: COLORS.accent, border: `1px solid ${COLORS.accent}44`, borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>← Back</button>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{procDrill || "Unspecified"}</div>
                        <div style={{ fontSize: 10, color: COLORS.textMuted }}>{drillContracts.length} contract{drillContracts.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {drillContracts.sort((a,b) => (b.value||0)-(a.value||0)).map(c => (
                        <div key={c.id} style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: COLORS.textDim }}>{c.entity} · {c.country} · {c.year}</div>
                              {c.statusDetail && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, lineHeight: 1.4 }}>{c.statusDetail}</div>}
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold }}>{fmt(c.value)}</div>
                              <StatusBadge status={c.status} />
                            </div>
                          </div>
                          {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 10, color: COLORS.accent, textDecoration: "none" }}>View Source →</a>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : (
              /* TREEMAP VIEW — 2D block, area ∝ sqrt-scaled count for readability */
              (() => {
                const totalProc = procArr.reduce((s, d) => s + d.value, 0);
                // Scale values by ^0.65 so smaller blocks get more breathing room
                const scaled = procArr.map(d => ({ ...d, _sv: Math.pow(d.value, 0.65) }));
                const tmBlocks = computeTreemap(scaled, 0, 0, 100, 100);
                return (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>PROCUREMENT TYPE</div>
                    <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 10 }}>
                      {totalProc} contracts total · click any block to drill in
                    </div>
                    <div style={{ position: "relative", width: "100%", height: 380 }}>
                      {tmBlocks.map((d, i) => {
                        const col = PIE_COLORS[i % PIE_COLORS.length];
                        const pct = ((d.value / totalProc) * 100).toFixed(1);
                        return (
                          <div
                            key={i}
                            onClick={() => setProcDrill(d.name)}
                            title={`${d.name || "Unspecified"}: ${d.value} contracts (${pct}%)`}
                            style={{
                              position: "absolute",
                              left: `${d.x}%`,
                              top: `${d.y}%`,
                              width: `calc(${d.w}% - 2px)`,
                              height: `calc(${d.h}% - 2px)`,
                              background: `${col}18`,
                              border: `1px solid ${col}55`,
                              borderRadius: 4,
                              padding: 10,
                              boxSizing: "border-box",
                              cursor: "pointer",
                              overflow: "hidden",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              transition: "background 0.15s, border-color 0.15s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${col}35`; e.currentTarget.style.borderColor = col; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${col}18`; e.currentTarget.style.borderColor = `${col}55`; }}
                          >
                            <div style={{ fontSize: Math.max(12, Math.min(28, d.w * 0.8)), fontWeight: 800, color: col, lineHeight: 1 }}>{d.value}</div>
                            <div style={{ fontSize: Math.max(9, Math.min(12, d.w * 0.35)), color: COLORS.textDim, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" }}>
                              {d.name || "Unspecified"}
                              <span style={{ display: "block", color: COLORS.textMuted, fontSize: 9, marginTop: 2 }}>{pct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
        </div>

        {/* Row 3: Product frequency */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>PALANTIR PRODUCT FREQUENCY</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Contracts listing each product · contracts with multiple products count toward each · sorted by frequency</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={prodArr} layout="vertical" margin={{ left: 10, right: 40 }}>
              <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={140} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [v, "Contracts"]} />
              <Bar dataKey="value" fill={COLORS.pink} radius={[0, 4, 4, 0]} name="Contracts" maxBarSize={28} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // ===== RUN RATE TAB =====
  const renderRunRate = () => {
    const YEARS_RANGE = Array.from({ length: 2035 - 2005 + 1 }, (_, i) => 2005 + i);
    const contractsWithRR = CONTRACTS.filter(c => RUN_RATES[c.id]).map(c => {
      const rr = RUN_RATES[c.id];
      return { ...c, sy: rr.sy, ey: rr.ey, av: rr.av, rrNotes: rr.notes };
    });

    const yearTotals = {};
    YEARS_RANGE.forEach(y => { yearTotals[y] = { total: 0, defense: 0, homeland: 0, health: 0, intel: 0, intl: 0, other: 0 }; });
    contractsWithRR.forEach(c => {
      for (let y = c.sy; y <= Math.min(c.ey, 2035); y++) {
        if (!yearTotals[y]) continue;
        yearTotals[y].total += c.av;
        if (c.sector === "Defense") yearTotals[y].defense += c.av;
        else if (c.sector === "Homeland Security") yearTotals[y].homeland += c.av;
        else if (c.sector === "Public Health" || c.sector === "Govt - Health" || c.sector === "Govt - Veterans") yearTotals[y].health += c.av;
        else if (c.sector === "Intelligence") yearTotals[y].intel += c.av;
        else if (c.region !== "North America") yearTotals[y].intl += c.av;
        else yearTotals[y].other += c.av;
      }
    });
    const chartData = YEARS_RANGE.filter(y => yearTotals[y].total > 0).map(y => ({ year: y, ...yearTotals[y] }));

    const countryYearMap = {};
    contractsWithRR.forEach(c => {
      if (!countryYearMap[c.country]) countryYearMap[c.country] = {};
      for (let y = c.sy; y <= Math.min(c.ey, 2035); y++) {
        countryYearMap[c.country][y] = (countryYearMap[c.country][y] || 0) + c.av;
      }
    });

    const current2026 = contractsWithRR.filter(c => c.sy <= 2026 && c.ey >= 2026);
    const total2026 = current2026.reduce((s, c) => s + c.av, 0);
    const displayYears = YEARS_RANGE.filter(y => y >= 2018 && y <= 2032);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Stat label="2026 Annual Run Rate" value={`$${total2026.toFixed(0)}M`} sub={`${current2026.length} active contracts contributing`} color={COLORS.accent} />
          <Stat label="Peak Run Rate Year" value={(() => { const peak = chartData.reduce((m, d) => d.total > m.total ? d : m, { total: 0, year: 0 }); return `${peak.year}`; })()} sub={`$${chartData.reduce((m, d) => d.total > m.total ? d : m, { total: 0 }).total.toFixed(0)}M`} color={COLORS.gold} />
          <Stat label="Contracts w/ Run Rate" value={contractsWithRR.length} sub={`of ${CONTRACTS.length} total`} color={COLORS.green} />
          <Stat label="Defense Share (2026)" value={`${yearTotals[2026] ? ((yearTotals[2026].defense / (yearTotals[2026].total || 1)) * 100).toFixed(0) : 0}%`} sub={`$${yearTotals[2026]?.defense?.toFixed(0) || 0}M`} color={COLORS.purple} />
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>ANNUAL REVENUE RUN RATE BY SECTOR ($M)</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Calculated as contract ceiling value / contract duration in years.</div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ left: 10, right: 20, top: 10 }}>
              <defs>
                <linearGradient id="gDef" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e5ff" stopOpacity={0.4} /><stop offset="95%" stopColor="#00e5ff" stopOpacity={0} /></linearGradient>
                <linearGradient id="gHS" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                <linearGradient id="gHL" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient>
                <linearGradient id="gINT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} /><stop offset="95%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                <linearGradient id="gIntl" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f472b6" stopOpacity={0.4} /><stop offset="95%" stopColor="#f472b6" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 10 }} axisLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload || {};
                  const total = (d.defense || 0) + (d.homeland || 0) + (d.health || 0) + (d.intel || 0) + (d.intl || 0) + (d.other || 0);
                  return (
                    <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                      <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                      {[["defense","Defense","#00e5ff"],["homeland","Homeland Security","#f59e0b"],["health","Health / Veterans","#22c55e"],["intel","Intelligence","#a78bfa"],["intl","International","#f472b6"],["other","Other Govt","#64748b"]].filter(([k]) => d[k] > 0).map(([k, name, col]) => (
                        <div key={k} style={{ color: col, marginBottom: 2 }}>{name}: <strong>${(d[k] || 0).toFixed(0)}M</strong></div>
                      ))}
                      <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6, color: COLORS.gold, fontWeight: 700 }}>Total: ${total.toFixed(0)}M</div>
                    </div>
                  );
                }} />
              <Legend wrapperStyle={{ fontSize: 10, color: COLORS.textDim }} />
              <ReferenceLine x={2026} stroke={COLORS.gold} strokeDasharray="4 4" label={{ value: "2026 (now)", fill: COLORS.gold, fontSize: 10 }} />
              {PALANTIR_EVENTS.map(ev => (
                <ReferenceLine key={ev.year} x={ev.year} stroke={ev.color} strokeDasharray="3 3" strokeWidth={1}
                  label={{ value: ev.label, position: "top", fill: ev.color, fontSize: 7, angle: -45, dy: -4 }} />
              ))}
              <Area type="monotone" dataKey="defense" stackId="1" stroke="#00e5ff" fill="url(#gDef)" name="Defense" />
              <Area type="monotone" dataKey="homeland" stackId="1" stroke="#f59e0b" fill="url(#gHS)" name="Homeland Security" />
              <Area type="monotone" dataKey="health" stackId="1" stroke="#22c55e" fill="url(#gHL)" name="Health / Veterans" />
              <Area type="monotone" dataKey="intel" stackId="1" stroke="#a78bfa" fill="url(#gINT)" name="Intelligence" />
              <Area type="monotone" dataKey="intl" stackId="1" stroke="#f472b6" fill="url(#gIntl)" name="International" />
              <Area type="monotone" dataKey="other" stackId="1" stroke="#64748b" fill="#64748b22" name="Other Govt" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Row 2: 3 columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>TOP CONTRACTS BY ANNUAL RUN RATE ($M/yr)</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Estimated annualised spend · ceiling ÷ duration</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topByRunRate} layout="vertical" margin={{ left: 10, right: 60 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}M`} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 9 }} width={150} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [`$${v.toFixed(1)}M/yr`, "Annual Run Rate"]} />
                <Bar dataKey="av" fill={COLORS.accent} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => `$${v.toFixed(0)}M` }}>
                  {topByRunRate.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>2026 RUN RATE — SECTOR BREAKDOWN ($M/yr)</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Estimated annual spend by sector for calendar year 2026</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={Object.entries({ Defense: yearTotals[2026]?.defense || 0, "Homeland Sec.": yearTotals[2026]?.homeland || 0, Health: yearTotals[2026]?.health || 0, Intelligence: yearTotals[2026]?.intel || 0, International: yearTotals[2026]?.intl || 0, Other: yearTotals[2026]?.other || 0 }).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                layout="vertical" margin={{ left: 10, right: 60 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}M`} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={100} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [`$${v.toFixed(1)}M/yr`, "Run Rate"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => `$${v.toFixed(0)}M` }}>
                  {[COLORS.accent, COLORS.gold, COLORS.green, COLORS.purple, COLORS.pink, COLORS.red].map((c, i) => <Cell key={i} fill={c} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Col 3: 2026 run rate by country */}
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 }}>2026 RUN RATE — TOP COUNTRIES ($M/yr)</div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Countries with active contracts in 2026</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={Object.entries(countryYearMap).map(([country, yrs]) => ({ name: country, value: yrs[2026] || 0 })).filter(d => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 10)}
                layout="vertical" margin={{ left: 10, right: 56 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}M`} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={110} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={TT_LABEL} itemStyle={TT_ITEM} formatter={v => [`$${v.toFixed(1)}M/yr`, "2026 Run Rate"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 9, fill: COLORS.textMuted, formatter: v => `$${v.toFixed(0)}M` }}>
                  {Array.from({length: 10}, (_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>ANNUAL RUN RATE BY COUNTRY ($M)</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Heatmap intensity = relative annual run rate.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, position: "sticky", left: 0, background: COLORS.card, zIndex: 2, minWidth: 100 }}>Country</th>
                  {displayYears.map(y => <th key={y} style={{ padding: "6px 4px", textAlign: "center", color: y === 2026 ? COLORS.accent : COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`, minWidth: 44, fontWeight: y === 2026 ? 700 : 400 }}>{y}</th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(countryYearMap).sort((a, b) => {
                  const ta = Object.values(a[1]).reduce((s, v) => s + v, 0);
                  const tb = Object.values(b[1]).reduce((s, v) => s + v, 0);
                  return tb - ta;
                }).map(([country, yrs]) => {
                  const maxVal = Math.max(...displayYears.map(y => yrs[y] || 0), 1);
                  return (
                    <tr key={country}>
                      <td style={{ padding: "6px 8px", color: COLORS.text, fontWeight: 600, borderBottom: `1px solid ${COLORS.border}`, position: "sticky", left: 0, background: COLORS.card, zIndex: 1 }}>{country}</td>
                      {displayYears.map(y => {
                        const val = yrs[y] || 0;
                        const intensity = val > 0 ? Math.max(0.1, val / maxVal) : 0;
                        return (
                          <td key={y} title={`${country} ${y}: $${val.toFixed(1)}M`} style={{ padding: "6px 4px", textAlign: "center", borderBottom: `1px solid ${COLORS.border}`, background: val > 0 ? `rgba(0, 229, 255, ${intensity * 0.35})` : "transparent", color: val > 0 ? COLORS.text : COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: val > 200 ? 700 : 400, borderLeft: y === 2026 ? `2px solid ${COLORS.accent}44` : "none", borderRight: y === 2026 ? `2px solid ${COLORS.accent}44` : "none" }}>
                            {val > 0 ? val.toFixed(0) : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ borderTop: `2px solid ${COLORS.accent}44` }}>
                  <td style={{ padding: "8px 8px", color: COLORS.accent, fontWeight: 700, position: "sticky", left: 0, background: COLORS.card, zIndex: 1 }}>TOTAL</td>
                  {displayYears.map(y => {
                    const tot = yearTotals[y]?.total || 0;
                    return <td key={y} style={{ padding: "8px 4px", textAlign: "center", color: COLORS.accent, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, borderLeft: y === 2026 ? `2px solid ${COLORS.accent}44` : "none", borderRight: y === 2026 ? `2px solid ${COLORS.accent}44` : "none" }}>{tot > 0 ? tot.toFixed(0) : "\u2014"}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>CONTRACT-LEVEL ANNUAL RUN RATE ($M)</div>
          {/* Controls */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search contracts or entities…"
              value={rrSearch}
              onChange={e => setRrSearch(e.target.value)}
              style={{ flex: "1 1 180px", minWidth: 150, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, outline: "none" }}
            />
            <select value={rrSectorFilter} onChange={e => setRrSectorFilter(e.target.value)}
              style={{ background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 11, outline: "none", cursor: "pointer" }}>
              <option value="All">All Sectors</option>
              {[...new Set(contractsWithRR.map(c => c.sector))].sort().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ display: "flex", gap: 4 }}>
              {[["av","Run Rate"],["name","Name"],["sy","Start Yr"],["ey","End Yr"]].map(([k,l]) => (
                <button key={k} onClick={() => { if (rrSort === k) setRrSortDir(d => d === "asc" ? "desc" : "asc"); else { setRrSort(k); setRrSortDir("desc"); } }}
                  style={{ padding: "5px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: "pointer", border: `1px solid ${rrSort===k ? COLORS.gold : COLORS.border}`, background: rrSort===k ? `${COLORS.gold}18` : "transparent", color: rrSort===k ? COLORS.gold : COLORS.textMuted, letterSpacing: 0.4, textTransform: "uppercase" }}>
                  {l}{rrSort===k ? (rrSortDir==="desc" ? " ↓" : " ↑") : ""}
                </button>
              ))}
            </div>
            {(rrSearch || rrSectorFilter !== "All") && (
              <button onClick={() => { setRrSearch(""); setRrSectorFilter("All"); }} style={{ padding: "5px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: "pointer", background: COLORS.border, color: COLORS.textDim, border: "none" }}>RESET</button>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, position: "sticky", left: 0, background: COLORS.card, zIndex: 2, minWidth: 200 }}>Contract</th>
                  <th style={{ padding: "6px 8px", textAlign: "left", color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, minWidth: 90 }}>Entity</th>
                  <th style={{ padding: "6px 6px", textAlign: "center", color: COLORS.gold, borderBottom: `2px solid ${COLORS.border}`, minWidth: 55, fontWeight: 700 }}>$/Yr</th>
                  <th style={{ padding: "6px 6px", textAlign: "center", color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, minWidth: 44 }}>Yrs</th>
                  {displayYears.map(y => <th key={y} style={{ padding: "6px 3px", textAlign: "center", color: y === 2026 ? COLORS.accent : COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, minWidth: 34, fontWeight: y === 2026 ? 700 : 400, fontSize: 9 }}>{String(y).slice(2)}</th>)}
                </tr>
              </thead>
              <tbody>
                {contractsWithRR
                  .filter(c => {
                    if (rrSectorFilter !== "All" && c.sector !== rrSectorFilter) return false;
                    if (rrSearch) {
                      const q = rrSearch.toLowerCase();
                      if (!c.name.toLowerCase().includes(q) && !c.entity.toLowerCase().includes(q)) return false;
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    let av = a[rrSort], bv = b[rrSort];
                    if (rrSort === "av" || rrSort === "sy" || rrSort === "ey") { av = av||0; bv = bv||0; }
                    if (av < bv) return rrSortDir === "asc" ? -1 : 1;
                    if (av > bv) return rrSortDir === "asc" ? 1 : -1;
                    return 0;
                  })
                  .map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "5px 8px", color: COLORS.text, fontWeight: 500, position: "sticky", left: 0, background: COLORS.card, zIndex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} title={c.rrNotes}>{c.name}</td>
                    <td style={{ padding: "5px 8px", color: COLORS.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{c.country === "United States" ? c.entity.split("/").pop().trim().slice(0,15) : c.country.slice(0,10)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "center", color: COLORS.gold, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{c.av.toFixed(0)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "center", color: COLORS.textDim }}>{c.ey - c.sy + 1}</td>
                    {displayYears.map(y => {
                      const active = y >= c.sy && y <= c.ey;
                      return (
                        <td key={y} style={{ padding: "5px 3px", textAlign: "center", background: active ? "rgba(34, 197, 94, 0.12)" : "transparent", color: active ? COLORS.green : "transparent", fontFamily: "'JetBrains Mono', monospace", fontSize: 8, borderLeft: y === 2026 ? `1px solid ${COLORS.accent}33` : "none" }}>
                          {active ? "\u2588" : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, marginBottom: 6 }}>METHODOLOGY & CAVEATS</div>
          <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.7 }}>
            Annual run rate = contract ceiling value / contract duration in years. This represents the <span style={{ color: COLORS.accent, fontWeight: 600 }}>maximum theoretical annual revenue</span>, not actual obligated spend. Key caveats: (1) The $10B Army EA consolidates existing contracts. (2) IDIQ ceilings are maximums. (3) Classified IC contracts excluded. (4) Non-USD converted at approximate rates. (5) Undisclosed values excluded. (6) Reasonable end-date estimates used where not specified.
          </div>
        </div>
      </div>
    );
  };

  // ===== FINANCIALS TAB =====
  const renderFinancials = () => {
    const FIN = window.PLTR_FINANCIALS;
    const DOCS = window.PALANTIR_OFFICIAL_DOCS;
    const allQ = FIN.quarters;
    const metaCat = FIN.metrics;
    const latestMetrics = DOCS.latestMetrics;
    // ── helpers ──────────────────────────────────────────────────────────────
    const fmtVal = (v, fmt) => {
      if (v == null) return "—";
      if (fmt === "usd")        return v >= 1000 ? `$${(v/1000).toFixed(2)}B` : `$${v.toFixed(0)}M`;
      if (fmt === "usd_signed") return (v >= 0 ? "+" : "") + (Math.abs(v) >= 1000 ? `$${(Math.abs(v)/1000).toFixed(2)}B` : `$${Math.abs(v).toFixed(0)}M`);
      if (fmt === "pct")        return `${v.toFixed(1)}%`;
      if (fmt === "pct_signed") return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
      if (fmt === "count")      return v.toLocaleString();
      if (fmt === "eps")        return `$${v.toFixed(2)}`;
      return String(v);
    };
    const getMeta  = key => metaCat.find(m => m.key === key) || { key, label: key, fmt: "count", color: COLORS.accent, unit: "" };
    const getColor = key => getMeta(key).color;
    const getCats  = () => [...new Set(metaCat.map(m => m.cat))];

    // ── filtered data ────────────────────────────────────────────────────────
    const rangeData = (() => {
      let data = [...allQ];
      if (finRange === "2022") data = data.filter(d => d.q >= "Q1 2022");
      if (finRange === "2024") data = data.filter(d => d.q >= "Q1 2024");
      if (finRange === "last8") data = data.slice(-8);
      return data;
    })();

    const catMetrics = metaCat.filter(m => m.cat === finCat);
    const primaryMeta = getMeta(finPrimary);
    const compareMeta = finCompare !== "null" ? getMeta(finCompare) : null;
    const hasPrimaryData = rangeData.some(d => d[finPrimary] != null);

    // ── drill-down docs ──────────────────────────────────────────────────────
    const getDocs = qLabel => ({
      letter:       DOCS.letters.find(l => l.quarter === qLabel),
      earnings:     (DOCS.earnings || []).find(e => e.quarter === qLabel),
      presentation: DOCS.presentations.find(p => p.quarter === qLabel),
    });

    // ── KPI stat cards ───────────────────────────────────────────────────────
    const SC = ({ label, value, sub, color }) => (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 18px" }}>
        <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: color || COLORS.accent, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 4, lineHeight: 1.3 }}>{sub}</div>}
      </div>
    );

    // ── chart events for range ────────────────────────────────────────────────
    const chartEvents = PALANTIR_EVENTS.filter(ev => rangeData.some(d => d.q && d.q.includes(String(ev.year))));

    // ── tooltip content ──────────────────────────────────────────────────────
    const FinTooltip = ({ active, payload, label }) => {
      if (!active || !payload?.length) return null;
      const d = payload[0]?.payload;
      const ev = PALANTIR_EVENTS.find(e => d?.q?.includes(String(e.year)));
      return (
        <div style={{ background: "#182638", border: `1px solid ${COLORS.accentDim}55`, borderRadius: 8, padding: "10px 14px", fontSize: 11, minWidth: 200, maxWidth: 280 }}>
          <div style={{ color: COLORS.text, fontWeight: 700, marginBottom: 8, fontSize: 12 }}>{label}</div>
          <div style={{ color: primaryMeta.color, marginBottom: 4 }}>
            {primaryMeta.label}: <strong>{fmtVal(d?.[finPrimary], primaryMeta.fmt)}</strong>
          </div>
          {compareMeta && d?.[finCompare] != null && (
            <div style={{ color: compareMeta.color, marginBottom: 4 }}>
              {compareMeta.label}: <strong>{fmtVal(d?.[finCompare], compareMeta.fmt)}</strong>
            </div>
          )}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 8, paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", fontSize: 10 }}>
            {[["Revenue", d?.rev, "usd"], ["Gov Seg", d?.govSeg, "usd"], ["Commercial", d?.com, "usd"],
              ["GAAP Op Inc", d?.opIncome, "usd_signed"], ["Adj Op Inc", d?.adjOpIncome, "usd_signed"],
              ["FCF", d?.fcf, "usd_signed"], ["YoY Growth", d?.revYoY, "pct"],
              ["Gross Margin", d?.gm, "pct"], ["Customers", d?.customers, "count"]
            ].filter(([, v]) => v != null).slice(0, 8).map(([lbl, val, fmt]) => (
              <div key={lbl}>
                <span style={{ color: COLORS.textMuted }}>{lbl} </span>
                <span style={{ color: COLORS.textDim }}>{fmtVal(val, fmt)}</span>
              </div>
            ))}
          </div>
          {ev && <div style={{ marginTop: 8, fontSize: 9, color: ev.color, fontWeight: 600, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>★ {ev.label}</div>}
          {d?.note && <div style={{ marginTop: 6, fontSize: 9, color: COLORS.textMuted, lineHeight: 1.3, borderTop: `1px solid ${COLORS.border}`, paddingTop: 6 }}>{d.note}</div>}
          <div style={{ marginTop: 6, fontSize: 9, color: COLORS.textMuted }}>Click to drill into full quarter detail</div>
        </div>
      );
    };

    // annualRev kept for future use
    const annualRev = DOCS.annualRevenue;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── KPI snapshot ─────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
          <SC label="FY 2025 Revenue"        value="$4.48B"    sub="+53% YoY · 22 quarters reported"    color={COLORS.accent} />
          <SC label="Q4 2025 Revenue"        value="$1.407B"   sub="+70% YoY · first >$1B × 4 qtrs"     color={COLORS.green} />
          <SC label="US Gov Rev FY25"        value="$1.855B"   sub="+66% YoY · 41% of total"            color={COLORS.gold} />
          <SC label="US Comm Rev FY25"       value="$1.393B"   sub="+120%+ YoY growth"                  color="#a78bfa" />
          <SC label="Adj Op Margin Q4 25"    value="~49.8%"    sub="Rule of 40 = 120"                   color={COLORS.green} />
          <SC label="FCF Q4 2025"            value="$799M"     sub="FCF margin 56.8%"                   color="#34d399" />
          <SC label="Net Dollar Retention"   value="139%"      sub="Q4 2025 · up from 107% (Q4 2023)"   color={COLORS.pink} />
          <SC label="Remaining Deal Value"   value="$11.2B"    sub="+105% YoY · RPO $4.2B (+144%)"      color="#fbbf24" />
          <SC label="FY 2026 Guidance"       value="$7.18–7.20B" sub="+61% YoY · US Comm +115% guided" color={COLORS.accent} />
          <SC label="Total Customers"        value="954"       sub="954 at Q4 2025 · 702 US commercial"  color={COLORS.gold} />
        </div>

        {/* ── Chart module ──────────────────────────────────────────────────── */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>

          {finDrillQ ? (
            // ── DRILL-DOWN ────────────────────────────────────────────────────
            (() => {
              const qd = allQ.find(q => q.q === finDrillQ);
              const docs = getDocs(finDrillQ);
              const col = COLORS.accent;
              const allMetrics = metaCat.filter(m => qd?.[m.key] != null);
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <button onClick={() => setFinDrillQ(null)} style={{ background: `${col}18`, color: col, border: `1px solid ${col}44`, borderRadius: 6, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>← Back</button>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{finDrillQ} — Full Quarter Detail</span>
                      {qd?.note && <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>{qd.note}</div>}
                    </div>
                  </div>
                  {/* All metrics grid */}
                  {getCats().map(cat => {
                    const catMs = metaCat.filter(m => m.cat === cat && qd?.[m.key] != null);
                    if (!catMs.length) return null;
                    return (
                      <div key={cat} style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 6 }}>{cat}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                          {catMs.map(m => (
                            <div key={m.key} style={{ background: `${m.color}08`, border: `1px solid ${m.color}25`, borderRadius: 7, padding: "10px 14px" }}>
                              <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>{m.label}</div>
                              <div style={{ fontSize: 17, fontWeight: 800, color: m.color }}>{fmtVal(qd[m.key], m.fmt)}</div>
                              {m.note && <div style={{ fontSize: 8, color: COLORS.textMuted, marginTop: 3 }}>{m.note}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Source docs */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Source Documents</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        docs.letter       && { label: "Shareholder Letter",          url: docs.letter.url,       note: docs.letter.notes },
                        docs.earnings     && { label: "Earnings Press Release",       url: docs.earnings.url,     note: docs.earnings.notes },
                        docs.presentation && { label: "Investor Presentation (PDF)",  url: docs.presentation.url, note: "" },
                      ].filter(Boolean).map((doc, i) => (
                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: `${COLORS.accentDim}10`, border: `1px solid ${COLORS.accentDim}30`, borderRadius: 7, padding: "10px 14px", textDecoration: "none" }}>
                          <span style={{ fontSize: 11, color: COLORS.accent, fontWeight: 600 }}>{doc.label}</span>
                          {doc.note && <span style={{ fontSize: 9, color: COLORS.textMuted, maxWidth: "55%", textAlign: "right" }}>{doc.note}</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            // ── CHART MODULE ──────────────────────────────────────────────────
            <div>
              {/* Controls row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>

                {/* Category tabs */}
                <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 6, padding: 2, gap: 1 }}>
                  {getCats().map(cat => (
                    <button key={cat} onClick={() => { setFinCat(cat); setFinPrimary(metaCat.find(m => m.cat === cat)?.key || finPrimary); }}
                      style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: "pointer", border: "none", background: finCat === cat ? COLORS.accent : "transparent", color: finCat === cat ? "#0a0e17" : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase", transition: "all 0.15s" }}>{cat}</button>
                  ))}
                </div>

                {/* Primary metric dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: COLORS.textMuted, whiteSpace: "nowrap" }}>Metric</span>
                  <select value={finPrimary} onChange={e => setFinPrimary(e.target.value)}
                    style={{ background: "#182638", color: COLORS.text, border: `1px solid ${COLORS.accent}55`, borderRadius: 5, padding: "4px 10px", fontSize: 11, cursor: "pointer", outline: "none" }}>
                    {catMetrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>

                {/* Compare metric dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, color: COLORS.textMuted, whiteSpace: "nowrap" }}>Compare</span>
                  <select value={finCompare} onChange={e => setFinCompare(e.target.value)}
                    style={{ background: "#182638", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 5, padding: "4px 10px", fontSize: 11, cursor: "pointer", outline: "none" }}>
                    <option value="null">— None —</option>
                    {metaCat.filter(m => m.key !== finPrimary).map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>

                {/* Range filter */}
                <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 6, padding: 2, gap: 1 }}>
                  {[["all","All"],["2022","2022+"],["2024","2024+"],["last8","Last 8Q"]].map(([v,l]) => (
                    <button key={v} onClick={() => setFinRange(v)}
                      style={{ padding: "4px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: "pointer", border: "none", background: finRange === v ? `${COLORS.accent}33` : "transparent", color: finRange === v ? COLORS.accent : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase", transition: "all 0.15s" }}>{l}</button>
                  ))}
                </div>

                {/* Chart type */}
                <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 6, padding: 2, gap: 1 }}>
                  {[["bar","Bar"],["line","Line"],["area","Area"]].map(([v,l]) => (
                    <button key={v} onClick={() => setFinChartType(v)}
                      style={{ padding: "4px 10px", fontSize: 9, fontWeight: 700, borderRadius: 4, cursor: "pointer", border: "none", background: finChartType === v ? `${COLORS.accent}33` : "transparent", color: finChartType === v ? COLORS.accent : COLORS.textMuted, letterSpacing: 0.3, textTransform: "uppercase" }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Chart title */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{primaryMeta.label}</div>
                {compareMeta && <div style={{ fontSize: 11, color: compareMeta.color }}>vs {compareMeta.label}</div>}
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: "auto" }}>Click any data point to drill into that quarter</div>
              </div>

              {!hasPrimaryData ? (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted, fontSize: 12 }}>
                  No data available for <strong style={{ color: COLORS.textDim, marginLeft: 6 }}>{primaryMeta.label}</strong> in selected range. Try "All" range or a different metric.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={rangeData} margin={{ left: 10, right: compareMeta ? 60 : 20, top: 28, bottom: 50 }} barCategoryGap="18%"
                    onClick={e => { if (e?.activePayload?.[0]) setFinDrillQ(e.activePayload[0].payload.q); }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                    <XAxis dataKey="q" tick={{ fill: COLORS.textDim, fontSize: 9 }} axisLine={false} angle={-40} textAnchor="end" interval={0} dy={4} />
                    <YAxis yAxisId="primary" orientation="left" tick={{ fill: primaryMeta.color, fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => primaryMeta.unit === "$M" ? (Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v}M`) : primaryMeta.unit === "%" ? `${v}%` : v} />
                    {compareMeta && (
                      <YAxis yAxisId="compare" orientation="right" tick={{ fill: compareMeta.color, fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => compareMeta.unit === "$M" ? (Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}B` : `$${v}M`) : compareMeta.unit === "%" ? `${v}%` : v} />
                    )}
                    <Tooltip content={<FinTooltip />} />
                    {/* zero line for signed metrics */}
                    {["usd_signed","pct_signed"].includes(primaryMeta.fmt) && (
                      <ReferenceLine yAxisId="primary" y={0} stroke={COLORS.textMuted} strokeDasharray="4 2" label={{ value: "Breakeven", position: "insideTopLeft", fill: COLORS.textMuted, fontSize: 9 }} />
                    )}
                    {/* Palantir event markers */}
                    {chartEvents.map(ev => (
                      <ReferenceLine key={ev.year} yAxisId="primary" x={`Q4 ${ev.year}`} stroke={ev.color} strokeDasharray="4 3" strokeWidth={1.5}
                        label={{ value: ev.label, position: "top", fill: ev.color, fontSize: 8, angle: -35, dy: -6 }} />
                    ))}
                    {/* Primary series */}
                    {finChartType === "bar" && (
                      <Bar yAxisId="primary" dataKey={finPrimary} name={primaryMeta.label} radius={[3,3,0,0]} cursor="pointer" maxBarSize={40}>
                        {rangeData.map((d, i) => (
                          <Cell key={i} fill={primaryMeta.color} fillOpacity={d[finPrimary] < 0 ? 0.5 : 0.85} />
                        ))}
                      </Bar>
                    )}
                    {finChartType === "line" && (
                      <Line yAxisId="primary" type="monotone" dataKey={finPrimary} stroke={primaryMeta.color} strokeWidth={2.5} dot={{ r: 4, fill: primaryMeta.color, strokeWidth: 0 }} activeDot={{ r: 6 }} name={primaryMeta.label} connectNulls={false} />
                    )}
                    {finChartType === "area" && (
                      <Area yAxisId="primary" type="monotone" dataKey={finPrimary} stroke={primaryMeta.color} fill={`${primaryMeta.color}25`} strokeWidth={2} dot={{ r: 3, fill: primaryMeta.color }} name={primaryMeta.label} connectNulls={false} />
                    )}
                    {/* Compare series — always a line */}
                    {compareMeta && (
                      <Line yAxisId="compare" type="monotone" dataKey={finCompare} stroke={compareMeta.color} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: compareMeta.color }} name={compareMeta.label} connectNulls={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              )}

              {/* Mini metric info bar */}
              {primaryMeta.note && (
                <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 8, padding: "4px 10px", background: `${COLORS.accent}08`, borderRadius: 4, borderLeft: `2px solid ${COLORS.accent}44` }}>
                  Note: {primaryMeta.note}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── All-metrics data table ─────────────────────────────────────────── */}
        {!finDrillQ && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 14, letterSpacing: 0.5 }}>QUARTERLY FINANCIAL DATA TABLE</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, whiteSpace: "nowrap" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.5, textTransform: "uppercase", position: "sticky", left: 0, background: COLORS.card }}>Quarter</th>
                    {metaCat.map(m => (
                      <th key={m.key} onClick={() => { setFinCat(m.cat); setFinPrimary(m.key); }}
                        style={{ textAlign: "right", padding: "6px 10px", fontSize: 9, color: m.key === finPrimary ? m.color : COLORS.textMuted, letterSpacing: 0.4, textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap" }}
                        title={m.note || m.label}>{m.label.length > 16 ? m.label.slice(0,14)+"…" : m.label}</th>
                    ))}
                    <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, color: COLORS.textMuted }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rangeData].reverse().map((row, i) => {
                    const isLatest = i === 0;
                    const qEv = PALANTIR_EVENTS.find(e => row.q?.includes(String(e.year)));
                    return (
                      <tr key={i} onClick={() => setFinDrillQ(row.q)}
                        style={{ borderBottom: `1px solid ${COLORS.border}18`, cursor: "pointer", background: isLatest ? `${COLORS.accent}08` : "transparent", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = `${COLORS.accent}10`}
                        onMouseLeave={e => e.currentTarget.style.background = isLatest ? `${COLORS.accent}08` : "transparent"}>
                        <td style={{ padding: "7px 10px", color: isLatest ? COLORS.accent : COLORS.textDim, fontWeight: isLatest ? 700 : 500, position: "sticky", left: 0, background: isLatest ? `${COLORS.accent}08` : COLORS.card, fontSize: 10 }}>
                          {row.q}{qEv ? <span style={{ color: qEv.color, fontSize: 8, marginLeft: 4 }}>★</span> : null}
                        </td>
                        {metaCat.map(m => {
                          const v = row[m.key];
                          const isActive = m.key === finPrimary;
                          return (
                            <td key={m.key} style={{ padding: "7px 10px", textAlign: "right", color: v == null ? COLORS.border : isActive ? m.color : COLORS.textDim, fontWeight: isActive && v != null ? 700 : 400 }}>
                              {v == null ? "—" : fmtVal(v, m.fmt)}
                            </td>
                          );
                        })}
                        <td style={{ padding: "7px 10px", color: COLORS.textMuted, fontSize: 9, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row.note || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 10 }}>
              Click any column header to chart it · Click any row to open full quarter detail · ★ = notable Palantir milestone quarter
            </div>
          </div>
        )}

      </div>
    );
  };

  // ===== SOURCES TAB =====
  const renderSources = () => {
    const typeLabels = { official: "Official / Govt", fed_record: "Federal Record", palantir_ir: "Palantir IR", parliament: "Parliamentary", press: "Press / Trade" };
    const typeColors = { official: "#22c55e", fed_record: "#f59e0b", palantir_ir: "#a78bfa", parliament: "#06b6d4", press: "#94a3b8" };
    const typeIcons = { official: "\u25c6", fed_record: "\u25c8", palantir_ir: "\u25c7", parliament: "\u25a3", press: "\u25aa" };

    const allSources = (() => {
      const srcs = [];
      CONTRACTS.forEach(c => {
        if (!c.docs) return;
        c.docs.forEach(doc => {
          let domain = "";
          try { domain = new URL(doc.url).hostname.replace("www.", ""); } catch(e) { domain = "\u2014"; }
          srcs.push({ contractId: c.id, contractName: c.name, entity: c.entity, country: c.country, sector: c.sector, year: c.year, value: c.value, label: doc.label, url: doc.url, type: doc.type, typeName: typeLabels[doc.type] || "Other", domain });
        });
        if (c.url && c.docs && !c.docs.some(d => d.url === c.url)) {
          let domain = "";
          try { domain = new URL(c.url).hostname.replace("www.", ""); } catch(e) { domain = "\u2014"; }
          srcs.push({ contractId: c.id, contractName: c.name, entity: c.entity, country: c.country, sector: c.sector, year: c.year, value: c.value, label: `${c.source} \u2014 Primary Reference`, url: c.url, type: "press", typeName: "Press / Trade", domain });
        }
      });
      return srcs;
    })();

    const uniqueDomains = [...new Set(allSources.map(s => s.domain).filter(d => d !== "\u2014"))];
    const uniqueCountries = ["All", ...new Set(allSources.map(s => s.country).sort())];
    const typeOptions = ["All", ...Object.values(typeLabels)];

    const filteredSources = (() => {
      let data = allSources;
      if (srcSearch) {
        const s = srcSearch.toLowerCase();
        data = data.filter(r => r.label.toLowerCase().includes(s) || r.contractName.toLowerCase().includes(s) || r.entity.toLowerCase().includes(s) || r.domain.toLowerCase().includes(s) || r.url.toLowerCase().includes(s));
      }
      if (srcCountry !== "All") data = data.filter(r => r.country === srcCountry);
      if (srcType !== "All") data = data.filter(r => r.typeName === srcType);
      data = [...data].sort((a, b) => {
        let av, bv;
        if (srcSort === "contract") { av = a.contractName; bv = b.contractName; }
        else if (srcSort === "country") { av = a.country; bv = b.country; }
        else if (srcSort === "type") { av = a.typeName; bv = b.typeName; }
        else if (srcSort === "domain") { av = a.domain; bv = b.domain; }
        else if (srcSort === "year") { av = a.year; bv = b.year; }
        else if (srcSort === "entity") { av = a.entity; bv = b.entity; }
        else { av = a.label; bv = b.label; }
        if (av < bv) return srcSortDir === "asc" ? -1 : 1;
        if (av > bv) return srcSortDir === "asc" ? 1 : -1;
        return 0;
      });
      return data;
    })();

    const statsByType = {};
    allSources.forEach(s => { statsByType[s.type] = (statsByType[s.type] || 0) + 1; });

    const statsByDomain = (() => {
      const m = {};
      allSources.forEach(s => { if (s.domain !== "\u2014") m[s.domain] = (m[s.domain] || 0) + 1; });
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 15);
    })();

    const toggleSrcSort = (col) => {
      if (srcSort === col) setSrcSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSrcSort(col); setSrcSortDir("asc"); }
    };

    const SrcTh = ({ col, children, width }) => (
      <th onClick={() => toggleSrcSort(col)} style={{ cursor: "pointer", padding: "8px 6px", textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: srcSort === col ? COLORS.accent : COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, whiteSpace: "nowrap", width, userSelect: "none", position: col === "label" ? "sticky" : "static", left: col === "label" ? 0 : "auto", background: COLORS.card, zIndex: col === "label" ? 2 : 0 }}>
        {children} {srcSort === col ? (srcSortDir === "desc" ? "\u2193" : "\u2191") : ""}
      </th>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Stat label="Total Source Links" value={allSources.length} sub={`Across ${CONTRACTS.length} contracts`} color={COLORS.accent} />
          <Stat label="Unique Domains" value={uniqueDomains.length} sub="Govt portals, trade press, IR" color={COLORS.gold} />
          <Stat label="Official / Govt Sources" value={statsByType.official || 0} sub="Agency releases & procurement portals" color="#22c55e" />
          <Stat label="Federal Records" value={statsByType.fed_record || 0} sub="USASpending, SAM.gov, FPDS" color="#f59e0b" />
          <Stat label="Parliamentary Records" value={statsByType.parliament || 0} sub="Hansard, legislative filings" color="#06b6d4" />
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, display: "block", marginBottom: 4 }}>Search Sources</label>
            <input type="text" value={srcSearch} onChange={e => setSrcSearch(e.target.value)} placeholder="Search by label, contract, entity, domain, URL\u2026" style={{ width: "100%", background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Country</label>
            <select value={srcCountry} onChange={e => setSrcCountry(e.target.value)} style={{ background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer", minWidth: 110 }}>
              {uniqueCountries.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Source Type</label>
            <select value={srcType} onChange={e => setSrcType(e.target.value)} style={{ background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer", minWidth: 130 }}>
              {typeOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <button onClick={() => { setSrcSearch(""); setSrcCountry("All"); setSrcType("All"); }} style={{ background: COLORS.border, color: COLORS.textDim, border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 11, cursor: "pointer", fontWeight: 600, marginBottom: 1 }}>RESET</button>
        </div>

        <div style={{ fontSize: 12, color: COLORS.textMuted }}>{filteredSources.length} sources \u00b7 Click any row to open in new tab</div>

        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: COLORS.card }}>
                <SrcTh col="label" width={260}>Source Document / Page</SrcTh>
                <SrcTh col="type" width={100}>Type</SrcTh>
                <SrcTh col="contract" width={200}>Related Contract</SrcTh>
                <SrcTh col="entity" width={130}>Dept / Entity</SrcTh>
                <SrcTh col="country" width={90}>Country</SrcTh>
                <SrcTh col="year" width={50}>Year</SrcTh>
                <SrcTh col="domain" width={140}>Domain</SrcTh>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((s, i) => {
                const tc = typeColors[s.type] || COLORS.textMuted;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer", transition: "background 0.15s" }}
                    onClick={() => window.open(s.url, "_blank")}
                    onMouseEnter={e => e.currentTarget.style.background = COLORS.cardHover}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "8px 6px", position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: COLORS.accent, textDecoration: "none", fontWeight: 500, display: "block", lineHeight: 1.3 }}>{s.label}</a>
                    </td>
                    <td style={{ padding: "8px 6px" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${tc}18`, color: tc, border: `1px solid ${tc}33`, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{typeIcons[s.type]} {s.typeName}</span>
                    </td>
                    <td style={{ padding: "8px 6px", color: COLORS.text, fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.contractName}>{s.contractName}</td>
                    <td style={{ padding: "8px 6px", color: COLORS.textDim, fontSize: 10, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.entity}</td>
                    <td style={{ padding: "8px 6px", color: COLORS.textDim, fontSize: 10 }}>{s.country}</td>
                    <td style={{ padding: "8px 6px", color: COLORS.textDim, fontSize: 10, textAlign: "center" }}>{s.year}</td>
                    <td style={{ padding: "8px 6px" }}><span style={{ color: COLORS.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{s.domain}</span></td>
                  </tr>
                );
              })}
              {filteredSources.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No sources match your filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>SOURCES BY TYPE</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(typeLabels).map(([key, label]) => {
                const count = statsByType[key] || 0;
                const pct = allSources.length > 0 ? (count / allSources.length) * 100 : 0;
                const color = typeColors[key];
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{typeIcons[key]} {label}</span>
                      <span style={{ fontSize: 11, color: COLORS.textDim }}>{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ height: 6, background: COLORS.bg, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>TOP SOURCE DOMAINS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {statsByDomain.map(([domain, count]) => {
                const maxCount = statsByDomain[0]?.[1] || 1;
                return (
                  <div key={domain} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setSrcSearch(domain)}>
                    <span style={{ fontSize: 10, color: COLORS.textDim, fontFamily: "'JetBrains Mono', monospace", minWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{domain}</span>
                    <div style={{ flex: 1, height: 5, background: COLORS.bg, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: COLORS.accentDim, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, color: COLORS.accent, fontWeight: 600, minWidth: 20, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, marginBottom: 8 }}>SOURCE TYPE LEGEND</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
            <div><span style={{ color: "#22c55e", fontWeight: 600 }}>{"\u25c6"} OFFICIAL / GOVT</span> \u2014 Press releases from awarding agencies, UK Find a Tender, UK Contracts Finder, NATO NCIA releases, ICE FOIA documents, SEC filings</div>
            <div><span style={{ color: "#f59e0b", fontWeight: 600 }}>{"\u25c8"} FEDERAL RECORD</span> \u2014 USASpending.gov contract award records, SAM.gov solicitation and award notices, FPDS.gov procurement data</div>
            <div><span style={{ color: "#a78bfa", fontWeight: 600 }}>{"\u25c7"} PALANTIR IR</span> \u2014 Palantir Technologies investor relations press releases, annual 10-K SEC filings, partner company press releases</div>
            <div><span style={{ color: "#06b6d4", fontWeight: 600 }}>{"\u25a3"} PARLIAMENTARY</span> \u2014 UK Parliament Hansard debate transcripts, Green Party contract termination notices, Senate/House committee records</div>
            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#94a3b8", fontWeight: 600 }}>{"\u25aa"} PRESS / TRADE</span> \u2014 Defense trade press, government IT press, investigative journalism, financial press, human rights research</div>
          </div>
        </div>
      </div>
    );
  };

  // ===== PLTR DOCS TAB =====
  const renderPalantirDocs = () => {
    const sections = ["earnings", "letters", "presentations", "sec", "ir_releases"];
    const sectionLabels = { earnings: "Earnings Releases", letters: "Shareholder Letters", presentations: "Investor Presentations", sec: "SEC Filings", ir_releases: "IR Contract Announcements" };
    const sectionColors = { earnings: COLORS.accent, letters: COLORS.gold, presentations: COLORS.purple, sec: "#22c55e", ir_releases: "#f472b6" };

    const m = PLTR_DOCS.latestMetrics;
    const revenueRows = PLTR_DOCS.annualRevenue;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Key financial metrics */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Stat label="FY 2025 Revenue" value="$4.48B" sub="+56% YoY" color={COLORS.accent} />
          <Stat label="US Govt Revenue FY25" value="$1.86B" sub="+55% YoY · 41% of total" color={COLORS.gold} />
          <Stat label="Remaining Deal Value" value={`$${(m.totalRDV/1000).toFixed(1)}B`} sub={`+${m.rdvGrowth}% YoY as of Q4 2025`} color={COLORS.purple} />
          <Stat label="RPO" value={`$${(m.rpo/1000).toFixed(1)}B`} sub={`+${m.rpoGrowth}% YoY`} color="#22c55e" />
          <Stat label="FY 2026 Guidance" value={`$${(m.fy2026Guidance.low/1000).toFixed(2)}B`} sub={`+${m.fy2026Guidance.growth}% YoY midpoint`} color="#f472b6" />
        </div>

        {/* Annual revenue table */}
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>ANNUAL REVENUE HISTORY</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Year", "Total Revenue", "US Govt Revenue", "Govt %", "Source"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...revenueRows].reverse().map(r => (
                  <tr key={r.year} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "8px 12px", color: COLORS.text, fontWeight: 700 }}>{r.year}</td>
                    <td style={{ padding: "8px 12px", color: COLORS.gold, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>${(r.total / 1000).toFixed(2)}B</td>
                    <td style={{ padding: "8px 12px", color: COLORS.accent, fontVariantNumeric: "tabular-nums" }}>{r.govt ? `$${(r.govt / 1000).toFixed(2)}B` : "\u2014"}</td>
                    <td style={{ padding: "8px 12px", color: COLORS.textDim }}>{r.govtPct ? `${r.govtPct}%` : "\u2014"}</td>
                    <td style={{ padding: "8px 12px", color: COLORS.textMuted, fontSize: 11 }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}` }}>
          {sections.map(s => (
            <button key={s} onClick={() => setDocsSection(s)} style={{ background: "none", border: "none", borderBottom: docsSection === s ? `2px solid ${sectionColors[s]}` : "2px solid transparent", color: docsSection === s ? sectionColors[s] : COLORS.textMuted, padding: "8px 16px", fontSize: 11, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", transition: "all 0.2s", marginBottom: -1 }}>
              {sectionLabels[s]}
            </button>
          ))}
        </div>

        {/* Earnings releases */}
        {docsSection === "earnings" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 110px 1fr 100px", padding: "8px 14px", background: COLORS.card, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}` }}>
              <span>Quarter</span><span>Date</span><span>Total Rev</span><span>US Govt Rev</span><span>Notes</span><span></span>
            </div>
            {[...PLTR_DOCS.earnings].reverse().map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 110px 1fr 100px", padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center", fontSize: 12 }}
                onMouseEnter={ev => ev.currentTarget.style.background = COLORS.cardHover}
                onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 700, color: COLORS.accent }}>{e.quarter}</span>
                <span style={{ color: COLORS.textDim, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{e.date}</span>
                <span style={{ color: COLORS.gold, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{e.revenue ? `$${e.revenue}M` : "\u2014"}</span>
                <span style={{ color: COLORS.green, fontVariantNumeric: "tabular-nums" }}>{e.usGovRev ? `$${e.usGovRev}M` : "\u2014"}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{e.notes}</span>
                <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent, fontSize: 11, textDecoration: "none", fontWeight: 600, textAlign: "right" }}>View Release \u2192</a>
              </div>
            ))}
          </div>
        )}

        {/* Shareholder letters */}
        {docsSection === "letters" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {[...PLTR_DOCS.letters].reverse().map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "14px 16px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, textDecoration: "none", transition: "all 0.15s" }}
                onMouseEnter={ev => { ev.currentTarget.style.borderColor = COLORS.gold; ev.currentTarget.style.background = COLORS.cardHover; }}
                onMouseLeave={ev => { ev.currentTarget.style.borderColor = COLORS.border; ev.currentTarget.style.background = COLORS.card; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.gold }}>{l.quarter}</span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{l.date}</span>
                </div>
                {l.notes && <div style={{ fontSize: 11, color: COLORS.textDim }}>{l.notes}</div>}
                <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 4 }}>Read Letter \u2192</div>
              </a>
            ))}
          </div>
        )}

        {/* Investor presentations */}
        {docsSection === "presentations" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {[...PLTR_DOCS.presentations].reverse().map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, textDecoration: "none", transition: "all 0.15s" }}
                onMouseEnter={ev => { ev.currentTarget.style.borderColor = COLORS.purple; ev.currentTarget.style.background = COLORS.cardHover; }}
                onMouseLeave={ev => { ev.currentTarget.style.borderColor = COLORS.border; ev.currentTarget.style.background = COLORS.card; }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.purple }}>{p.quarter}</div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>Investor Presentation (PDF)</div>
                </div>
                <span style={{ fontSize: 18, color: COLORS.purple }}>&#8659;</span>
              </a>
            ))}
          </div>
        )}

        {/* SEC filings */}
        {docsSection === "sec" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 100px 120px 1fr 140px", padding: "8px 14px", background: COLORS.card, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}` }}>
              <span>Type</span><span>Period</span><span>Filed</span><span>Notes</span><span></span>
            </div>
            {[...PLTR_DOCS.secFilings].reverse().map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 100px 120px 1fr 140px", padding: "10px 14px", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center", fontSize: 12 }}
                onMouseEnter={ev => ev.currentTarget.style.background = COLORS.cardHover}
                onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 700, color: "#22c55e", fontSize: 11, padding: "2px 8px", background: "#22c55e18", borderRadius: 4, border: "1px solid #22c55e33", display: "inline-block", textAlign: "center" }}>{f.type}</span>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>{f.period}</span>
                <span style={{ color: COLORS.textDim, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{f.date}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{f.notes}</span>
                <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "#22c55e", fontSize: 11, textDecoration: "none", fontWeight: 600, textAlign: "right" }}>View on SEC/IR \u2192</a>
              </div>
            ))}
          </div>
        )}

        {/* IR contract press releases */}
        {docsSection === "ir_releases" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(
              PLTR_DOCS.irPressReleases.reduce((acc, r) => { (acc[r.year] = acc[r.year] || []).push(r); return acc; }, {})
            ).sort((a, b) => b[0] - a[0]).map(([year, releases]) => (
              <div key={year} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f472b6", marginBottom: 10, letterSpacing: 0.5 }}>{year}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {releases.map((r, i) => {
                    const relatedContracts = r.contractIds.map(id => CONTRACTS.find(c => c.id === id)).filter(Boolean);
                    return (
                      <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.borderLight}`, textDecoration: "none", transition: "all 0.15s" }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = "#f472b644"; ev.currentTarget.style.background = COLORS.cardHover; }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = COLORS.borderLight; ev.currentTarget.style.background = COLORS.bg; }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#a78bfa18", color: "#a78bfa", border: "1px solid #a78bfa33", whiteSpace: "nowrap" }}>PLTR IR</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 12 }}>{r.title}</div>
                          {relatedContracts.length > 0 && (
                            <div style={{ marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {relatedContracts.map(c => (
                                <span key={c.id} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${COLORS.accentDim}18`, color: COLORS.accentDim, border: `1px solid ${COLORS.accentDim}33` }}>{c.name}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={{ color: "#f472b6", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{r.agency} \u2192</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    );
  };

  // ─── KarpTube live feed definitions ────────────────────────────────────────
  const KT_LIVE_FEEDS = [
    { name: "Google News — Palantir",  url: "https://news.google.com/rss/search?q=palantir&hl=en-US&gl=US&ceid=US:en", filter: false },
    { name: "Breaking Defense",        url: "https://breakingdefense.com/feed/",                    filter: true },
    { name: "Defense One",             url: "https://www.defenseone.com/rss/all/",                  filter: true },
    { name: "C4ISRNET",                url: "https://www.c4isrnet.com/arc/outboundfeeds/rss/",      filter: true },
    { name: "FedScoop",                url: "https://fedscoop.com/feed/",                           filter: true },
    { name: "War on the Rocks",        url: "https://warontherocks.com/feed/",                      filter: true },
    { name: "Palantir (Medium)",       url: "https://medium.com/feed/palantir",                     filter: false },
    { name: "r/palantir",              url: "https://www.reddit.com/r/palantir/.rss",                filter: false },
    { name: "r/PLTR",                  url: "https://www.reddit.com/r/PLTR/.rss",                   filter: false },
    { name: "First Breakfast",         url: "https://firstbreakfast.substack.com/feed",             filter: true },
    { name: "Amit Kukreja",            url: "https://amitsdeepdives.substack.com/feed",             filter: true },
    { name: "Arny Trezzi",             url: "https://arnytrezzi.substack.com/feed",                 filter: true },
    { name: "Shyam Sankar",            url: "https://shyamsankar.com/feed",                         filter: false },
    { name: "Crossing the Valley",     url: "https://crossingthevalley.substack.com/feed",          filter: true },
    { name: "Palantir Tech (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCXDlpGEFdP4i_JBDpQoAOyg", filter: false },
  ];

  const ktParseRSS = (xmlText, sourceName, filterPalantir) => {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, "text/xml");
      const nodes = [...xml.querySelectorAll("item"), ...xml.querySelectorAll("entry")];
      const items = [];
      for (const node of nodes) {
        const title   = node.querySelector("title")?.textContent?.trim() || "";
        const rawLink = node.querySelector("link")?.textContent?.trim()
                     || node.querySelector("link")?.getAttribute("href")?.trim() || "";
        const link    = rawLink.startsWith("http") ? rawLink : "";
        const desc    = node.querySelector("description")?.textContent
                     || node.querySelector("summary")?.textContent || "";
        const pubDate = node.querySelector("pubDate")?.textContent
                     || node.querySelector("published")?.textContent || "";
        if (!link) continue;
        const combined = (title + " " + desc).toLowerCase();
        if (filterPalantir && !combined.includes("palantir")) continue;
        const dateStr = pubDate
          ? (() => { try { return new Date(pubDate).toISOString().slice(0, 10); } catch { return ""; } })()
          : new Date().toISOString().slice(0, 10);
        const uid = "live-" + btoa(encodeURIComponent(link)).replace(/[+/=]/g, "").slice(0, 18);
        const snippet = desc.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
        items.push({ id: uid, source: sourceName, source_type: "news", title: title.slice(0, 160),
          snippet, url: link, date: dateStr, scraped_at: new Date().toISOString(), live: true });
      }
      return items;
    } catch (e) { return []; }
  };

  const ktFetchLive = async () => {
    if (ktFetching) return;
    setKtFetching(true);
    setKtLiveCount(0);
    setKtFetchStatus("Connecting...");
    const PROXY = "https://api.allorigins.win/get?url=";
    const existingIds = new Set(karpItems.map(i => i.id));
    let totalNew = 0;
    for (const feed of KT_LIVE_FEEDS) {
      setKtFetchStatus(`Fetching ${feed.name}...`);
      try {
        const res = await fetch(PROXY + encodeURIComponent(feed.url), { signal: AbortSignal.timeout(9000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = ktParseRSS(data.contents || "", feed.name, feed.filter);
        const fresh = parsed.filter(i => !existingIds.has(i.id));
        if (fresh.length > 0) {
          fresh.forEach(i => existingIds.add(i.id));
          totalNew += fresh.length;
          setKtLiveCount(n => n + fresh.length);
          setKarpItems(prev => {
            const merged = [...fresh, ...prev];
            merged.sort((a, b) => (b.date || b.scraped_at || "").localeCompare(a.date || a.scraped_at || ""));
            return merged.slice(0, 1500);
          });
        }
      } catch (e) { /* silently skip failed feeds */ }
    }
    setKtLastPulled(new Date());
    setKtFetching(false);
    setKtFetchStatus(totalNew > 0 ? `Done — ${totalNew} new item${totalNew !== 1 ? "s" : ""} added` : "Done — feed is up to date");
    setTimeout(() => setKtFetchStatus(""), 6000);
  };

  // Auto-pull once when KarpTube tab is first opened
  const ktAutoFetched = React.useRef(false);
  React.useEffect(() => {
    if (tab === "KarpTube" && !ktAutoFetched.current) {
      ktAutoFetched.current = true;
      ktFetchLive();
    }
  }, [tab]);

  const fhApplyEdit = (id, changes) => {
    const newEdits = { ...fhEdits, [id]: { ...(fhEdits[id] || {}), ...changes } };
    setFhEdits(newEdits);
    localStorage.setItem("feed_hub_edits", JSON.stringify(newEdits));
    setFhSources(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
  };

  const fhToggleStatus = (id) => {
    const src = fhSources.find(s => s.id === id);
    if (!src) return;
    fhApplyEdit(id, { status: src.status === "active" ? "paused" : "active" });
  };

  const fhExportJSON = () => {
    return JSON.stringify({
      version: "1.0",
      updated: new Date().toISOString(),
      sources: fhSources.map(s => {
        const { _new, ...clean } = s;
        return clean;
      })
    }, null, 2);
  };

  const fhCommitToGithub = async () => {
    if (!fhGhToken) return;
    setFhCommitting(true);
    setFhCommitStatus("Fetching current file...");
    try {
      const headers = { Authorization: `token ${fhGhToken}`, Accept: "application/vnd.github.v3+json" };
      const r1 = await fetch("https://api.github.com/repos/Bazzmatazz42/palantir-dashboard/contents/palantir-dashboard/sources_master.json", { headers });
      const f1 = await r1.json();
      if (!f1.sha) throw new Error("Could not get file SHA — check token permissions");
      setFhCommitStatus("Committing...");
      const content = btoa(unescape(encodeURIComponent(fhExportJSON())));
      const r2 = await fetch("https://api.github.com/repos/Bazzmatazz42/palantir-dashboard/contents/palantir-dashboard/sources_master.json", {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: "feat: update source registry from Feed Hub", content, sha: f1.sha })
      });
      if (!r2.ok) throw new Error(`GitHub API error: ${r2.status}`);
      setFhCommitStatus("Committed! Scraper will use new sources on next run.");
      // Clear edits after successful commit
      setFhEdits({});
      localStorage.removeItem("feed_hub_edits");
    } catch (e) {
      setFhCommitStatus(`Error: ${e.message}`);
    }
    setFhCommitting(false);
    setTimeout(() => setFhCommitStatus(""), 8000);
  };

  const fhAddSource = () => {
    const form = fhAddForm;
    if (!form.name.trim()) return;
    const newId = "src_user_" + Date.now();
    const newSource = {
      id: newId, name: form.name.trim(), type: form.type, scraper: form.scraper,
      destination: form.destination, status: "active",
      url: form.url.trim() || null, handle: form.handle.trim() || null,
      channel_id: form.channel_id.trim() || null, query: form.query.trim() || null,
      filter_palantir: form.filter_palantir, category: form.category,
      tier: Number(form.tier), description: form.description.trim(),
      note: form.note.trim(), added: new Date().toISOString().slice(0, 10),
      tags: [], _new: true,
      stats: { total_items: 0, last_run: null, last_count: 0, history: [] }
    };
    // auto-set scraper based on type
    if (form.type === "youtube") newSource.scraper = form.channel_id.trim() ? "youtube_rss" : "display_only";
    if (form.type === "reddit") newSource.scraper = "reddit_rss";
    if (form.type === "x_handle") newSource.scraper = "x_ddg";
    if (form.type === "ddg_query") newSource.scraper = "ddg_web";
    if (["rss","newsletter","blog"].includes(form.type)) newSource.scraper = "rss_feed";
    const newEdits = { ...fhEdits, [newId]: { ...newSource } };
    setFhEdits(newEdits);
    localStorage.setItem("feed_hub_edits", JSON.stringify(newEdits));
    setFhSources(prev => [...prev, newSource]);
    setFhShowAdd(false);
    setFhAddForm({ name: "", type: "rss", scraper: "rss_feed", destination: "screened",
      url: "", handle: "", channel_id: "", query: "", filter_palantir: true,
      category: "media", description: "", note: "", tier: 2 });
  };

  const renderFeedHub = () => {
    const TYPE_META = {
      contract_api: { label: "CONTRACT API", color: "#22c55e", symbol: "◆" },
      sec_edgar:    { label: "SEC FILING",   color: "#a78bfa", symbol: "▪" },
      ir_page:      { label: "IR PAGE",      color: "#a78bfa", symbol: "▫" },
      rss:          { label: "RSS",          color: "#38bdf8", symbol: "≡" },
      newsletter:   { label: "NEWSLETTER",   color: "#38bdf8", symbol: "≡" },
      blog:         { label: "BLOG",         color: "#38bdf8", symbol: "≡" },
      youtube:      { label: "YOUTUBE",      color: "#f87171", symbol: "▶" },
      reddit:       { label: "REDDIT",       color: "#fb923c", symbol: "○" },
      x_handle:     { label: "X / TWITTER",  color: "#94a3b8", symbol: "✕" },
      ddg_query:    { label: "WEB SEARCH",   color: "#fbbf24", symbol: "⊙" },
      podcast:      { label: "PODCAST",      color: "#c084fc", symbol: "◉" },
    };
    const DEST_META = {
      inbox:    { label: "INBOX",    color: "#22c55e" },
      karptube: { label: "KARPTUBE", color: "#a78bfa" },
      screened: { label: "SCREENED", color: "#f59e0b" },
    };
    const CAT_OPTIONS = ["official", "leadership", "defense_media", "analyst", "media", "community", "policy", "investor", "news"];
    const TYPE_OPTIONS = ["contract_api", "sec_edgar", "ir_page", "rss", "newsletter", "blog", "youtube", "reddit", "x_handle", "ddg_query", "podcast"];
    const selectStyle = { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer" };
    const inputStyle = { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "7px 12px", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" };

    // Filter
    const filtered = fhSources.filter(s => {
      if (fhFilter.status !== "All" && s.status !== fhFilter.status.toLowerCase()) return false;
      if (fhFilter.type !== "All" && s.type !== fhFilter.type) return false;
      if (fhFilter.dest !== "All" && s.destination !== fhFilter.dest) return false;
      if (fhFilter.search) {
        const q = fhFilter.search.toLowerCase();
        if (!((s.name||"").toLowerCase().includes(q)) && !((s.url||"").toLowerCase().includes(q)) &&
            !((s.handle||"").toLowerCase().includes(q)) && !((s.query||"").toLowerCase().includes(q)) &&
            !((s.description||"").toLowerCase().includes(q))) return false;
      }
      return true;
    });

    // Stats
    const total = fhSources.length;
    const active = fhSources.filter(s => s.status === "active").length;
    const paused = fhSources.filter(s => s.status === "paused").length;
    const inboxCount = fhSources.filter(s => s.destination === "inbox").length;
    const ktCount = fhSources.filter(s => s.destination === "karptube").length;
    const screenedCount = fhSources.filter(s => s.destination === "screened").length;
    const pendingEdits = Object.keys(fhEdits).length;

    const fmtDate = (iso) => {
      if (!iso) return "Never";
      try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
      catch { return "—"; }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.accent }}>Feed Hub</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
              Source registry · {total} sources · {active} active · {paused} paused
            </div>
          </div>
          <button onClick={() => setFhShowAdd(true)} style={{ background: COLORS.accent + "22", color: COLORS.accent, border: `1px solid ${COLORS.accent + "55"}`, borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5 }}>
            + Add Source
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "Total Sources", value: total, color: COLORS.accent },
            { label: "Active", value: active, color: "#22c55e" },
            { label: "Paused", value: paused, color: "#f59e0b" },
            { label: "To Inbox", value: inboxCount, color: "#22c55e" },
            { label: "Screened", value: screenedCount, color: "#f59e0b" },
            { label: "To KarpTube", value: ktCount, color: "#a78bfa" },
          ].map(s => (
            <div key={s.label} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.2, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Pending changes banner */}
        {pendingEdits > 0 && (
          <div style={{ background: "#f59e0b11", border: `1px solid #f59e0b44`, borderRadius: 8, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{pendingEdits} unsaved change{pendingEdits !== 1 ? "s" : ""} · stored in browser</span>
            <button onClick={() => setFhShowExport(v => !v)} style={{ background: "#f59e0b22", color: "#f59e0b", border: `1px solid #f59e0b55`, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Export JSON
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <input
                type="password"
                placeholder="GitHub token (for direct commit)"
                value={fhGhToken}
                onChange={e => { setFhGhToken(e.target.value); localStorage.setItem("feed_hub_gh_token", e.target.value); }}
                style={{ ...inputStyle, width: 240, padding: "4px 10px" }}
              />
              <button
                onClick={fhCommitToGithub}
                disabled={!fhGhToken || fhCommitting}
                style={{ background: fhGhToken && !fhCommitting ? "#22c55e22" : COLORS.card, color: fhGhToken && !fhCommitting ? "#22c55e" : COLORS.textMuted, border: `1px solid ${fhGhToken && !fhCommitting ? "#22c55e55" : COLORS.border}`, borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: fhGhToken && !fhCommitting ? "pointer" : "not-allowed" }}
              >
                {fhCommitting ? "Committing..." : "Commit to GitHub"}
              </button>
            </div>
            {fhCommitStatus && <div style={{ fontSize: 11, color: COLORS.textMuted, width: "100%" }}>{fhCommitStatus}</div>}
          </div>
        )}

        {/* Export panel */}
        {fhShowExport && (
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>sources_master.json — copy and commit to repo</span>
              <button onClick={() => { navigator.clipboard.writeText(fhExportJSON()); }} style={{ background: COLORS.accent + "22", color: COLORS.accent, border: `1px solid ${COLORS.accent + "44"}`, borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                Copy
              </button>
            </div>
            <textarea readOnly value={fhExportJSON()} style={{ ...inputStyle, height: 200, fontFamily: "monospace", fontSize: 10, resize: "vertical" }} />
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            placeholder="Search sources..."
            value={fhFilter.search}
            onChange={e => setFhFilter(f => ({ ...f, search: e.target.value }))}
            style={{ ...inputStyle, width: 220, padding: "6px 12px" }}
          />
          {[
            { label: "Status", key: "status", opts: ["All", "Active", "Paused"] },
            { label: "Type", key: "type", opts: ["All", ...TYPE_OPTIONS] },
            { label: "Destination", key: "dest", opts: ["All", "inbox", "karptube", "screened"] },
          ].map(({ label, key, opts }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{label}</label>
              <select value={fhFilter[key]} onChange={e => setFhFilter(f => ({ ...f, [key]: e.target.value }))} style={selectStyle}>
                {opts.map(o => <option key={o} value={o}>{o === "All" ? `All ${label}s` : o}</option>)}
              </select>
            </div>
          ))}
          <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: "auto" }}>{filtered.length} of {total}</span>
        </div>

        {/* Source table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Source", "Type", "Destination", "Category", "Status", "Last Run", "Last Count", "Total Items", ""].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: COLORS.textMuted, borderBottom: `2px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((src, i) => {
                const tm = TYPE_META[src.type] || { label: src.type?.toUpperCase(), color: COLORS.textMuted, symbol: "·" };
                const dm = DEST_META[src.destination] || { label: src.destination?.toUpperCase(), color: COLORS.textMuted };
                const isActive = src.status === "active";
                const stats = src.stats || {};
                return (
                  <tr key={src.id} style={{ borderBottom: `1px solid ${COLORS.border}`, background: i % 2 === 0 ? "transparent" : COLORS.card + "44" }}>
                    <td style={{ padding: "10px 10px", maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, color: COLORS.text, marginBottom: 2 }}>{src.name}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                        {src.handle ? `@${src.handle}` : src.query ? `"${src.query}"` : src.url || "—"}
                      </div>
                      {src._new && <span style={{ fontSize: 9, background: COLORS.accent + "22", color: COLORS.accent, padding: "1px 6px", borderRadius: 10, letterSpacing: 0.5 }}>NEW</span>}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ background: tm.color + "22", color: tm.color, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                        {tm.symbol} {tm.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      <span style={{ background: dm.color + "22", color: dm.color, padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                        {dm.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 11, color: COLORS.textMuted, whiteSpace: "nowrap" }}>
                      {src.category || "—"}
                    </td>
                    <td style={{ padding: "10px 10px" }}>
                      <button
                        onClick={() => fhToggleStatus(src.id)}
                        style={{ background: isActive ? "#22c55e22" : "#f59e0b22", color: isActive ? "#22c55e" : "#f59e0b", border: `1px solid ${isActive ? "#22c55e55" : "#f59e0b55"}`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, whiteSpace: "nowrap" }}
                      >
                        {isActive ? "ACTIVE" : "PAUSED"}
                      </button>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 11, color: COLORS.textMuted, whiteSpace: "nowrap" }}>
                      {fmtDate(stats.last_run)}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 11, color: stats.last_count > 0 ? COLORS.accent : COLORS.textMuted, fontWeight: stats.last_count > 0 ? 700 : 400, whiteSpace: "nowrap" }}>
                      {stats.last_count != null ? stats.last_count : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 12, color: COLORS.text, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {stats.total_items != null ? stats.total_items.toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                      {src.url && (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent, fontSize: 10, fontWeight: 600, letterSpacing: 0.5 }}>
                          OPEN
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textMuted, fontSize: 13 }}>
              No sources match current filters
            </div>
          )}
        </div>

        {/* Add Source Modal */}
        {fhShowAdd && (
          <div style={{ position: "fixed", inset: 0, background: "#00000088", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={e => { if (e.target === e.currentTarget) setFhShowAdd(false); }}>
            <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, width: 480, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.accent }}>Add New Source</div>
                <button onClick={() => setFhShowAdd(false)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "Source Name *", field: "name", type: "text", placeholder: "e.g. Breaking Defense" },
                  { label: "Source Type *", field: "type", type: "select", options: TYPE_OPTIONS },
                  { label: "Destination *", field: "destination", type: "select", options: ["inbox", "karptube", "screened"] },
                  { label: "Category", field: "category", type: "select", options: CAT_OPTIONS },
                  { label: "URL (RSS feed, page URL, YouTube URL)", field: "url", type: "text", placeholder: "https://..." },
                  { label: "X Handle (without @)", field: "handle", type: "text", placeholder: "e.g. PalantirTech" },
                  { label: "YouTube Channel ID", field: "channel_id", type: "text", placeholder: "e.g. UCXDlpGEFdP4i_JBDpQoAOyg" },
                  { label: "Search Query (for DDG sources)", field: "query", type: "text", placeholder: "e.g. Palantir contract award 2026" },
                  { label: "Description", field: "description", type: "text", placeholder: "Optional" },
                  { label: "Note", field: "note", type: "text", placeholder: "Optional" },
                ].map(({ label, field, type, placeholder, options }) => (
                  <div key={field}>
                    <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, display: "block", marginBottom: 4 }}>{label}</label>
                    {type === "select" ? (
                      <select value={fhAddForm[field]} onChange={e => setFhAddForm(f => ({ ...f, [field]: e.target.value }))} style={{ ...selectStyle, width: "100%" }}>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type} placeholder={placeholder} value={fhAddForm[field] || ""} onChange={e => setFhAddForm(f => ({ ...f, [field]: e.target.value }))} style={inputStyle} />
                    )}
                  </div>
                ))}
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: COLORS.text }}>
                    <input type="checkbox" checked={fhAddForm.filter_palantir} onChange={e => setFhAddForm(f => ({ ...f, filter_palantir: e.target.checked }))} />
                    Require "palantir" in text (filter_palantir)
                  </label>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button onClick={fhAddSource} disabled={!fhAddForm.name.trim()} style={{ flex: 1, background: COLORS.accent, color: "#000", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700, cursor: fhAddForm.name.trim() ? "pointer" : "not-allowed", opacity: fhAddForm.name.trim() ? 1 : 0.5 }}>
                    Add Source
                  </button>
                  <button onClick={() => setFhShowAdd(false)} style={{ flex: 1, background: COLORS.card, color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px", fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  };

  const renderKarpTube = () => {
    const TYPE_ORDER = ["All", "news", "article", "press_release", "rss", "newsletter", "blog", "podcast", "video", "x_search", "x_post", "web_search", "sec_filing", "contract_api", "official"];

    const activeTypes = new Set(karpItems.map(i => i.source_type).filter(Boolean));
    const availableFilters = ["All", ...TYPE_ORDER.slice(1).filter(f => activeTypes.has(f))];
    const sources = ["All", ...Array.from(new Set(karpItems.map(i => i.source).filter(Boolean))).sort()];

    const SORT_OPTIONS = [
      { value: "date_desc", label: "Newest first" },
      { value: "date_asc",  label: "Oldest first" },
      { value: "source",    label: "Source A–Z" },
    ];

    const q = ktSearch.toLowerCase();
    let visible = karpItems.filter(item => {
      if (ktFilter !== "All" && item.source_type !== ktFilter) return false;
      if (ktSource !== "All" && item.source !== ktSource) return false;
      if (q && !((item.title || "").toLowerCase().includes(q)) &&
               !((item.snippet || "").toLowerCase().includes(q)) &&
               !((item.source || "").toLowerCase().includes(q))) return false;
      return true;
    });

    // Sort
    visible = [...visible].sort((a, b) => {
      if (ktSort === "date_asc")  return (a.date || a.scraped_at || "").localeCompare(b.date || b.scraped_at || "");
      if (ktSort === "source")    return (a.source || "").localeCompare(b.source || "");
      // date_desc (default)
      return (b.date || b.scraped_at || "").localeCompare(a.date || a.scraped_at || "");
    });

    const selectStyle = { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer" };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.accent, letterSpacing: 0.5 }}>KarpTube</div>
              {ktLiveCount > 0 && !ktFetching && (
                <span style={{ background: COLORS.accent + "22", color: COLORS.accent, fontSize: 10, fontWeight: 700,
                  padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5 }}>
                  +{ktLiveCount} LIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
              {karpItems.length} items · news, articles, podcasts, videos, newsletters, blogs, social
              {ktLastPulled && (
                <span style={{ marginLeft: 8, opacity: 0.6 }}>
                  · last pulled {Math.round((Date.now() - ktLastPulled) / 60000)} min ago
                </span>
              )}
            </div>
            {(ktFetching || ktFetchStatus) && (
              <div style={{ fontSize: 11, color: ktFetching ? COLORS.accent : COLORS.textMuted, marginTop: 4,
                display: "flex", alignItems: "center", gap: 6 }}>
                {ktFetching && (
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                    background: COLORS.accent, animation: "pulse 1s infinite" }} />
                )}
                {ktFetchStatus}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={ktFetchLive}
              disabled={ktFetching}
              style={{ background: ktFetching ? COLORS.card : COLORS.accent + "22",
                color: ktFetching ? COLORS.textMuted : COLORS.accent,
                border: `1px solid ${ktFetching ? COLORS.border : COLORS.accent + "55"}`,
                borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700,
                cursor: ktFetching ? "not-allowed" : "pointer", letterSpacing: 0.5,
                transition: "all 0.15s", whiteSpace: "nowrap" }}
            >
              {ktFetching ? "Pulling..." : "Pull Latest"}
            </button>
            <input
              placeholder="Search KarpTube..."
              value={ktSearch}
              onChange={e => setKtSearch(e.target.value)}
              style={{ ...selectStyle, borderRadius: 8, padding: "7px 14px", fontSize: 12, width: 220 }}
            />
          </div>
        </div>

        {/* Controls row: type chips + source + sort */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Type chips */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {availableFilters.map(f => {
              const meta = MEDIA_TYPE_META[f] || {};
              const active = ktFilter === f;
              const col = meta.color || COLORS.accent;
              const count = f === "All" ? karpItems.length : karpItems.filter(i => i.source_type === f).length;
              return (
                <button key={f} onClick={() => setKtFilter(f)} style={{
                  background: active ? col + "22" : COLORS.card,
                  color: active ? col : COLORS.textMuted,
                  border: `1px solid ${active ? col + "66" : COLORS.border}`,
                  borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", transition: "all 0.15s",
                }}>
                  {f === "All" ? "All" : (MEDIA_TYPE_META[f]?.label || f)} <span style={{ opacity: 0.65 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* Source filter + sort */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Source</label>
              <select value={ktSource} onChange={e => setKtSource(e.target.value)} style={selectStyle}>
                {sources.map(s => <option key={s} value={s}>{s === "All" ? "All Sources" : s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Sort</label>
              <select value={ktSort} onChange={e => setKtSort(e.target.value)} style={selectStyle}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: "auto" }}>
              {visible.length} result{visible.length !== 1 ? "s" : ""}
              {ktFilter !== "All" && ` · ${MEDIA_TYPE_META[ktFilter]?.label || ktFilter}`}
              {ktSource !== "All" && ` · ${ktSource}`}
              {ktSearch && ` · "${ktSearch}"`}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {karpItems.length === 0 && !ktFetching && (
          <div style={{ textAlign: "center", padding: "60px 0", color: COLORS.textMuted }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No content yet</div>
            <div style={{ fontSize: 12 }}>Click <strong>Pull Latest</strong> to fetch live Palantir news from all sources.</div>
          </div>
        )}
        {karpItems.length === 0 && ktFetching && (
          <div style={{ textAlign: "center", padding: "60px 0", color: COLORS.textMuted }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: COLORS.accent }}>Fetching live feeds...</div>
            <div style={{ fontSize: 12 }}>{ktFetchStatus}</div>
          </div>
        )}

        {/* Card grid */}
        {visible.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {visible.map(item => {
              const meta = MEDIA_TYPE_META[item.source_type] || { label: "MEDIA", color: COLORS.textDim };
              return (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration: "none", display: "block", height: "100%" }}>
                  <div
                    style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px", height: "100%", boxSizing: "border-box", transition: "border-color 0.15s, background 0.15s", cursor: "pointer", display: "flex", flexDirection: "column", gap: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = meta.color + "77"; e.currentTarget.style.background = meta.color + "09"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = COLORS.card; }}
                  >
                    {/* Row 1: type badge (left) + date (right) — both always fully visible */}
                    {(() => {
                      let dateDisplay = "—";
                      if (item.date) {
                        try {
                          const d = new Date(item.date + "T12:00:00Z");
                          dateDisplay = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        } catch { dateDisplay = item.date; }
                      }
                      return (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
                          <span style={{ background: meta.color + "20", color: meta.color, border: `1px solid ${meta.color}44`, borderRadius: 4, padding: "3px 8px", fontSize: 9, fontWeight: 700, letterSpacing: 0.9, whiteSpace: "nowrap", flexShrink: 0 }}>
                            {meta.label}
                          </span>
                          <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: "nowrap", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                            {dateDisplay}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Row 2: title — full wrap, no clamp, the primary content */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, lineHeight: 1.5, marginBottom: 8 }}>
                      {item.title || "(no title)"}
                    </div>

                    {/* Row 3: snippet — 2 lines, secondary context */}
                    {item.snippet && (
                      <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.55, flex: 1, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.snippet}
                      </div>
                    )}

                    {/* Footer: source — clear, weighted, separated */}
                    <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, flexShrink: 0, opacity: 0.8 }} />
                      <span style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, letterSpacing: 0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.source}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ===== INBOX TAB =====
  const renderInbox = () => {

    const sourceTypes = ["All", ...new Set(pendingItems.map(i => i.source_type).filter(Boolean))];

    const visibleItems = pendingItems.filter(item => {
      if (inboxFilter === "pending" && (approved.has(item.id) || declined.has(item.id))) return false;
      if (inboxFilter === "approved" && !approved.has(item.id)) return false;
      if (inboxFilter === "declined" && !declined.has(item.id)) return false;
      if (inboxSourceFilter !== "All" && item.source_type !== inboxSourceFilter) return false;
      return true;
    });

    const approvedCount = pendingItems.filter(i => approved.has(i.id)).length;
    const declinedCount = pendingItems.filter(i => declined.has(i.id)).length;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "pending", label: `Pending (${pendingCount})` },
              { key: "approved", label: `Approved (${approvedCount})` },
              { key: "declined", label: `Declined (${declinedCount})` },
              { key: "all", label: `All (${pendingItems.length})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setInboxFilter(key)} style={{
                background: inboxFilter === key ? COLORS.accent : COLORS.card,
                color: inboxFilter === key ? "#0a0e17" : COLORS.textMuted,
                border: `1px solid ${inboxFilter === key ? COLORS.accent : COLORS.border}`,
                borderRadius: 6, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 10, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Source</label>
            <select value={inboxSourceFilter} onChange={e => setInboxSourceFilter(e.target.value)}
              style={{ background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, outline: "none", cursor: "pointer" }}>
              {sourceTypes.map(t => <option key={t} value={t}>{t === "All" ? "All Sources" : (MEDIA_TYPE_META[t]?.label || t)}</option>)}
            </select>
            {(() => {
              const hasExportable = pendingItems.some(i => approved.has(i.id) && i.source_type === "contract_api" && i.contract_data);
              return (
                <button onClick={hasExportable ? handleExportApproved : undefined} style={{
                  padding: "6px 14px", background: hasExportable ? `${COLORS.green}1a` : "transparent",
                  color: hasExportable ? COLORS.green : COLORS.textMuted,
                  border: `1px solid ${hasExportable ? COLORS.green + "44" : COLORS.border}`,
                  borderRadius: 6, fontSize: 11, fontWeight: 700,
                  cursor: hasExportable ? "pointer" : "default",
                  letterSpacing: 0.3, whiteSpace: "nowrap", opacity: hasExportable ? 1 : 0.45,
                }} title={hasExportable ? "Export approved contract records to data.js format" : "Approve contract_api items to enable export"}>
                  &#8659; Export Approved
                </button>
              );
            })()}
          </div>
        </div>

        {/* Empty state */}
        {visibleItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 20px", color: COLORS.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#9744;</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: COLORS.textDim }}>
              {inboxFilter === "pending" ? "No pending items" : "Nothing here"}
            </div>
            <div style={{ fontSize: 12 }}>
              {inboxFilter === "pending"
                ? "Run the scraper to populate new items, or all current items have been reviewed."
                : "Items will appear here once processed."}
            </div>
          </div>
        )}

        {/* Item list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleItems.map(item => {
            const isApproved = approved.has(item.id);
            const isDeclined = declined.has(item.id);
            const _typeMeta = MEDIA_TYPE_META[item.source_type] || { label: item.source_type, color: COLORS.textMuted };
            const sc = _typeMeta.color;
            const typeLabel = _typeMeta.label;

            return (
              <div key={item.id} style={{
                background: COLORS.card,
                border: `1px solid ${isApproved ? COLORS.green + "55" : isDeclined ? COLORS.border : COLORS.border}`,
                borderRadius: 10, padding: "16px 20px",
                opacity: isDeclined ? 0.45 : 1,
                transition: "border-color 0.2s, opacity 0.2s",
              }}>
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: `${sc}22`, color: sc, border: `1px solid ${sc}44`, whiteSpace: "nowrap", letterSpacing: 0.5 }}>
                        {typeLabel}
                      </span>
                      <span style={{ fontSize: 12, color: COLORS.textDim, fontWeight: 600 }}>{item.source}</span>
                      {item.date && (
                        <span style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{item.date}</span>
                      )}
                      {item.contract_data && item.contract_data.country && (
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${COLORS.purple}22`, color: COLORS.purple, border: `1px solid ${COLORS.purple}33` }}>
                          {item.contract_data.country}
                        </span>
                      )}
                      {item.contract_data && item.contract_data.value && (
                        <span style={{ fontSize: 11, color: COLORS.gold, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {item.contract_data.value >= 1000
                            ? `$${(item.contract_data.value / 1000).toFixed(1)}B`
                            : `$${item.contract_data.value.toFixed(0)}M`}
                        </span>
                      )}
                    </div>
                    {/* Title */}
                    <div style={{ fontSize: 14, fontWeight: 700, color: isDeclined ? COLORS.textMuted : COLORS.text, marginBottom: 6, lineHeight: 1.4 }}>
                      {item.title}
                    </div>
                    {/* Snippet */}
                    {item.snippet && (
                      <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6, maxHeight: 72, overflow: "hidden" }}>
                        {item.snippet}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, minWidth: 110 }}>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "block", padding: "7px 14px", background: COLORS.border, color: COLORS.text, borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap", letterSpacing: 0.3 }}>
                      Open Source &#8599;
                    </a>
                    {!isApproved && !isDeclined && (
                      <>
                        <button onClick={() => handleApprove(item.id)} style={{
                          padding: "7px 14px", background: `${COLORS.green}1a`, color: COLORS.green,
                          border: `1px solid ${COLORS.green}44`, borderRadius: 6, fontSize: 11,
                          fontWeight: 700, cursor: "pointer", letterSpacing: 0.3,
                        }}>&#10003; Approve</button>
                        <button onClick={() => handleDecline(item.id)} style={{
                          padding: "7px 14px", background: "transparent", color: COLORS.textMuted,
                          border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 11,
                          fontWeight: 700, cursor: "pointer", letterSpacing: 0.3,
                        }}>&#10007; Decline</button>
                      </>
                    )}
                    {isApproved && (
                      <div style={{ textAlign: "center", fontSize: 11, color: COLORS.green, fontWeight: 700, padding: "4px 0" }}>&#10003; Approved</div>
                    )}
                    {isDeclined && (
                      <div style={{ textAlign: "center", fontSize: 11, color: COLORS.textMuted, fontWeight: 700, padding: "4px 0" }}>&#10007; Declined</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== DAILY SOURCES PANEL ===== */}
        {(() => {
          const SC = window.SOURCES_CONFIG || { x_accounts: [], rss_feeds: [], podcasts: [], contract_apis: [], disclosure_sources: [] };

          // Build flat source list with type tags
          const allSources = [
            ...SC.x_accounts.map(s => ({ ...s, _type: "X Account",           _typeKey: "x",          _name: "@" + s.handle, _link: "https://x.com/" + s.handle })),
            ...SC.rss_feeds.map(s => ({
              ...s, _type: s.platform || "RSS",
              _typeKey: s.platform && s.platform.toLowerCase().includes("substack") ? "substack" : s.platform && s.platform.toLowerCase().includes("medium") ? "medium" : "rss",
              _name: s.name, _link: s.url.replace("/feed","").replace("/arc/outboundfeeds/rss/",""),
            })),
            ...(SC.podcasts || []).map(s => ({ ...s, _type: "YouTube",  _typeKey: "youtube", _name: s.name, _link: s.url || ("https://www.youtube.com/@" + s.channel) })),
            ...SC.contract_apis.map(s => ({ ...s, _type: "Contract API",       _typeKey: "api",        _name: s.name, _link: s.url || "" })),
            ...SC.disclosure_sources.map(s => ({ ...s, _type: "Official Disclosure", _typeKey: "official", _name: s.name, _link: s.url || "" })),
          ];

          // Count inbox contributions per source (match on source string)
          const countMap = {};
          pendingItems.forEach(item => {
            const key = (item.source || "").toLowerCase();
            if (!countMap[key]) countMap[key] = { total: 0, pending: 0, approved: 0, declined: 0 };
            countMap[key].total++;
            if (approved.has(item.id)) countMap[key].approved++;
            else if (declined.has(item.id)) countMap[key].declined++;
            else countMap[key].pending++;
          });

          const getCount = (src) => {
            const keys = Object.keys(countMap);
            const nameKey = src._name.replace("@","").toLowerCase();
            const match = keys.find(k => k === nameKey || k.includes(nameKey) || nameKey.includes(k));
            return match ? countMap[match] : null;
          };

          const TYPE_ORDER = { "X Account": 0, "Substack": 1, "Medium": 2, "RSS": 3, "Substack / Podcast": 4, "YouTube": 5, "Contract API": 6, "Official Disclosure": 7 };
          const TYPE_COLORS = {
            "X Account": COLORS.accent, "Substack": "#f59e0b", "Medium": "#22c55e",
            "RSS": "#a78bfa", "YouTube": "#ef4444", "Contract API": COLORS.green, "Official Disclosure": COLORS.gold,
            "Substack / Podcast": "#f472b6",
          };
          const CAT_LABELS = {
            official: "Official / Palantir", leadership: "Leadership", analyst: "Analyst / Investor",
            community: "Community", investor: "Investor", defense_media: "Defense Media",
            media: "Tech / Policy Media", defense_policy: "Defense Policy", policy: "Policy / Think Tank",
          };

          const allCats = ["All", ...new Set(allSources.map(s => CAT_LABELS[s.category] || s.category).filter(Boolean))];

          const filtered = allSources.filter(s => sourcesCatFilter === "All" || (CAT_LABELS[s.category] || s.category) === sourcesCatFilter);
          const sorted = [...filtered].sort((a, b) => {
            if (sourcesSort === "type")  return (TYPE_ORDER[a._type] ?? 9) - (TYPE_ORDER[b._type] ?? 9) || a._name.localeCompare(b._name);
            if (sourcesSort === "name")  return a._name.localeCompare(b._name);
            if (sourcesSort === "category") return (a.category || "").localeCompare(b.category || "");
            if (sourcesSort === "items") {
              const ac = getCount(a); const bc = getCount(b);
              return (bc ? bc.total : 0) - (ac ? ac.total : 0);
            }
            return 0;
          });

          const totalInbox = pendingItems.length;

          return (
            <div style={{ marginTop: 24, borderTop: `2px solid ${COLORS.border}`, paddingTop: 20 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5, marginBottom: 4 }}>DAILY INTELLIGENCE SOURCES</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                    {allSources.length} configured sources across {SC.x_accounts.length} X accounts, {SC.rss_feeds.length} newsletters/feeds, {(SC.podcasts||[]).length} podcasts, {SC.contract_apis.length} contract APIs, {SC.disclosure_sources.length} official disclosures
                    {" · "}<span style={{ color: COLORS.accent }}>Scraper runs daily at 08:00 UTC</span>
                    {" · "}All sources are free, no paid APIs
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "X Accounts",    val: SC.x_accounts.length,            color: COLORS.accent },
                    { label: "Newsletters",   val: SC.rss_feeds.length,              color: "#f59e0b" },
                    { label: "Podcasts",      val: (SC.podcasts||[]).length,         color: "#ef4444" },
                    { label: "Contract APIs", val: SC.contract_apis.length,          color: COLORS.green },
                    { label: "IR / SEC",      val: SC.disclosure_sources.length,     color: COLORS.gold },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: "center", padding: "8px 14px", background: COLORS.card, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {["type","name","category","items"].map(k => (
                    <button key={k} onClick={() => setSourcesSort(k)} style={{
                      padding: "5px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      background: sourcesSort === k ? COLORS.accent : COLORS.card,
                      color: sourcesSort === k ? "#0a0e17" : COLORS.textMuted,
                      border: `1px solid ${sourcesSort === k ? COLORS.accent : COLORS.border}`,
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>Sort: {k === "type" ? "Source Type" : k === "name" ? "Name" : k === "category" ? "Category" : "Inbox Items"}</button>
                  ))}
                </div>
                <select value={sourcesCatFilter} onChange={e => setSourcesCatFilter(e.target.value)} style={{
                  background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
                  borderRadius: 6, padding: "5px 10px", fontSize: 11, outline: "none", cursor: "pointer",
                }}>
                  {allCats.map(c => <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>)}
                </select>
              </div>

              {/* Source rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sorted.map((src, i) => {
                  const cnt = getCount(src);
                  const typeColor = TYPE_COLORS[src._type] || COLORS.textMuted;
                  const catLabel = CAT_LABELS[src.category] || src.category || "";
                  const isPalantirOnly = src.palantir_specific;
                  const isFiltered = src.filter_palantir;
                  return (
                    <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "12px 16px", background: COLORS.card, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                      {/* Left: type badge + name + link */}
                      <div style={{ minWidth: 200, maxWidth: 200 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44`, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{src._type.toUpperCase()}</span>
                          {isPalantirOnly && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${COLORS.accent}15`, color: COLORS.accent, border: `1px solid ${COLORS.accent}33`, letterSpacing: 0.3 }}>PLTR-FOCUSED</span>}
                          {isFiltered && !isPalantirOnly && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: `${COLORS.textMuted}15`, color: COLORS.textMuted, border: `1px solid ${COLORS.border}`, letterSpacing: 0.3 }}>FILTERED</span>}
                        </div>
                        <a href={src._link || "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, textDecoration: "none", display: "block", marginBottom: 2 }}
                          onMouseEnter={e => e.target.style.color = typeColor}
                          onMouseLeave={e => e.target.style.color = COLORS.text}>
                          {src._name} &#8599;
                        </a>
                        <div style={{ fontSize: 10, color: COLORS.textMuted }}>{catLabel}</div>
                      </div>

                      {/* Middle: description */}
                      <div style={{ flex: 1, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
                        {src.description}
                        {src.note && <div style={{ marginTop: 4, fontSize: 10, color: COLORS.textMuted, fontStyle: "italic" }}>{src.note}</div>}
                        {src.country && <div style={{ marginTop: 3, fontSize: 10, color: COLORS.purple }}>Coverage: {src.country}</div>}
                        {src.frequency && <div style={{ marginTop: 2, fontSize: 10, color: COLORS.textMuted }}>Cadence: {src.frequency}</div>}
                      </div>

                      {/* Right: inbox stats */}
                      <div style={{ minWidth: 90, textAlign: "right", flexShrink: 0 }}>
                        {cnt ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: cnt.total > 0 ? COLORS.gold : COLORS.textMuted, lineHeight: 1 }}>{cnt.total}</div>
                            <div style={{ fontSize: 9, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>in inbox</div>
                            {cnt.total > 0 && (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 3 }}>
                                {cnt.pending > 0  && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${COLORS.accent}22`,   color: COLORS.accent }}>{cnt.pending}p</span>}
                                {cnt.approved > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${COLORS.green}22`,    color: COLORS.green }}>{cnt.approved}&#10003;</span>}
                                {cnt.declined > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${COLORS.border}`,     color: COLORS.textMuted }}>{cnt.declined}&#10007;</span>}
                              </div>
                            )}
                            {totalInbox > 0 && <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>{((cnt.total / totalInbox) * 100).toFixed(0)}% of inbox</div>}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>—</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  // ===== MAIN RENDER =====
  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: "100vh", fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", padding: 0 }}>
      <div style={{ padding: "20px 28px 0", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, background: COLORS.accent, borderRadius: "50%", boxShadow: `0 0 12px ${COLORS.accent}88` }} />
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: COLORS.text }}>PALANTIR</span>
              <span style={{ fontSize: 20, fontWeight: 300, color: COLORS.textDim, letterSpacing: -0.5 }}>Gov & Defense Contracts</span>
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4, letterSpacing: 0.5 }}>Comprehensive database \u00b7 {CONTRACTS.length} contracts \u00b7 2005\u20132026 \u00b7 All sources cited \u00b7 Click any contract for official documentation</div>
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>
            <div>DATA AS OF MAR 2026</div>
            <div style={{ color: COLORS.accent }}>CWC ADVISORS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", gap: 0 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", borderBottom: tab === t ? `2px solid ${COLORS.accent}` : "2px solid transparent", marginBottom: -1, color: tab === t ? COLORS.accent : COLORS.textMuted, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", transition: "all 0.2s", position: "relative" }}>
                {t}
                {t === "Inbox" && pendingCount > 0 && (
                  <span style={{ position: "absolute", top: 6, right: 4, background: COLORS.pink, color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 700, padding: "1px 5px", lineHeight: 1.4 }}>{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8 }}>
            <span style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>Charts</span>
            <div style={{ display: "flex", background: `${COLORS.border}55`, borderRadius: 6, padding: 2, gap: 2 }}>
              {[["annual","Annual"],["cumulative","Cumulative"]].map(([v,l]) => (
                <button key={v} onClick={() => setViewMode(v)} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: "pointer", border: "none", background: viewMode === v ? COLORS.accent : "transparent", color: viewMode === v ? "#0a0e17" : COLORS.textMuted, letterSpacing: 0.4, textTransform: "uppercase", transition: "all 0.15s" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Global filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 28px", background: `${COLORS.card}cc`, borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>Filters</span>
        {[["Year", gYear, setGYear, allYears], ["Sector", gSector, setGSector, allSectors], ["Country", gCountry, setGCountry, allCountries]].map(([label, val, setter, opts]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 9, color: COLORS.textMuted }}>{label}</span>
            <select value={val} onChange={e => setter(e.target.value)} style={{ background: "#182638", color: val === "All" ? COLORS.textMuted : COLORS.text, border: `1px solid ${val === "All" ? COLORS.border : COLORS.accent}`, borderRadius: 5, padding: "3px 8px", fontSize: 10, cursor: "pointer", outline: "none" }}>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {(gYear !== "All" || gSector !== "All" || gCountry !== "All") && (
          <button onClick={() => { setGYear("All"); setGSector("All"); setGCountry("All"); }} style={{ fontSize: 9, color: COLORS.pink, background: "none", border: `1px solid ${COLORS.pink}44`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", letterSpacing: 0.3 }}>&#10005; Clear</button>
        )}
        <span style={{ fontSize: 9, color: COLORS.textMuted, marginLeft: "auto" }}>{filteredContracts.length} / {CONTRACTS.length} contracts</span>
      </div>
      <div style={{ padding: "20px 28px 40px" }}>
        {tab === "Overview" && renderOverview()}
        {tab === "Explorer" && renderExplorer()}
        {tab === "By Country" && renderByCountry()}
        {tab === "Timeline" && renderTimeline()}
        {tab === "Deal Flow" && renderDealFlow()}
        {tab === "Run Rate" && renderRunRate()}
        {tab === "Financials" && renderFinancials()}
        {tab === "PLTR Docs" && renderPalantirDocs()}
        {tab === "Sources" && renderSources()}
        {tab === "Feed Hub" && renderFeedHub()}
        {tab === "KarpTube" && renderKarpTube()}
        {tab === "Inbox" && renderInbox()}
      </div>

      {/* Universal Contract Detail Modal */}
      {modalContract && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setModalContract(null)}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 28, maxWidth: 560, width: "90%", maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 3 }}>Contract Detail</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{modalContract.name}</div>
              </div>
              <button onClick={() => setModalContract(null)} style={{ background: "none", border: "none", color: COLORS.textMuted, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>&#10005;</button>
            </div>
            <ContractCard c={modalContract} color={COLORS.accent} />
            {modalContract.statusDetail && (
              <div style={{ marginTop: 12, fontSize: 11, color: COLORS.textDim, lineHeight: 1.6, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
                <span style={{ color: COLORS.textMuted, fontWeight: 600 }}>Detail: </span>{modalContract.statusDetail}
              </div>
            )}
            {modalContract.docs && modalContract.docs.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Source Documents</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {modalContract.docs.map((doc, di) => (
                    <a key={di} href={doc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: `${COLORS.accent}0a`, border: `1px solid ${COLORS.border}`, textDecoration: "none", fontSize: 11, color: COLORS.accent }}>
                      <span style={{ flex: 1, color: COLORS.text }}>{doc.label}</span>
                      <span>&#8599;</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
            {modalContract.url && (
              <a href={modalContract.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-block", marginTop: 12, fontSize: 11, color: COLORS.accent, textDecoration: "none" }}>View Primary Source &#8594;</a>
            )}
          </div>
        </div>
      )}

      {/* Export Modal */}
      {exportModal && (
        <div onClick={() => setExportModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, width: "100%", maxWidth: 820, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 3 }}>Export Approved Contracts</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>Copy these entries and append them to <code style={{ background: COLORS.border, padding: "1px 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>window.CONTRACTS</code> in <code style={{ background: COLORS.border, padding: "1px 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>data.js</code>, then fill in the empty fields.</div>
              </div>
              <button onClick={() => setExportModal(false)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>&#10005;</button>
            </div>
            <textarea readOnly value={exportCode} style={{ flex: 1, minHeight: 340, background: "#080c14", color: "#c9d1e0", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "14px 16px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", resize: "vertical", lineHeight: 1.65, outline: "none" }} onClick={e => e.target.select()} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigator.clipboard.writeText(exportCode)} style={{ padding: "8px 20px", background: COLORS.accent, color: "#0a0e17", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}>Copy to Clipboard</button>
              <button onClick={() => {
                const blob = new Blob([exportCode], { type: "text/javascript" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "approved_contracts.js"; a.click();
              }} style={{ padding: "8px 20px", background: "transparent", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Download .js</button>
              <button onClick={() => setExportModal(false)} style={{ padding: "8px 16px", background: "transparent", color: COLORS.textMuted, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(PalantirDashboard));
