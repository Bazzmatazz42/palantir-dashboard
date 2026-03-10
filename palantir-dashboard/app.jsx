const { useState, useMemo, useCallback } = React;
const { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area } = window.Recharts;

const CONTRACTS = window.CONTRACTS;
const COLORS = window.COLORS;
const PIE_COLORS = window.PIE_COLORS;
const RUN_RATES = window.RUN_RATES;
const PLTR_DOCS = window.PALANTIR_OFFICIAL_DOCS;

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

const TABS = ["Overview", "Explorer", "By Country", "Timeline", "Deal Flow", "Run Rate", "PLTR Docs", "Sources", "KarpTube", "Inbox"];

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

  // ===== KARPTUBE STATE =====
  const karpItems = useMemo(() => window.KARPTUBE_ITEMS || [], []);
  const [ktSearch, setKtSearch] = useState("");
  const [ktFilter, setKtFilter] = useState("All");
  const [ktSource, setKtSource] = useState("All");
  const [ktSort, setKtSort] = useState("date_desc");

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

  const years = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.year).filter(Boolean).sort((a, b) => b - a).map(String))], []);
  const countries = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.country).sort())], []);
  const sectors = useMemo(() => ["All", ...new Set(CONTRACTS.map(c => c.sector).sort())], []);
  const statuses = ["All", "Active", "Completed", "Under Review"];

  const filtered = useMemo(() => {
    let data = CONTRACTS;
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
  }, [search, filterYear, filterCountry, filterSector, filterStatus, sortCol, sortDir]);

  const totalVal = useMemo(() => CONTRACTS.reduce((s, c) => s + (c.value || 0), 0), []);
  const activeVal = useMemo(() => CONTRACTS.filter(c => c.status === "Active").reduce((s, c) => s + (c.value || 0), 0), []);
  const activeCount = CONTRACTS.filter(c => c.status === "Active").length;
  const countryCount = new Set(CONTRACTS.map(c => c.country)).size;

  const toggleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }, [sortCol]);

  const bySector = useMemo(() => {
    const map = {};
    CONTRACTS.forEach(c => { map[c.sector] = (map[c.sector] || 0) + (c.value || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, []);

  const byCountry = useMemo(() => {
    const map = {};
    CONTRACTS.forEach(c => { map[c.country] = (map[c.country] || 0) + (c.value || 0); });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, []);

  const byYear = useMemo(() => {
    const map = {};
    CONTRACTS.forEach(c => {
      if (!c.year) return;
      if (!map[c.year]) map[c.year] = { year: c.year, total: 0, count: 0, cumulative: 0 };
      map[c.year].total += (c.value || 0);
      map[c.year].count += 1;
    });
    const arr = Object.values(map).sort((a, b) => a.year - b.year);
    let cum = 0;
    arr.forEach(d => { cum += d.total; d.cumulative = cum; });
    return arr;
  }, []);

  const byEntity = useMemo(() => {
    const map = {};
    CONTRACTS.forEach(c => {
      const key = c.entity.length > 28 ? c.entity.slice(0, 26) + "\u2026" : c.entity;
      map[key] = (map[key] || 0) + (c.value || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  }, []);

  const countryDetail = useMemo(() => {
    const map = {};
    CONTRACTS.forEach(c => {
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
  }, [byCountrySort, byCountrySortDir]);

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
  const renderOverview = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Stat label="Total Contracts" value={CONTRACTS.length} sub="Since 2005" color={COLORS.accent} />
        <Stat label="Active Deals" value={activeCount} sub={`${fmt(activeVal)} ceiling`} color={COLORS.green} />
        <Stat label="Total Ceiling Value" value={fmt(totalVal)} sub="All currencies (USD equiv.)" color={COLORS.gold} />
        <Stat label="Countries / Orgs" value={countryCount} sub="Including NATO, UN" color={COLORS.purple} />
        <Stat label="2025 Peak" value="$970.5M" sub="Federal contracts (The Hill)" color={COLORS.pink} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>CONTRACT VALUE BY SECTOR ($M)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={bySector} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={110} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={v => [`$${v.toFixed(0)}M`, "Value"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={30}>
                {bySector.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>DISTRIBUTION BY COUNTRY ($M)</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byCountry.filter(c => c.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2} label={({ name, percent }) => percent > 0.03 ? `${name.slice(0, 12)} ${(percent * 100).toFixed(0)}%` : ""} labelLine={false} style={{ fontSize: 9 }}>
                {byCountry.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={v => [`$${v.toFixed(0)}M`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>CUMULATIVE CONTRACT VALUE ($M) \u2014 BY YEAR</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={byYear} margin={{ left: 10, right: 20, top: 10 }}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 11 }} axisLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={v => [`$${v.toFixed(0)}M`]} />
              <Area type="monotone" dataKey="cumulative" stroke={COLORS.accent} fill="url(#grad1)" strokeWidth={2} name="Cumulative" />
              <Area type="monotone" dataKey="total" stroke={COLORS.gold} fill="none" strokeWidth={2} strokeDasharray="5 5" name="Annual" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>TOP AWARDING ENTITIES ($M)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byEntity} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 9 }} width={130} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={v => [`$${v.toFixed(0)}M`, "Value"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={COLORS.accentDim} maxBarSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

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
    const statusData = [
      { name: "Active", value: CONTRACTS.filter(c => c.status === "Active").length },
      { name: "Completed", value: CONTRACTS.filter(c => c.status === "Completed").length },
      { name: "Under Review", value: CONTRACTS.filter(c => c.status === "Under Review").length },
    ];
    const procurementData = {};
    CONTRACTS.forEach(c => { procurementData[c.procurement] = (procurementData[c.procurement] || 0) + 1; });
    const procArr = Object.entries(procurementData).map(([name, value]) => ({ name: name.length > 22 ? name.slice(0, 20) + "\u2026" : name, value })).sort((a, b) => b.value - a.value);
    const productData = {};
    CONTRACTS.forEach(c => { c.product.split(",").forEach(p => { const key = p.trim(); if (key) productData[key] = (productData[key] || 0) + 1; }); });
    const prodArr = Object.entries(productData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>CONTRACTS AWARDED PER YEAR</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byYearCount} margin={{ left: 0, right: 10 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="year" tick={{ fill: COLORS.textDim, fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" fill={COLORS.accent} radius={[4, 4, 0, 0]} name="Contracts" maxBarSize={36} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>STATUS BREAKDOWN</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name, value }) => `${name}: ${value}`} labelLine={false} style={{ fontSize: 11 }}>
                  {statusData.map((_, i) => <Cell key={i} fill={[COLORS.green, COLORS.textMuted, COLORS.gold][i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>PROCUREMENT TYPE DISTRIBUTION</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={procArr} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 9 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" fill={COLORS.purple} radius={[0, 4, 4, 0]} name="Count" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>PALANTIR PRODUCT FREQUENCY</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={prodArr} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: COLORS.textDim, fontSize: 10 }} width={140} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" fill={COLORS.pink} radius={[0, 4, 4, 0]} name="Contracts" maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
              <Tooltip contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 11 }} labelStyle={{ color: COLORS.text, fontWeight: 600 }} itemStyle={{ color: COLORS.textDim }} formatter={v => [`$${v.toFixed(1)}M`]} />
              <Legend wrapperStyle={{ fontSize: 10, color: COLORS.textDim }} />
              <Area type="monotone" dataKey="defense" stackId="1" stroke="#00e5ff" fill="url(#gDef)" name="Defense" />
              <Area type="monotone" dataKey="homeland" stackId="1" stroke="#f59e0b" fill="url(#gHS)" name="Homeland Security" />
              <Area type="monotone" dataKey="health" stackId="1" stroke="#22c55e" fill="url(#gHL)" name="Health / Veterans" />
              <Area type="monotone" dataKey="intel" stackId="1" stroke="#a78bfa" fill="url(#gINT)" name="Intelligence" />
              <Area type="monotone" dataKey="intl" stackId="1" stroke="#f472b6" fill="url(#gIntl)" name="International" />
              <Area type="monotone" dataKey="other" stackId="1" stroke="#64748b" fill="#64748b22" name="Other Govt" />
            </AreaChart>
          </ResponsiveContainer>
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
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>CONTRACT-LEVEL ANNUAL RUN RATE ($M)</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 12 }}>Each row = one contract. Green = active years.</div>
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
                {contractsWithRR.sort((a, b) => b.av - a.av).map(c => (
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.accent, letterSpacing: 0.5 }}>KarpTube</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
              {karpItems.length} items · news, articles, podcasts, videos, newsletters, blogs, social
            </div>
          </div>
          <input
            placeholder="Search KarpTube..."
            value={ktSearch}
            onChange={e => setKtSearch(e.target.value)}
            style={{ ...selectStyle, borderRadius: 8, padding: "7px 14px", fontSize: 12, width: 240 }}
          />
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
              {ktFilter !== "All" && ` · ${TYPE_META[ktFilter]?.label || ktFilter}`}
              {ktSource !== "All" && ` · ${ktSource}`}
              {ktSearch && ` · "${ktSearch}"`}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {karpItems.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: COLORS.textMuted }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No content yet</div>
            <div style={{ fontSize: 12 }}>The KarpTube scraper will populate this feed daily.</div>
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
        <div style={{ display: "flex", gap: 0, marginTop: 16 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", borderBottom: tab === t ? `2px solid ${COLORS.accent}` : "2px solid transparent", color: tab === t ? COLORS.accent : COLORS.textMuted, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: 0.5, textTransform: "uppercase", transition: "all 0.2s", position: "relative" }}>
              {t}
              {t === "Inbox" && pendingCount > 0 && (
                <span style={{ position: "absolute", top: 6, right: 4, background: COLORS.pink, color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 700, padding: "1px 5px", lineHeight: 1.4 }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "20px 28px 40px", maxWidth: 1200 }}>
        {tab === "Overview" && renderOverview()}
        {tab === "Explorer" && renderExplorer()}
        {tab === "By Country" && renderByCountry()}
        {tab === "Timeline" && renderTimeline()}
        {tab === "Deal Flow" && renderDealFlow()}
        {tab === "Run Rate" && renderRunRate()}
        {tab === "PLTR Docs" && renderPalantirDocs()}
        {tab === "Sources" && renderSources()}
        {tab === "KarpTube" && renderKarpTube()}
        {tab === "Inbox" && renderInbox()}
      </div>

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
