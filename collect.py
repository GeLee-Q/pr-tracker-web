"""
PR Tracker — 每日拉取 slime 生态 PR，用 Anthropic SDK 分析，写入 read_slides 仓库
用法:
    python collect.py                    # 每日增量：分析新 PR，自动 push
    python collect.py --weekly           # 每周：拉最近7天新PR + 强制重新生成 weekly_note
    python collect.py --refresh          # 每月全量重建：清空数据，拉最近30天，上限200条
    GITHUB_TOKEN=xxx python collect.py   # 任何模式均可加 token，提高速率限制
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import anthropic
import httpx

# ── 配置 ────────────────────────────────────────────────────────────────────
REPOS = ["THUDM/slime", "radixark/miles"]

PR_TRACKER_WEB_ROOT = Path(__file__).parent
DATA_FILE = PR_TRACKER_WEB_ROOT / "public" / "data" / "prs.json"

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")

client = anthropic.Anthropic()

# subsystems 受控词表
SUBSYSTEMS = [
    "rollout", "trainer", "algo", "objective", "weight-sync",
    "checkpoint", "parallel", "memory", "infra", "multimodal", "logging", "ci",
]

# 重要模型/事件关键词：包含这些词的 PR 优先出现在 weekly_note（不受 value 评分限制）
HEADLINE_KEYWORDS = [
    "deepseek", "gemma", "qwen", "llama", "mistral",
]


# ── 数据读写 ─────────────────────────────────────────────────────────────────
def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return {"prs": [], "analyzed_ids": []}


def save_data(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    DATA_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ── GitHub API ────────────────────────────────────────────────────────────────
def _gh_headers() -> dict:
    h = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def fetch_prs(repo: str) -> list[dict]:
    r = httpx.get(
        f"https://api.github.com/repos/{repo}/pulls",
        headers=_gh_headers(),
        params={"state": "all", "sort": "created", "direction": "desc", "per_page": 50},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def fetch_prs_since(repo: str, since: datetime, limit: int = 100) -> list[dict]:
    """分页拉取 PR，直到 created_at 早于 since 或达到 limit 条。"""
    results = []
    page = 1
    while len(results) < limit:
        print(f"   page {page} ...")
        r = httpx.get(
            f"https://api.github.com/repos/{repo}/pulls",
            headers=_gh_headers(),
            params={
                "state": "all", "sort": "created", "direction": "desc",
                "per_page": 100, "page": page,
            },
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        for pr in batch:
            created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
            if created < since:
                return results[:limit]
            results.append(pr)
            if len(results) >= limit:
                return results
        page += 1
        time.sleep(0.5)   # 避免触发 API rate limit
    return results[:limit]


def fetch_pr_files(repo: str, pr_number: int) -> list[dict]:
    """返回 GitHub /pulls/{n}/files 结果，失败返回空列表。限速时自动等待重试一次。"""
    url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/files"
    for attempt in range(2):
        try:
            r = httpx.get(url, headers=_gh_headers(), params={"per_page": 30}, timeout=15)
            # 检查剩余配额，提前预警
            remaining = int(r.headers.get("X-RateLimit-Remaining", 99))
            if remaining < 5:
                reset_ts = int(r.headers.get("X-RateLimit-Reset", 0))
                wait = max(0, reset_ts - int(time.time())) + 2
                print(f"    ⏳ GitHub rate limit 即将耗尽，等待 {wait}s ...")
                time.sleep(wait)
            if r.status_code == 403 and "rate limit" in r.text.lower():
                if attempt == 0:
                    print(f"    ⚠ rate limit，等待 60s 后重试...")
                    time.sleep(60)
                    continue
                print(f"    ⚠ fetch_pr_files 放弃（rate limited）")
                return []
            r.raise_for_status()
            return r.json()
        except httpx.HTTPStatusError as e:
            print(f"    ⚠ fetch_pr_files 失败: {e}")
            return []
        except Exception as e:
            if attempt == 0:
                time.sleep(3)
                continue
            print(f"    ⚠ fetch_pr_files 失败: {e}")
            return []
    return []


# ── diff 解析 ─────────────────────────────────────────────────────────────────
_LANG_MAP = {
    "py": "py", "yaml": "yaml", "yml": "yaml",
    "sh": "bash", "md": "md", "json": "json", "toml": "toml",
}


def parse_diff_preview(files_data: list[dict]) -> dict:
    """
    从 GitHub files API 结果解析出 diff_preview。
    additions/deletions 直接求和；hunks 取第一个有 patch 的文件的前 12 行。
    """
    total_add = sum(f.get("additions", 0) for f in files_data)
    total_del = sum(f.get("deletions", 0) for f in files_data)

    hunks = []
    for f in files_data:
        patch = f.get("patch", "")
        if not patch:
            continue
        filename = f.get("filename", "")
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        lang = _LANG_MAP.get(ext, "")

        lines = []
        for raw in patch.split("\n")[:12]:
            if raw.startswith("@@"):
                lines.append(["h", raw])
            elif raw.startswith("+"):
                lines.append(["+", raw[1:]])
            elif raw.startswith("-"):
                lines.append(["-", raw[1:]])
            elif raw.startswith(" "):
                lines.append([" ", raw[1:]])
        if lines:
            hunks.append({"file": filename, "lang": lang, "lines": lines})
            break  # 只取第一个有内容的文件的首 hunk

    return {"additions": total_add, "deletions": total_del, "hunks": hunks}


# ── Claude 分析 ──────────────────────────────────────────────────────────────
def analyze_pr(pr: dict, repo: str, file_names: list[str]) -> dict:
    body = (pr.get("body") or "").strip()[:800]
    files_str = "\n".join(file_names[:20]) if file_names else "（无文件信息）"
    subsys_list = "、".join(SUBSYSTEMS)

    prompt = f"""你在分析 RL 大模型训练框架（如 slime、miles）的 GitHub PR。
