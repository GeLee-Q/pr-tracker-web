export interface DiffHunkLine {
  0: 'h' | '+' | '-' | ' ';
  1: string;
}

export interface DiffHunk {
  file: string;
  lang: string;
  lines: [string, string][];
}

export interface DiffPreview {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface PR {
  id: string;
  repo: string;
  pr_number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  created_at: string;
  merged_at: string | null;
  url: string;
  category: 'bugfix' | 'feature' | 'algo' | 'infra' | 'doc' | 'refactor' | 'unknown';
  scope: 'universal' | 'repo-specific' | 'unknown';
  summary: string;
  reason: string;
  value: number;
  subsystems: string[];
  rl_concepts: string[];
  files: string[];
  diff_preview: DiffPreview;
  analyzed_at: string;
}

export interface PRData {
  prs: PR[];
  analyzed_ids: string[];
  weekly_note?: string;
  weekly_note_week?: string;
  last_updated?: string;
}
