"use client";

import { useEffect, useMemo, useState } from "react";
import type { PR, PRData } from "../types";

// ── design tokens ─────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  bugfix:   "#c75a3c",
  infra:    "#a84a2e",
  refactor: "#d98066",
  feature:  "#3e4f85",
  algo:     "#2b3a66",
  doc:      "#8695c2",
  unknown:  "#998a78",
};

const ALL_CATEGORIES = ["bugfix", "feature", "algo", "infra", "doc", "refactor"];
const ALL_SUBSYSTEMS = [
  "rollout", "trainer", "algo", "objective", "weight-sync",
  "checkpoint", "parallel", "memory", "infra", "multimodal", "logging", "ci",
];

// ── helpers ───────────────────────────────────────────────────────────────────

function ValueBar({ value }: { value: number }) {
  return (
    <span className="value-bar" data-v={String(value)}>
      <span className="bars">
        {[1,2,3,4,5].map(i => (
          <span key={i} className={i <= value ? "on" : ""} />
        ))}
      </span>
      <span className="lbl">v{value}</span>
    </span>
  );
}

function PRCard({ pr }: { pr: PR }) {
  const catColor = CAT_COLORS[pr.category] || "#998a78";
  const stateStr = pr.merged_at ? "merged" : pr.state;
  const hasDiff = pr.diff_preview?.hunks?.length > 0 ||
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
        <span
          className="cat-chip"
          style={{ "--cat-color": catColor } as React.CSSProperties}
        >
          {pr.category}
        </span>

        <span className="repo-chip">
          {pr.repo.split("/")[1]}
          <span className="num">#{pr.pr_number}</span>
        </span>

        <span className={`scope-pill ${pr.scope === "universal" ? "universal" : "repo"}`}>
          {pr.scope === "universal" ? "universal" : "repo"}
        </span>

        <span className="state" data-s={stateStr}>
          {stateStr}
        </span>
      </div>

      {/* value bar */}
      <ValueBar value={pr.value ?? 3} />

      {/* title */}
      <span className="card-title">{pr.title}</span>

      {/* summary */}
      {pr.summary && pr.summary !== pr.title && (
        <p className="card-summary">{pr.summary}</p>
      )}

      {/* scope reason (hover-revealed) */}
      {pr.reason && <div className="scope-reason">{pr.reason}</div>}

      {/* subsystems + rl_concepts */}
      {((pr.subsystems?.length ?? 0) + (pr.rl_concepts?.length ?? 0)) > 0 && (
        <div className="pill-row">
          {pr.subsystems?.map(s => (
            <span key={s} className="sys-chip">{s}</span>
          ))}
          {pr.rl_concepts?.map(c => (
            <span key={c} className="concept-chip">{c}</span>
          ))}
        </div>
      )}

      {/* diff peek (CSS hover) */}
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
                <span
                  key={i}
                  className={
                    type === "+" ? "l-add" :
                    type === "-" ? "l-rem" :
                    type === "h" ? "l-hunk" : ""
                  }
                >
                  {type !== " " && type !== "h" ? type : " "}{text}{"\n"}
                </span>
              ))}
            </pre>
          )}
        </div>
      )}

      {/* footer */}
      <div className="card-foot">
        <span className="author">{pr.author}</span>
        <span className="sep">·</span>
        <span>{new Date(pr.created_at).toLocaleDateString("zh-CN")}</span>
      </div>
    </a>
  );
}

// ── filter chip ───────────────────────────────────────────────────────────────

