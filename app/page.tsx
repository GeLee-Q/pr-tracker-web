import Link from "next/link";

const cards = [
  {
    href: "/pr-tracker",
    emoji: "🔍",
    title: "PR Tracker",
    desc: "Track & analyze PRs from slime × miles — daily updated, Claude-powered insights",
    accent: "#5b9bd5",
    bg: "#eef4fb",
  },
  {
    href: "https://github.com/THUDM/slime",
    emoji: "🦠",
    title: "slime",
    desc: "Scalable Lightweight Infrastructure for RL-based Model Enhancement",
    accent: "#5aaa7c",
    bg: "#edf7f2",
    external: true,
  },
  {
    href: "https://github.com/radixark/miles",
    emoji: "🏃",
    title: "miles",
    desc: "Modular Inference & Learning Engine for Scalable RL training",
    accent: "#e8a87c",
    bg: "#fdf3ec",
    external: true,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full">
        <h1
          className="text-4xl font-bold mb-2 tracking-tight"
          style={{ color: "#2a231c" }}
        >
          read_slides
        </h1>
        <p className="text-base mb-12" style={{ color: "#7a6e65" }}>
          GeLee-Q 的阅读笔记 · RL 训练框架动态追踪
        </p>

        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              target={card.external ? "_blank" : undefined}
              rel={card.external ? "noopener noreferrer" : undefined}
              className="group flex items-start gap-4 rounded-2xl p-5 border transition-all hover:shadow-md"
              style={{
                background: card.bg,
                borderColor: "#e8e0d8",
              }}
            >
              <span className="text-3xl mt-0.5">{card.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: card.accent }}
                  >
                    {card.title}
                  </h2>
                  {card.external && (
                    <span className="text-xs" style={{ color: "#aaa" }}>
                      ↗
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5" style={{ color: "#7a6e65" }}>
                  {card.desc}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <p className="text-xs mt-12 text-center" style={{ color: "#bbb" }}>
          每日 09:05 自动更新 · Powered by Claude
        </p>
      </div>
    </main>
  );
}