这些框架的核心组件高度相似：rollout 引擎、trainer、PPO/GRPO 算法、Megatron/FSDP 并行、权重同步、奖励模型接入等。

只返回一个 JSON 对象，不要有任何其他文字或代码块标记。

仓库: {repo}
PR #{pr['number']}: {pr['title']}
状态: {pr['state']}{'（已合并）' if pr.get('merged_at') else ''}
作者: {pr['user']['login']}
描述: {body or '（无描述）'}
改动文件（前20个）:
{files_str}

返回格式（字段不能缺失）:
{{
  "category": "bugfix 或 feature 或 algo 或 infra 或 doc 或 refactor 之一",
  "scope": "universal 或 repo-specific 之一",
  "summary": "一句话中文摘要，说明这个 PR 做了什么",
  "reason": "中文解释：为什么是 universal 还是 repo-specific",
  "value": 1到5的整数，表示这个PR对RL训练框架研究者的参考价值（5=核心算法/隐蔽bug/重要架构，4=重要功能或通用修复，3=有用但普通，2=琐碎或配置，1=文档/版本号/命名）,
  "subsystems": ["最多3个，从以下选: {subsys_list}"],
  "rl_concepts": ["涉及的RL/训练概念，如PPO、GRPO、KL、advantage、reward-model、Megatron、FSDP、LoRA等，最多5个"]
}}

scope 判断标准——以下属于 universal：
- rollout / Megatron / FSDP / 训练循环中的 bug 修复（所有用相同组件的框架都会遇到）
- PPO、GRPO、DPO、KL 散度、advantage 估计等 RL 算法改动
- 多模态（VLM）支持、视觉输入处理（其他框架也需要接入视觉）
- 权重同步、checkpoint、梯度处理等通用训练基础设施改动
- 通用接口、数据格式、采样策略、长度过滤等

