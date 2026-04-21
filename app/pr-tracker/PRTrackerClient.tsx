"use client";

import { useEffect, useMemo, useState } from "react";
import type { PR, PRData } from "../types";

// ── helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  bugfix: "#d45b5b",
  feature: "#5b9bd5",
  algo: "#8b6bd5",
  infra: "#5aaa7c",
  doc: "#aaa",
  refactor: "#e8a87c",
  unknown: "#bbb",
};

const CATEGORY_BG: Record<string, string> = {
  bugfix: "#fdf0f0",
  feature: "#eef4fb",
  algo: "#f3eeff",
  infra: "#edf7f2",
  doc: "#f5f5f5",
  refactor: "#fef6ee",
  unknown: "#f5f5f5",
};

function Stars({ value }: { value: number }) {
  return (
    <span className="text-sm tracking-tight" title={`价值 ${value}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < value ? "#f5a623" : "#ddd" }}>
          ★
        </span>
      ))}
    </span>
  );
}

function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

function DiffLine({ type, text }: { type: string; text: string }) {
  const colors: Record<string, string> = {
    "+": "#1a7f37",
    "-": "#cf222e",
    h: "#5b9bd5",
    " ": "#2a231c",
  };
  const bgs: Record<string, string> = {
    "+": "#f0fff4",
    "-": "#fff0f0",
    h: "#f0f6ff",
    " ": "transparent",
  };
  return (
    <div
      style={{
        background: bgs[type] || "transparent",
        color: colors[type] || "#2a231c",
        fontFamily: "ui-monospace, monospace",
        fontSize: "0.72rem",
        lineHeight: "1.5",
        padding: "0 6px",
        whiteSpace: "pre",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {type !== " " && type !== "h" ? (
        <span style={{ opacity: 0.5, marginRight: 4 }}>{type}</span>
      ) : null}
      {text}
    </div>
  );
}

function PRCard({ pr }: { pr: PR }) {
  const [expanded, setExpanded] = useState(false);
  const isMerged = !!pr.merged_at;
  const isUniversal = pr.scope === "universal";

  const catColor = CATEGORY_COLORS[pr.category] || "#bbb";
  const catBg = CATEGORY_BG[pr.category] || "#f5f5f5";

  const hasDiff =
    pr.diff_preview?.hunks?.length > 0 ||
    (pr.diff_preview?.additions ?? 0) + (pr.diff_preview?.deletions ?? 0) > 0;

  return (
    <article
      className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-md"
      style={{ background: "#fff", borderColor: "#e8e0d8" }}
    >
      {/* header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          {/* title row */}
          <div className="flex items-start gap-2 flex-wrap">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-sm hover:underline leading-snug"
              style={{ color: "#2a231c" }}
            >
              {pr.title}
            </a>
          </div>

          {/* meta row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs font-mono" style={{ color: "#7a6e65" }}>
              {pr.repo}#{pr.pr_number}
            </span>
            <span className="text-xs" style={{ color: "#aaa" }}>
              by {pr.author}
            </span>
            {isMerged ? (
              <Badge color="#5aaa7c" bg="#edf7f2">
                merged
              </Badge>
            ) : pr.state === "open" ? (
              <Badge color="#5b9bd5" bg="#eef4fb">
                open
              </Badge>
            ) : (
              <Badge color="#aaa" bg="#f5f5f5">
                closed
              </Badge>
            )}
            <Badge color={catColor} bg={catBg}>
              {pr.category}
            </Badge>
            <Badge
              color={isUniversal ? "#5b9bd5" : "#7a6e65"}
              bg={isUniversal ? "#eef4fb" : "#f5f5f5"}
            >
              {isUniversal ? "🌐 universal" : "🔒 repo-specific"}
            </Badge>
          </div>

          {/* summary */}
          <p className="text-sm mt-2 leading-relaxed" style={{ color: "#3d342a" }}>
            {pr.summary}
          </p>

          {/* value + subsystems + concepts */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Stars value={pr.value} />
            {pr.subsystems?.map((s) => (
              <span
                key={s}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "#f0ebe5", color: "#5a4d45" }}
              >
                {s}
              </span>
            ))}
            {pr.rl_concepts?.map((c) => (
              <span
                key={c}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: "#f3eeff", color: "#6b5ba0" }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* diff stats + expand */}
      {hasDiff && (
        <div
          className="px-4 pb-3 pt-0"
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-xs cursor-pointer"
            style={{ color: "#7a6e65" }}
          >
            <span style={{ color: "#1a7f37" }}>
              +{pr.diff_preview.additions}
            </span>
            <span style={{ color: "#cf222e" }}>
              -{pr.diff_preview.deletions}
            </span>
            {pr.diff_preview.hunks.length > 0 && (
              <span style={{ color: "#aaa" }}>
                · {pr.diff_preview.hunks[0].file.split("/").pop()}
              </span>
            )}
            <span style={{ marginLeft: 4, color: "#5b9bd5" }}>
              {expanded ? "▲ 折叠" : "▼ 查看 diff"}
            </span>
          </button>

          {expanded &&
            pr.diff_preview.hunks.map((hunk, hi) => (
              <div
                key={hi}
                className="mt-2 rounded-lg overflow-hidden border"
                style={{ borderColor: "#e8e0d8" }}
              >
                <div
                  className="px-3 py-1 text-xs"
                  style={{ background: "#f9f4ee", color: "#7a6e65", fontFamily: "monospace" }}
                >
                  {hunk.file}
                </div>
                {hunk.lines.map(([type, text], li) => (
                  <DiffLine key={li} type={type} text={text} />
                ))}
              </div>
            ))}
        </div>
      )}

      {/* files list (collapsed by default) */}
      {pr.files?.length > 0 && (
        <div
          className="px-4 pb-3"
        >
          <details className="text-xs" style={{ color: "#7a6e65" }}>
            <summary className="cursor-pointer" style={{ color: "#5b9bd5" }}>
              {pr.files.length} 个文件改动
            </summary>
            <div className="mt-1 flex flex-col gap-0.5">
              {pr.files.map((f) => (
                <span key={f} className="font-mono" style={{ color: "#5a4d45" }}>
                  {f}
                </span>
              ))}
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

// ── filter state ──────────────────────────────────────────────────────────────

const ALL_CATEGORIES = ["bugfix", "feature", "algo", "infra", "doc", "refactor"];
const ALL_SUBSYSTEMS = [
  "rollout", "trainer", "algo", "objective", "weight-sync",
  "checkpoint", "parallel", "memory", "infra", "multimodal", "logging", "ci",
];

// ── main component ─────────────────────────────────────────────────────────────

export default function PRTrackerClient() {
  const [data, setData] = useState<PRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set());
  const [subsysFilter, setSubsysFilter] = useState<Set<string>>(new Set());
  const [minValue, setMinValue] = useState(1);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/prs.json", { cache: "no-cache" })
      .then((r) => r.json())
      .then((d: PRData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const repos = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.prs.map((p) => p.repo))];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.prs.filter((pr) => {
      if (repoFilter !== "all" && pr.repo !== repoFilter) return false;
      if (scopeFilter !== "all" && pr.scope !== scopeFilter) return false;
      if (catFilter.size > 0 && !catFilter.has(pr.category)) return false;
      if (subsysFilter.size > 0 && !pr.subsystems?.some((s) => subsysFilter.has(s)))
        return false;
      if (pr.value < minValue) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !pr.title.toLowerCase().includes(q) &&
          !pr.summary.toLowerCase().includes(q) &&
          !pr.author.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, repoFilter, scopeFilter, catFilter, subsysFilter, minValue, search]);

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span style={{ color: "#7a6e65" }}>Loading PRs...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span style={{ color: "#d45b5b" }}>Failed to load: {error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f9f4ee" }}>
      {/* top bar */}
      <header
        className="sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3"
        style={{ background: "#f9f4eef0", borderColor: "#e8e0d8", backdropFilter: "blur(8px)" }}
      >
        <h1 className="text-base font-bold flex-1" style={{ color: "#2a231c" }}>
          PR Tracker
        </h1>
        <span className="text-xs" style={{ color: "#aaa" }}>
          {filtered.length} / {data.prs.length} PRs
        </span>
        {data.last_updated && (
          <span className="text-xs hidden sm:block" style={{ color: "#bbb" }}>
            {new Date(data.last_updated).toLocaleDateString("zh-CN")} 更新
          </span>
        )}
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* sidebar filters */}
        <aside className="w-52 shrink-0 hidden lg:block">
          <div className="sticky top-16 flex flex-col gap-5">
            {/* weekly note */}
            {data.weekly_note && (
              <div
                className="rounded-xl p-3 border text-sm leading-relaxed"
                style={{ background: "#fff", borderColor: "#e8e0d8" }}
              >
                <div
                  className="text-xs font-semibold mb-1.5"
                  style={{ color: "#7a6e65" }}
                >
                  📋 本周动态 {data.weekly_note_week}
                </div>
                <div
                  className="weekly-note"
                  style={{ color: "#3d342a", fontSize: "0.8rem", lineHeight: "1.6" }}
                  dangerouslySetInnerHTML={{ __html: data.weekly_note }}
                />
              </div>
            )}

            {/* search */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                搜索
              </label>
              <input
                className="w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-1"
                style={{ borderColor: "#e8e0d8", background: "#fff", color: "#2a231c" }}
                placeholder="标题 / 摘要 / 作者"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* repo */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                仓库
              </label>
              <div className="flex flex-col gap-1">
                {["all", ...repos].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRepoFilter(r)}
                    className="text-left text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{
                      background: repoFilter === r ? "#2a231c" : "#fff",
                      color: repoFilter === r ? "#fff" : "#3d342a",
                      border: "1px solid #e8e0d8",
                    }}
                  >
                    {r === "all" ? "全部" : r}
                  </button>
                ))}
              </div>
            </div>

            {/* scope */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                适用范围
              </label>
              <div className="flex flex-col gap-1">
                {[
                  { val: "all", label: "全部" },
                  { val: "universal", label: "🌐 universal" },
                  { val: "repo-specific", label: "🔒 repo-specific" },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => setScopeFilter(val)}
                    className="text-left text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{
                      background: scopeFilter === val ? "#2a231c" : "#fff",
                      color: scopeFilter === val ? "#fff" : "#3d342a",
                      border: "1px solid #e8e0d8",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* category */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                类别
              </label>
              <div className="flex flex-col gap-1">
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCatFilter(toggleSet(catFilter, cat))}
                    className="text-left text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{
                      background: catFilter.has(cat)
                        ? CATEGORY_COLORS[cat]
                        : "#fff",
                      color: catFilter.has(cat) ? "#fff" : "#3d342a",
                      border: `1px solid ${catFilter.has(cat) ? CATEGORY_COLORS[cat] : "#e8e0d8"}`,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* subsystems */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                子系统
              </label>
              <div className="flex flex-wrap gap-1">
                {ALL_SUBSYSTEMS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSubsysFilter(toggleSet(subsysFilter, s))}
                    className="text-xs px-2 py-0.5 rounded-full transition-colors"
                    style={{
                      background: subsysFilter.has(s) ? "#5a4d45" : "#f0ebe5",
                      color: subsysFilter.has(s) ? "#fff" : "#5a4d45",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* min value */}
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#7a6e65" }}>
                最低价值 {minValue}★
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={minValue}
                onChange={(e) => setMinValue(Number(e.target.value))}
                className="w-full accent-amber-400"
              />
            </div>

            {/* reset */}
            <button
              onClick={() => {
                setRepoFilter("all");
                setScopeFilter("all");
                setCatFilter(new Set());
                setSubsysFilter(new Set());
                setMinValue(1);
                setSearch("");
              }}
              className="text-xs py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "#e8e0d8", color: "#7a6e65", background: "#fff" }}
            >
              重置筛选
            </button>
          </div>
        </aside>

        {/* main content */}
        <main className="flex-1 min-w-0">
          {/* mobile: weekly note */}
          {data.weekly_note && (
            <div
              className="lg:hidden rounded-xl p-3 border mb-4 text-sm"
              style={{ background: "#fff", borderColor: "#e8e0d8" }}
            >
              <span className="text-xs font-semibold" style={{ color: "#7a6e65" }}>
                📋 本周动态：
              </span>
              <span
                className="weekly-note"
                style={{ color: "#3d342a", fontSize: "0.8rem" }}
                dangerouslySetInnerHTML={{ __html: data.weekly_note }}
              />
            </div>
          )}

          {/* mobile filters (horizontal scroll) */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
            <input
              className="rounded-lg border px-3 py-1.5 text-sm outline-none shrink-0"
              style={{ borderColor: "#e8e0d8", background: "#fff", color: "#2a231c", minWidth: 160 }}
              placeholder="搜索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {["all", ...repos].map((r) => (
              <button
                key={r}
                onClick={() => setRepoFilter(r)}
                className="text-xs px-3 py-1.5 rounded-lg shrink-0"
                style={{
                  background: repoFilter === r ? "#2a231c" : "#fff",
                  color: repoFilter === r ? "#fff" : "#3d342a",
                  border: "1px solid #e8e0d8",
                }}
              >
                {r === "all" ? "全部" : r.split("/")[1]}
              </button>
            ))}
            <button
              onClick={() => setScopeFilter(scopeFilter === "universal" ? "all" : "universal")}
              className="text-xs px-3 py-1.5 rounded-lg shrink-0"
              style={{
                background: scopeFilter === "universal" ? "#5b9bd5" : "#fff",
                color: scopeFilter === "universal" ? "#fff" : "#3d342a",
                border: "1px solid #e8e0d8",
              }}
            >
              🌐 universal
            </button>
          </div>

          {/* PR list */}
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <div
                className="text-sm py-16 text-center"
                style={{ color: "#aaa" }}
              >
                没有匹配的 PR
              </div>
            ) : (
              filtered.map((pr) => <PRCard key={pr.id} pr={pr} />)
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