function Chip({
  label, active, onClick, color, dot,
}: {
  label: string; active: boolean; onClick: () => void; color?: string; dot?: boolean;
}) {
  return (
    <button
      className={`chip${active ? " active" : ""}${color ? " cat" : ""}`}
      style={color ? { "--chip-color": color } as React.CSSProperties : undefined}
      onClick={onClick}
    >
      {dot && <span className="dot" />}
      {label}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PRTrackerClient() {
  const [data, setData] = useState<PRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [subsysFilter, setSubsysFilter] = useState<Set<string>>(new Set());
  const [minValue, setMinValue] = useState(1);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/prs.json", { cache: "no-cache" })
      .then(r => r.json())
      .then((d: PRData) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const repos = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.prs.map(p => p.repo))];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.prs.filter(pr => {
      if (repoFilter !== "all" && pr.repo !== repoFilter) return false;
      if (scopeFilter !== "all" && pr.scope !== scopeFilter) return false;
      if (catFilter.size > 0 && !catFilter.has(pr.category)) return false;
      if (subsysFilter.size > 0 && !pr.subsystems?.some(s => subsysFilter.has(s))) return false;
      if (pr.value < minValue) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!pr.title.toLowerCase().includes(q) &&
            !pr.summary?.toLowerCase().includes(q) &&
            !pr.author.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data, repoFilter, scopeFilter, catFilter, subsysFilter, minValue, search]);

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    return next;
  }

  function resetFilters() {
    setRepoFilter("all"); setScopeFilter("all");
    setCatFilter(new Set()); setSubsysFilter(new Set());
    setMinValue(1); setSearch("");
  }

  if (loading) return (
    <div className="stage" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <span style={{ fontFamily: "var(--mono)", color: "var(--ink-mute)", fontSize: 13 }}>Loading…</span>
    </div>
  );

  if (error || !data) return (
    <div className="stage" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <span style={{ fontFamily: "var(--mono)", color: "var(--terracotta)", fontSize: 13 }}>Error: {error}</span>
    </div>
  );

  return (
    <div className="stage">
      {/* nav */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <b>PR Tracker</b>
            <span className="sep">/</span>
            <span>slime × miles</span>
          </div>
          <div className="nav-right">
            <span><b>{filtered.length}</b> / {data.prs.length} PRs</span>
            {data.last_updated && (
              <span>{new Date(data.last_updated).toLocaleDateString("zh-CN")} 更新</span>
            )}
          </div>
        </div>
      </nav>

      {/* body */}
      <div className="shell">
        {/* sidebar */}
        <aside className="sidebar">
          {/* weekly note */}
          {data.weekly_note && (
            <div className="weekly">
              <div className="wk-left">
                <span className="wk-kicker">本周动态</span>
                <span className="wk-week">{data.weekly_note_week}</span>
              </div>
              <div
                className="wk-body"
                dangerouslySetInnerHTML={{ __html: data.weekly_note }}
              />
            </div>
          )}

          <div className="filters">
            {/* search */}
            <div>
              <input
                className="search-box"
                placeholder="搜索标题 / 摘要 / 作者…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* repo */}
            <div>
              <div className="filter-label">仓库</div>
              <div className="chips">
                <Chip label="全部" active={repoFilter === "all"} onClick={() => setRepoFilter("all")} />
                {repos.map(r => (
                  <Chip key={r} label={r.split("/")[1]} active={repoFilter === r} onClick={() => setRepoFilter(r)} />
                ))}
              </div>
            </div>

            {/* scope */}
            <div>
              <div className="filter-label">范围</div>
              <div className="chips">
                <Chip label="全部" active={scopeFilter === "all"} onClick={() => setScopeFilter("all")} />
                <Chip label="universal" active={scopeFilter === "universal"} onClick={() => setScopeFilter(scopeFilter === "universal" ? "all" : "universal")} />
                <Chip label="repo-specific" active={scopeFilter === "repo-specific"} onClick={() => setScopeFilter(scopeFilter === "repo-specific" ? "all" : "repo-specific")} />
              </div>
            </div>

            {/* category */}
            <div>
              <div className="filter-label">类别</div>
              <div className="chips">
                {ALL_CATEGORIES.map(cat => (
                  <Chip
                    key={cat} label={cat} dot
                    color={CAT_COLORS[cat]}
                    active={catFilter.has(cat)}
                    onClick={() => setCatFilter(toggle(catFilter, cat))}
                  />
                ))}
              </div>
            </div>

            {/* subsystems */}
            <div>
              <div className="filter-label">子系统</div>
              <div className="chips">
                {ALL_SUBSYSTEMS.map(s => (
                  <Chip
                    key={s} label={s}
                    active={subsysFilter.has(s)}
                    onClick={() => setSubsysFilter(toggle(subsysFilter, s))}
                  />
                ))}
              </div>
            </div>

            {/* min value */}
            <div>
              <div className="filter-label">最低价值 {minValue}/5</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {[1,2,3,4,5].map(v => (
                  <button
                    key={v}
                    onClick={() => setMinValue(v)}
                    style={{
                      display: "flex", flexDirection: "column", gap: 2,
                      cursor: "pointer", background: "none", border: "none", padding: 4,
                      opacity: v >= minValue ? 1 : 0.3,
                    }}
                  >
                    {[1,2,3,4,5].map(i => (
                      <span
                        key={i}
                        style={{
                          width: 5, height: 12, borderRadius: 1,
                          background: i <= v ? "var(--terracotta)" : "var(--rule-soft)",
                          border: `1px solid ${i <= v ? "var(--rule)" : "var(--rule-mid)"}`,
                          display: "block",
                        }}
                      />
                    ))}
                  </button>
                ))}
              </div>
            </div>

            {/* reset */}
            <button
              onClick={resetFilters}
              className="chip"
              style={{ alignSelf: "flex-start", marginTop: 4 }}
            >
              重置筛选
            </button>
          </div>
        </aside>

        {/* main */}
        <main className="main-content">
          {filtered.length === 0 ? (
            <div style={{
              textAlign: "center", paddingTop: 80,
              fontFamily: "var(--mono)", color: "var(--ink-mute)", fontSize: 13,
            }}>
              没有匹配的 PR
            </div>
          ) : (
            filtered.map(pr => <PRCard key={pr.id} pr={pr} />)
          )}
        </main>
      </div>
    </div>
  );
}