以下属于 repo-specific：
- 该仓库特有的模型适配（如 Qwen3.5、GLM-5 专属 patch）
- 特定硬件构建脚本（Docker、conda、A100/B300 专属）
- 仓库自己的路由器、调度器、内部工具的修改
- 版本号 bump、README 更新、CI 配置
- 仅在该仓库命名/目录结构下有意义的重构"""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )

    result_text = next(
        (b.text for b in response.content if b.type == "text"), ""
    )

    match = re.search(r"\{[\s\S]*?\}", result_text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return {
        "category": "unknown",
        "scope": "unknown",
        "summary": pr["title"],
        "reason": "解析失败",
        "subsystems": [],
        "rl_concepts": [],
    }


# ── weekly_note ───────────────────────────────────────────────────────────────
def current_week_key() -> str:
    now = datetime.now(timezone.utc)
    year, week, _ = now.isocalendar()
    return f"{year}-W{week:02d}"


def generate_weekly_note(all_prs: list[dict]) -> str:
    """用最近 7 天高价值 PR 生成一段 HTML 周报摘要。
    含 HEADLINE_KEYWORDS 的 PR 优先入选（最多占 2 席），其余按 value 分数补齐至 6 条。
    """
    now = datetime.now(timezone.utc)
    recent = []
    for p in all_prs:
        try:
            created = datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
            if (now - created).days < 7:
                recent.append(p)
        except Exception:
            pass

    pool = recent if recent else all_prs[:15]

    def is_headline(p: dict) -> bool:
        text = (p.get("title", "") + " " + p.get("summary", "")).lower()
        return any(kw in text for kw in HEADLINE_KEYWORDS)

    headline_prs = [p for p in pool if is_headline(p)][:2]
    headline_ids = {id(p) for p in headline_prs}
    remaining = sorted(
        [p for p in pool if id(p) not in headline_ids],
        key=lambda p: p.get("value", 3), reverse=True
    )[:6 - len(headline_prs)]
    highlights = headline_prs + remaining

    lines = "\n".join(
        f"- {p['repo']}#{p['pr_number']} ({p.get('value',3)}★): {p.get('summary', p['title'])}"
        for p in highlights
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        messages=[{"role": "user", "content": f"""你是 RL 训练框架动态评论员，用一句话写「本周动态」给研究者看。

只返回一段 HTML 字符串（不超过 80 字），不加任何其他内容。
格式规则：<em>xxx</em> 表示关键词（红色加粗），<b>#repo#num</b> 表示 PR 号徽章。

