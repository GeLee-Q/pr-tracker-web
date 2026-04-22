"use client";

import { useEffect, useMemo, useState } from "react";
import type { PR, PRData } from "../types";

// ── constants ─────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  bugfix:   "#c75a3c",
  infra:    "#7a4428",
  refactor: "#b06040",
  feature:  "#3e4f85",
  algo:     "#2b3a66",
  doc:      "#5a6a9a",
  unknown:  "#998a78",
};

const ALL_CATS = ["bugfix", "feature", "algo", "infra", "doc", "refactor"];

const TIME_OPTS = [
  { label: "近 7 天",  days: 7 },
  { label: "近 30 天", days: 30 },
  { label: "近 90 天", days: 90 },
  { label: "全部",     days: null as number | null },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function weeklyBars(prs: PR[], n = 8): number[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const s = now - (n - i) * 7 * 86400_000;
    const e = now - (n - i - 1) * 7 * 86400_000;
    return prs.filter(p => { const t = +new Date(p.created_at); return t >= s && t < e; }).length;
  });
}


function isoWeekRange(label: string): string {
  const m = label.match(/W(\d+)/i);
  if (!m) return "";
  const w = parseInt(m[1]);
  const y = new Date().getFullYear();
  const jan1 = new Date(y, 0, 1);
  const dow = jan1.getDay() || 7;           // Mon=1..Sun=7
  const mon1 = new Date(y, 0, 1 - (dow - 1)); // Monday of week-1
  const start = new Date(mon1);
  start.setDate(mon1.getDate() + (w - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en", { month: "short", day: "numeric" }).toLowerCase();
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en", { month: "short", day: "numeric" });
}

// ── slime SVG ─────────────────────────────────────────────────────────────────

function Slime({ size = 48, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={Math.round(size * 146 / 164)} viewBox="18 18 164 146"
      xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M100 18C48 18 18 68 18 128c0 24 10 36 82 36s82-12 82-36C182 68 152 18 100 18z"
        fill="#8fd0e8" stroke="#2a231c" strokeWidth="6" strokeLinejoin="round"/>
      <ellipse cx="70" cy="55" rx="14" ry="22" fill="#cae8f3" transform="rotate(-20 70 55)"/>
      <path d="M32 132c18 16 118 16 136 0-3 23-18 32-68 32S35 155 32 132z" fill="#4fb3d1"/>
      <ellipse cx="50"  cy="100" rx="11" ry="6" fill="#f6a8bd"/>
      <ellipse cx="150" cy="100" rx="11" ry="6" fill="#f6a8bd"/>
      <path d="M62 82Q74 70 86 82" fill="none" stroke="#2a231c" strokeWidth="5.5" strokeLinecap="round"/>
      <path d="M114 82Q126 70 138 82" fill="none" stroke="#2a231c" strokeWidth="5.5" strokeLinecap="round"/>
      <path d="M82 100Q100 120 118 100q0 6-3 8Q100 114 85 108q-3-2-3-8z" fill="#2a231c"/>
    </svg>
  );
}

// ── mini bar chart ────────────────────────────────────────────────────────────

function WeeklyBars({ bars, color }: { bars: number[]; color: string }) {
  const max = Math.max(...bars, 1);
  return (
    <div className="weekly-bars">
      {bars.map((v, i) => (
        <span key={i} style={{
          height: `${Math.max(8, (v / max) * 100)}%`,
          background: v > 0 ? color : "var(--rule-soft)",
          opacity: v > 0 ? 0.85 : 0.3,
        }} />
      ))}
    </div>
  );
}

// ── value bars ────────────────────────────────────────────────────────────────

function ValueBar({ value }: { value: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className="vbars">
        {[1,2,3,4,5].map(i => <span key={i} className={i <= value ? "on" : ""} />)}
      </span>
      <span className="vbar-label">VALUE {value}</span>
    </span>
  );
}

// ── PR card ───────────────────────────────────────────────────────────────────

function PRCard({ pr }: { pr: PR }) {
  const catColor = CAT_COLORS[pr.category] ?? "#998a78";
  const stateStr = pr.merged_at ? "merged" : pr.state;
  const hasDiff = (pr.diff_preview?.hunks?.length ?? 0) > 0 ||
    (pr.diff_preview?.additions ?? 0) + (pr.diff_preview?.deletions ?? 0) > 0;

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="card"
      data-scope={pr.scope}
      data-featured={pr.value >= 4 ? "true" : "false"}
      style={{ "--col-color": catColor } as React.CSSProperties}
    >
      {/* top row */}
      <div className="card-top">
        <span className="card-cat" style={{ background: catColor }}>{pr.category}</span>
        <span className="repo-chip">
          {pr.repo.replace("/", " / ")}<span className="num"> #{pr.pr_number}</span>
        </span>
        {pr.scope === "universal" && <span className="univ-chip">UNIVERSAL</span>}
        {pr.value >= 4 && <span className="feat-chip">+ FEATURED</span>}
        <span className="state" data-s={stateStr}>{stateStr.toUpperCase()}</span>
      </div>

      {/* title */}
      <span className="card-title">{pr.title}</span>

      {/* scope reason — revealed on hover via CSS */}
      {pr.reason && <div className="scope-reason">{pr.reason}</div>}

      {/* summary */}
      {pr.summary && pr.summary !== pr.title && (
        <p className="card-summary">{pr.summary}</p>
      )}

      {/* tags */}
      {((pr.rl_concepts?.length ?? 0) + (pr.subsystems?.length ?? 0) + (pr.files?.length ?? 0)) > 0 && (
        <div className="pill-row">
          {pr.rl_concepts?.map(c => <span key={c} className="rl-chip">{c}</span>)}
          {pr.subsystems?.map(s => <span key={s} className="sys-chip"># {s}</span>)}
          {pr.files?.slice(0, 3).map(f => (
            <span key={f} className="file-chip">■ {f.split("/").slice(-2).join("/")}</span>
          ))}
        </div>
      )}

      {/* diff — revealed on hover via CSS */}
      {hasDiff && (
        <div className="diff-peek">
          <div className="dh">
            <span>{pr.diff_preview.hunks[0]?.file ?? ""}</span>
            <span>
              <span className="add">+{pr.diff_preview.additions}</span>
              {" · "}
              <span className="rem">-{pr.diff_preview.deletions}</span>
            </span>
          </div>
          {pr.diff_preview.hunks[0] && (
            <pre>
              {pr.diff_preview.hunks[0].lines.map(([type, text], i) => (
                <span key={i} className={
                  type === "+" ? "l-add" : type === "-" ? "l-rem" : type === "h" ? "l-hunk" : ""
                }>
                  {type !== " " && type !== "h" ? type : " "}{text}{"\n"}
                </span>
              ))}
            </pre>
          )}
        </div>
      )}

      {/* footer */}
      <div className="card-foot">
        <span>@{pr.author}</span>
        <span className="sep">·</span>
        <span>{fmtDate(pr.created_at)}</span>
        <span className="sep">·</span>
        <ValueBar value={pr.value ?? 3} />
      </div>
    </a>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function PRTrackerClient() {
  const [data, setData]       = useState<PRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [repoFilter,  setRepoFilter]  = useState("all");
  const [catFilter,   setCatFilter]   = useState<Set<string>>(new Set());
  const [valFilter,   setValFilter]   = useState<"all" | "featured">("all");
  const [timeRange,   setTimeRange]   = useState<number | null>(30);
  const [search,      setSearch]      = useState("");
  const [view,        setView]        = useState<"list" | "by-author">("list");
  const [poked,       setPoked]       = useState(false);

  useEffect(() => {
    fetch("/data/prs.json", { cache: "no-cache" })
      .then(r => r.json())
      .then((d: PRData) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const repos = useMemo(() =>
    data ? [...new Set(data.prs.map(p => p.repo))] : [], [data]);

  // time-filtered (used for repo card stats)
  const timePRs = useMemo(() => {
    if (!data) return [];
    if (timeRange === null) return data.prs;
    const cut = Date.now() - timeRange * 86400_000;
    return data.prs.filter(p => +new Date(p.created_at) >= cut);
  }, [data, timeRange]);

  // fully filtered
  const filtered = useMemo(() => timePRs.filter(pr => {
    if (repoFilter !== "all" && pr.repo !== repoFilter) return false;
    if (catFilter.size > 0 && !catFilter.has(pr.category)) return false;
    if (valFilter === "featured" && pr.value < 4) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!pr.title.toLowerCase().includes(q) &&
          !pr.summary?.toLowerCase().includes(q) &&
          !pr.author.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [timePRs, repoFilter, catFilter, valFilter, search]);

  // counts for chips
  const repoCounts = useMemo(() => {
    const c: Record<string, number> = { all: filtered.length };
    repos.forEach(r => { c[r] = filtered.filter(p => p.repo === r).length; });
    return c;
  }, [filtered, repos]);

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { all: filtered.length };
    ALL_CATS.forEach(cat => { c[cat] = filtered.filter(p => p.category === cat).length; });
    return c;
  }, [filtered]);

  const featCount = useMemo(() => filtered.filter(p => p.value >= 4).length, [filtered]);

  // repo card stats
  const repoStats = useMemo(() => repos.map(repo => {
    const prs = timePRs.filter(p => p.repo === repo);
    const thisWk = Date.now() - 7 * 86400_000;
    const isSlime = repo.toLowerCase().includes("slime");
    return {
      repo, shortName: repo.split("/")[1], orgName: repo.split("/")[0],
      count: prs.length,
      authors: new Set(prs.map(p => p.author)).size,
      thisWeek: prs.filter(p => +new Date(p.created_at) >= thisWk).length,
      bars: weeklyBars(prs),
      color: isSlime ? "#3e4f85" : "#c75a3c",
      cssColor: isSlime ? "var(--indigo)" : "var(--terracotta)",
    };
  }), [repos, timePRs]);


  // stats
  const univPRs  = filtered.filter(p => p.scope === "universal");
  const repoPRs  = filtered.filter(p => p.scope === "repo-specific");
  const featPRs  = filtered.filter(p => p.value >= 4);
  const univPct  = filtered.length ? Math.round(univPRs.length / filtered.length * 100) : 0;
  const repoPct  = filtered.length ? Math.round(repoPRs.length / filtered.length * 100) : 0;

  // split by state — "closed, not merged" goes to merged column (done)
  const mergedPRs = filtered.filter(p => !!p.merged_at || p.state === "closed");
  const openPRs   = filtered.filter(p => !p.merged_at && p.state === "open");

  // by-author
  const authorGroups = useMemo(() => {
    if (view !== "by-author") return [];
    const m = new Map<string, PR[]>();
    filtered.forEach(p => { if (!m.has(p.author)) m.set(p.author, []); m.get(p.author)!.push(p); });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered, view]);

  function toggleCat(cat: string) {
    setCatFilter(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  }

  function doPokeSlime() {
    setPoked(true); setTimeout(() => setPoked(false), 500);
  }

  function navDate() {
    if (!data?.last_updated) return "";
    const d = new Date(data.last_updated);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  if (loading) return (
    <div className="loading-screen">
      <div style={{ animation: "float 2s ease-in-out infinite" }}>
        <Slime size={72} />
      </div>
      <span style={{ fontFamily: "var(--mono)", color: "var(--ink-mute)", fontSize: 13 }}>loading…</span>
    </div>
  );

  if (error || !data) return (
    <div className="loading-screen">
      <span style={{ fontFamily: "var(--mono)", color: "var(--terracotta)", fontSize: 13 }}>Error: {error}</span>
    </div>
  );

  return (
    <div className="stage">

      {/* ── nav ── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <Slime size={26} />
            <span className="brand-name">pr_tracker</span>
            <span className="brand-sep">/ slime × miles</span>
          </div>
          <div className="nav-meta">
            {data.last_updated && <span>last update <b>{navDate()}</b></span>}
            <span>·</span>
            <span><b>{data.analyzed_ids?.length ?? data.prs.length}</b> analyzed</span>
            <a href="https://github.com/GeLee-Q/pr-tracker-web" target="_blank" rel="noopener" className="github-link">
              github ↗
            </a>
          </div>
        </div>
      </nav>

      <div className="page-content">

        {/* ── hero ── */}
        <section className="hero">
          <div className="hero-left">
            <div className="live-tag">
              <span className="live-dash">—</span>
              <span className="live-dot" />
              LIVE DAILY PR DIGEST
            </div>
            <div className="hero-pr">PR</div>
            <div className="hero-tracker">tracker<span className="hero-tracker-dot">.</span></div>
            <p className="hero-desc">
              追踪 <em>slime</em> 与 <em>miles</em> 两个训练栈的每日 PR ——
              Claude 读完、分类、打分，剩下的交给你判断。
            </p>
          </div>

          <div className="hero-right">
            <div className="repo-cards">
              {repoStats.map(rs => (
                <button
                  key={rs.repo}
                  className={`repo-card${repoFilter === rs.repo ? " active" : ""}`}
                  onClick={() => setRepoFilter(repoFilter === rs.repo ? "all" : rs.repo)}
                >
                  <div className="rc-org">{rs.orgName} / <b>{rs.shortName}</b></div>
                  <div className="rc-name" style={{ color: rs.cssColor }}>{rs.shortName}.</div>
                  <div className="rc-stats">
                    <span><b>{rs.count}</b><small>PRs</small></span>
                    <span><b>{rs.authors}</b><small>authors</small></span>
                    <span><b>{rs.thisWeek}</b><small>this wk</small></span>
                  </div>
                  <WeeklyBars bars={rs.bars} color={rs.color} />
                </button>
              ))}
            </div>

            <div className="slime-row">
              <label className="include-all">
                <input
                  type="checkbox"
                  checked={repoFilter === "all"}
                  onChange={() => setRepoFilter("all")}
                />
                include all repos
              </label>
            </div>

            <div className="slime-area">
              <button className={`slime-btn${poked ? " poked" : ""}`} onClick={doPokeSlime}>
                <Slime size={72} />
              </button>
              <span className="poke-hint">← 戳我一下</span>
            </div>
          </div>
        </section>

        {/* ── weekly note ── */}
        {data.weekly_note && (
          <section className="weekly">
            <div className="wk-left">
              <span className="wk-kicker">WEEKLY</span>
              <span className="wk-num">{data.weekly_note_week}</span>
              <span className="wk-range">{isoWeekRange(data.weekly_note_week ?? "")}</span>
            </div>
            <div className="wk-divider" />
            <div className="wk-body" dangerouslySetInnerHTML={{ __html: data.weekly_note }} />
          </section>
        )}

        {/* ── time range ── */}
        <div className="time-range-row">
          {TIME_OPTS.map(o => (
            <button key={o.label}
              className={`time-btn${timeRange === o.days ? " active" : ""}`}
              onClick={() => setTimeRange(o.days)}>
              {o.label}
            </button>
          ))}
        </div>

        {/* ── stats ── */}
        <section className="stats-section">
          <div className="stats-cols">
            <div className="stat-col">
              <div className="stat-header">
                <span className="stat-square" style={{ background: "var(--indigo)" }} />
                <span className="stat-icon">🌐</span>
                <span className="stat-label">UNIVERSAL</span>
              </div>
              <div className="stat-number">{univPRs.length}</div>
              <div className="stat-pct">{univPct}%</div>
              <div className="stat-desc">对 整个生态 都有影响的 PR —— 算法、infra、跨仓库修复。</div>
            </div>

            <div className="stat-divider" />

            <div className="stat-col">
              <div className="stat-header">
                <span className="stat-square" style={{ background: "var(--terracotta)" }} />
                <span className="stat-icon">🔒</span>
                <span className="stat-label">REPO-SPECIFIC</span>
              </div>
              <div className="stat-number">{repoPRs.length}</div>
              <div className="stat-pct">{repoPct}%</div>
              <div className="stat-desc">仅影响单个仓库的 PR —— 文档、局部 refactor、依赖升级。</div>
            </div>

            <div className="stat-divider" />

            <div className="stat-col stat-col-total">
              <div className="stat-label-sm">TOTAL · FEATURED</div>
              <div className="stat-total-nums">
                <span>{filtered.length}</span>
                <span className="stat-total-dot">·</span>
                <span className="stat-total-feat">{featPRs.length}</span>
              </div>
              <div className="stat-value-note">• value ≥ 4</div>
            </div>
          </div>

          <div className="stats-progress">
            <div className="stats-bar-u" style={{ width: `${univPct}%` }} />
            <div className="stats-bar-r" style={{ width: `${repoPct}%` }} />
            <div className="stats-bar-gap" />
          </div>
        </section>

        {/* ── filter rows ── */}
        <section className="filter-rows">
          <div className="filter-row">
            <span className="filter-row-label">// REPO</span>
            <div className="filter-chips">
              <button className={`fchip${repoFilter === "all" ? " active" : ""}`}
                onClick={() => setRepoFilter("all")}>
                全部 {repoCounts.all}
              </button>
              {repos.map(r => (
                <button key={r}
                  className={`fchip${repoFilter === r ? " active" : ""}`}
                  onClick={() => setRepoFilter(repoFilter === r ? "all" : r)}>
                  {r.split("/")[1]} {repoCounts[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-row-label">// CATEGORY</span>
            <div className="filter-chips">
              <button className={`fchip${catFilter.size === 0 ? " active" : ""}`}
                onClick={() => setCatFilter(new Set())}>
                全部 {catCounts.all}
              </button>
              {ALL_CATS.filter(c => (catCounts[c] ?? 0) > 0).map(cat => (
                <button key={cat}
                  className={`fchip${catFilter.has(cat) ? " active" : ""}`}
                  style={{ "--cat-color": CAT_COLORS[cat] } as React.CSSProperties}
                  onClick={() => toggleCat(cat)}>
                  <span className="fchip-dot" style={{ background: CAT_COLORS[cat] }} />
                  {cat} {catCounts[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-row">
            <span className="filter-row-label">// VALUE</span>
            <div className="filter-chips">
              <button className={`fchip${valFilter === "all" ? " active" : ""}`}
                onClick={() => setValFilter("all")}>
                全部 {catCounts.all}
              </button>
              <button className={`fchip${valFilter === "featured" ? " active" : ""}`}
                onClick={() => setValFilter(valFilter === "featured" ? "all" : "featured")}>
                ★ ★ 精选 (value ≥ 4) {featCount}
              </button>
            </div>
          </div>
        </section>

        {/* ── on the wire ── */}
        <div className="wire-header">
          <div className="wire-title">✳ on the wire</div>
          <div className="wire-controls">
            <input className="wire-search" placeholder="search title / author"
              value={search} onChange={e => setSearch(e.target.value)} />
            <div className="view-toggle">
              <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>list</button>
              <button className={view === "by-author" ? "active" : ""} onClick={() => setView("by-author")}>by author</button>
            </div>
            <span className="result-count">{filtered.length} results</span>
          </div>
        </div>

        {/* ── PR display ── */}
        {view === "list" ? (
          <div className="pr-grid">
            <div className="pr-col">
              <div className="pr-col-header">
                <span className="col-dot merged" />
                <em>merged</em>
                <span className="col-count">{mergedPRs.length} landed</span>
              </div>
              {mergedPRs.length === 0
                ? <div className="col-empty">no merged PRs</div>
                : mergedPRs.map(pr => <PRCard key={pr.id} pr={pr} />)}
            </div>
            <div className="pr-col">
              <div className="pr-col-header">
                <span className="col-dot open" />
                <em>open</em>
                <span className="col-count">{openPRs.length} in flight</span>
              </div>
              {openPRs.length === 0
                ? <div className="col-empty">no open PRs</div>
                : openPRs.map(pr => <PRCard key={pr.id} pr={pr} />)}
            </div>
          </div>
        ) : (
          <div className="author-groups">
            {authorGroups.map(([author, prs]) => (
              <div key={author} className="author-group">
                <div className="author-group-header">
                  <span>@{author}</span>
                  <span className="author-count">{prs.length} PRs</span>
                </div>
                {prs.map(pr => <PRCard key={pr.id} pr={pr} />)}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