本周高价值 PR：
{lines}"""}]
    )
    return next((b.text for b in response.content if b.type == "text"), "").strip()


# ── git push ─────────────────────────────────────────────────────────────────
def git_push() -> None:
    root = str(PR_TRACKER_WEB_ROOT)
    steps = [
        ["git", "-C", root, "add", "public/data/prs.json"],
        ["git", "-C", root, "commit", "-m", "chore: update pr tracker data"],
        ["git", "-C", root, "push", "origin", "main"],
    ]
    for cmd in steps:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            if "nothing to commit" in result.stdout + result.stderr:
                print("  ℹ 数据无变化，跳过 commit")
                return
            print(f"  ⚠ 失败: {' '.join(cmd)}\n    {result.stderr.strip()}")
            return
    print("  ✅ 已推送到 GitHub")


# ── 全量重建流程 ──────────────────────────────────────────────────────────────
def refresh(days: int = 30, total_limit: int = 200) -> None:
    """清空现有数据，拉最近 days 天的 PR（两仓库合计上限 total_limit），全部重新分析。"""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    per_repo = total_limit // len(REPOS)

    print(f"🔄 全量重建模式：最近 {days} 天，每仓库最多 {per_repo} 条（合计 {total_limit}）")
    print(f"   since: {since.strftime('%Y-%m-%d')}\n")

    # 清空旧数据，保留 weekly_note
    data = load_data()
    old_note      = data.get("weekly_note", "")
    old_note_week = data.get("weekly_note_week", "")
    data = {"prs": [], "analyzed_ids": [], "weekly_note": old_note, "weekly_note_week": old_note_week}

    all_to_analyze: list[tuple[dict, str, str]] = []
    for repo in REPOS:
        print(f"📡 Fetching {repo} (最近 {days} 天，上限 {per_repo}) ...")
        try:
            prs = fetch_prs_since(repo, since, limit=per_repo)
            print(f"   → 共 {len(prs)} 条\n")
            for pr in prs:
                pr_id = f"{repo}#{pr['number']}"
                all_to_analyze.append((pr, repo, pr_id))
        except Exception as e:
            print(f"   ⚠ 获取失败: {e}")

    if not all_to_analyze:
        print("没有可分析的 PR，退出。")
        return

    # 按 created_at 降序排序（最新的先分析）
    all_to_analyze.sort(
        key=lambda x: x[0]["created_at"], reverse=True
    )
    all_to_analyze = all_to_analyze[:total_limit]

    print(f"🔍 共 {len(all_to_analyze)} 个 PR，开始逐一分析...\n")

    files_interval = 0.0 if GITHUB_TOKEN else 1.2

    for i, (pr, repo, pr_id) in enumerate(all_to_analyze, 1):
        title_short = pr["title"][:55] + ("…" if len(pr["title"]) > 55 else "")
        print(f"  [{i}/{len(all_to_analyze)}] [{pr_id}] {title_short}")

        if files_interval > 0:
            time.sleep(files_interval)
        files_data = fetch_pr_files(repo, pr["number"])
        file_names = [f["filename"] for f in files_data]

        try:
            analysis = analyze_pr(pr, repo, file_names)
        except Exception as e:
            print(f"    ⚠ 分析出错: {e}")
            analysis = {
                "category": "unknown", "scope": "unknown",
                "summary": pr["title"], "reason": f"分析出错: {e}",
                "value": 3, "subsystems": [], "rl_concepts": [],
            }

        scope_icon = "🌐" if analysis.get("scope") == "universal" else "🔒"
        value = int(analysis.get("value") or 3)
        stars = "★" * value + "☆" * (5 - value)
        print(f"    {scope_icon} {analysis.get('category')} / {analysis.get('scope')}  [{stars}]")
        print(f"    {analysis.get('summary')}")

        diff_preview = parse_diff_preview(files_data)

        data["prs"].append({
            "id": pr_id,
            "repo": repo,
            "pr_number": pr["number"],
            "title": pr["title"],
            "state": pr["state"],
            "author": pr["user"]["login"],
            "created_at": pr["created_at"],
            "merged_at": pr.get("merged_at"),
            "url": pr["html_url"],
            "category": analysis.get("category", "unknown"),
            "scope": analysis.get("scope", "unknown"),
            "summary": analysis.get("summary", pr["title"]),
            "reason": analysis.get("reason", ""),
            "value": value,
            "subsystems": analysis.get("subsystems") or [],
            "rl_concepts": analysis.get("rl_concepts") or [],
            "files": file_names[:20],
            "diff_preview": diff_preview,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        })
        data["analyzed_ids"].append(pr_id)

        # 每10条保存一次，防止意外中断丢数据
        if i % 10 == 0:
            save_data(data)
            print(f"    💾 已保存 {i} 条\n")

    # 生成 weekly_note（已 pin 则跳过）
    wk = current_week_key()
    if data.get("weekly_note_pinned"):
        print(f"\n📌 weekly_note 已 pin，跳过自动生成（手动内容保留）")
    else:
        print(f"\n📝 生成 {wk} weekly_note ...")
        try:
            note = generate_weekly_note(data["prs"])
            data["weekly_note"] = note
            data["weekly_note_week"] = wk
            print(f"   {note}")
        except Exception as e:
            print(f"   ⚠ weekly_note 生成失败: {e}")

    save_data(data)
    print(f"\n✅ 完成，共写入 {len(data['prs'])} 条")
    print("📤 推送到 GitHub ...")
    git_push()


# ── 主流程 ────────────────────────────────────────────────────────────────────
def main() -> None:
    data = load_data()
    analyzed_ids = set(data.get("analyzed_ids", []))

    new_prs: list[tuple[dict, str, str]] = []
    for repo in REPOS:
        print(f"📡 Fetching {repo} ...")
        try:
            prs = fetch_prs(repo)
            fresh = [
                (pr, repo, f"{repo}#{pr['number']}")
                for pr in prs
                if f"{repo}#{pr['number']}" not in analyzed_ids
            ]
            print(f"   {len(prs)} total, {len(fresh)} new")
            new_prs.extend(fresh)
        except Exception as e:
            print(f"   ⚠ 获取失败: {e}")

    if not new_prs:
        print("\n✅ 没有新 PR，退出")
        return

    print(f"\n🔍 共 {len(new_prs)} 个新 PR，逐一分析...\n")
    if not GITHUB_TOKEN and len(new_prs) > 10:
        print(f"  ⚠ 未设置 GITHUB_TOKEN，{len(new_prs)} 条 PR 会触发 rate limit")
        print(f"     建议: GITHUB_TOKEN=xxx python collect.py\n")

    # 无 token 时每条之间稍作间隔，避免 files API 打满 60 req/hour
    files_interval = 0.0 if GITHUB_TOKEN else 1.2

    for pr, repo, pr_id in new_prs:
        title_short = pr["title"][:55] + ("…" if len(pr["title"]) > 55 else "")
        print(f"  [{pr_id}] {title_short}")

        # 拉文件列表（无 token 时节流）
        if files_interval > 0:
            time.sleep(files_interval)
        files_data = fetch_pr_files(repo, pr["number"])
        file_names = [f["filename"] for f in files_data]

        try:
            analysis = analyze_pr(pr, repo, file_names)
        except Exception as e:
            print(f"    ⚠ 分析出错: {e}")
            analysis = {
                "category": "unknown",
                "scope": "unknown",
                "summary": pr["title"],
                "reason": f"分析出错: {e}",
                "subsystems": [],
                "rl_concepts": [],
            }

        scope_icon = "🌐" if analysis.get("scope") == "universal" else "🔒"
        value = int(analysis.get("value") or 3)
        stars = "★" * value + "☆" * (5 - value)
        print(f"    {scope_icon} {analysis.get('category')} / {analysis.get('scope')}  [{stars}]")
        print(f"    {analysis.get('summary')}")

        diff_preview = parse_diff_preview(files_data)

        data["prs"].insert(0, {
            "id": pr_id,
            "repo": repo,
            "pr_number": pr["number"],
            "title": pr["title"],
            "state": pr["state"],
            "author": pr["user"]["login"],
            "created_at": pr["created_at"],
            "merged_at": pr.get("merged_at"),
            "url": pr["html_url"],
            "category": analysis.get("category", "unknown"),
            "scope": analysis.get("scope", "unknown"),
            "summary": analysis.get("summary", pr["title"]),
            "reason": analysis.get("reason", ""),
            "value": value,
            "subsystems": analysis.get("subsystems") or [],
            "rl_concepts": analysis.get("rl_concepts") or [],
            "files": file_names[:20],
            "diff_preview": diff_preview,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        })
        analyzed_ids.add(pr_id)
        data["analyzed_ids"] = list(analyzed_ids)
        save_data(data)

    # ── weekly_note：pin 优先；否则当前周没有则生成 ────────────────────────
    wk = current_week_key()
    if data.get("weekly_note_pinned"):
        print(f"\n📌 weekly_note 已 pin，跳过自动生成（手动内容保留）")
    elif data.get("weekly_note_week") != wk:
        print(f"\n📝 生成 {wk} weekly_note ...")
        try:
            note = generate_weekly_note(data["prs"])
            data["weekly_note"] = note
            data["weekly_note_week"] = wk
            save_data(data)
            print(f"   {note}")
        except Exception as e:
            print(f"   ⚠ weekly_note 生成失败: {e}")

    print(f"\n✅ 完成，共写入 {len(new_prs)} 条")
    print("📤 推送到 GitHub ...")
    git_push()


def weekly() -> None:
    """每周模式：分析最近7天的新 PR，然后强制重新生成 weekly_note 并 push。"""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    print(f"📅 每周模式：拉最近7天新 PR（since {since.strftime('%Y-%m-%d')}）\n")

    data = load_data()
    analyzed_ids = set(data.get("analyzed_ids", []))

    new_prs: list[tuple[dict, str, str]] = []
    for repo in REPOS:
        print(f"📡 Fetching {repo} ...")
        try:
            prs = fetch_prs_since(repo, since, limit=100)
            fresh = [
                (pr, repo, f"{repo}#{pr['number']}")
                for pr in prs
                if f"{repo}#{pr['number']}" not in analyzed_ids
            ]
            print(f"   {len(prs)} total in range, {len(fresh)} new\n")
            new_prs.extend(fresh)
        except Exception as e:
            print(f"   ⚠ 获取失败: {e}")

    files_interval = 0.0 if GITHUB_TOKEN else 1.2

    for i, (pr, repo, pr_id) in enumerate(new_prs, 1):
        title_short = pr["title"][:55] + ("…" if len(pr["title"]) > 55 else "")
        print(f"  [{i}/{len(new_prs)}] [{pr_id}] {title_short}")

        if files_interval > 0:
            time.sleep(files_interval)
        files_data = fetch_pr_files(repo, pr["number"])
        file_names = [f["filename"] for f in files_data]

        try:
            analysis = analyze_pr(pr, repo, file_names)
        except Exception as e:
            print(f"    ⚠ 分析出错: {e}")
            analysis = {
                "category": "unknown", "scope": "unknown",
                "summary": pr["title"], "reason": f"分析出错: {e}",
                "value": 3, "subsystems": [], "rl_concepts": [],
            }

        scope_icon = "🌐" if analysis.get("scope") == "universal" else "🔒"
        value = int(analysis.get("value") or 3)
        stars = "★" * value + "☆" * (5 - value)
        print(f"    {scope_icon} {analysis.get('category')} / {analysis.get('scope')}  [{stars}]")
        print(f"    {analysis.get('summary')}")

        diff_preview = parse_diff_preview(files_data)
        data["prs"].insert(0, {
            "id": pr_id, "repo": repo, "pr_number": pr["number"],
            "title": pr["title"], "state": pr["state"],
            "author": pr["user"]["login"], "created_at": pr["created_at"],
            "merged_at": pr.get("merged_at"), "url": pr["html_url"],
            "category": analysis.get("category", "unknown"),
            "scope": analysis.get("scope", "unknown"),
            "summary": analysis.get("summary", pr["title"]),
            "reason": analysis.get("reason", ""),
            "value": value,
            "subsystems": analysis.get("subsystems") or [],
            "rl_concepts": analysis.get("rl_concepts") or [],
            "files": file_names[:20], "diff_preview": diff_preview,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        })
        analyzed_ids.add(pr_id)
        data["analyzed_ids"] = list(analyzed_ids)
        save_data(data)

    # 强制重新生成 weekly_note（--weekly 清除 pin 并重新生成）
    wk = current_week_key()
    data.pop("weekly_note_pinned", None)  # 清除 pin
    print(f"\n📝 强制重新生成 {wk} weekly_note ...")
    try:
        note = generate_weekly_note(data["prs"])
        data["weekly_note"] = note
        data["weekly_note_week"] = wk
        save_data(data)
        print(f"   {note}")
    except Exception as e:
        print(f"   ⚠ weekly_note 生成失败: {e}")

    print(f"\n✅ 完成，新增 {len(new_prs)} 条")
    print("📤 推送到 GitHub ...")
    git_push()


if __name__ == "__main__":
    if "--refresh" in sys.argv:
        refresh(days=30, total_limit=200)
    elif "--weekly" in sys.argv:
        weekly()
    else:
        main()
