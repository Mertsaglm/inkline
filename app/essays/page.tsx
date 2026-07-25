import Link from "next/link";
import { supabaseConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DISPLAY_H1 = { fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" } as const;
const DISPLAY_ROW = { fontVariationSettings: "'opsz' 36, 'WONK' 1" } as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function EssaysPage() {
  if (!supabaseConfigured()) return <SetupNotice />;

  const supabase = await createClient();
  const { data: essays } = await supabase
    .from("essays")
    .select("id,title,status,created_at,word_count")
    .order("created_at", { ascending: false });
  const { data: grades } = await supabase
    .from("essay_grades")
    .select("essay_id,overall_score");

  const scoreByEssay = new Map<string, number>();
  for (const g of grades ?? [])
    if (!scoreByEssay.has(g.essay_id))
      scoreByEssay.set(g.essay_id, Number(g.overall_score));

  const list = essays ?? [];

  return (
    <main className="mx-auto max-w-[1000px] px-6 pt-10 pb-20">
      <div className="ink-enter flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Arşiv</span>
          <h1
            className="mt-1.5 font-display text-[2.5rem] font-[400] leading-none tracking-[-0.02em] text-ink"
            style={DISPLAY_H1}
          >
            Essaylerim
          </h1>
        </div>
        <Link href="/write" className="btn btn-ink px-5 py-[11px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Yeni
        </Link>
      </div>

      {list.length > 0 ? (
        <div className="ink-enter ink-enter-1 mt-6 card-lg px-6 py-2">
          {list.map((e, i) => {
            const score = scoreByEssay.get(e.id);
            const done = e.status === "completed";
            return (
              <Link
                key={e.id}
                href={done ? `/essays/${e.id}` : `/essays/${e.id}/edit`}
                className={`row flex items-center justify-between gap-4 px-2 py-4 ${
                  i < list.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <div className="min-w-0">
                  <div
                    className="font-display text-[1.1rem] font-[440] text-ink"
                    style={DISPLAY_ROW}
                  >
                    {e.title}
                  </div>
                  <div className="mt-[3px] font-mono text-[.72rem] text-muted">
                    {e.word_count} kelime · {fmtDate(e.created_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-display text-[1.3rem] text-ink">
                    {score != null ? (
                      score.toFixed(1)
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </span>
                  <span className={`chip ${done ? "chip-positive" : "chip-neutral"}`}>
                    <span className="chip-dot" />
                    {done ? "Değerlendirildi" : "Taslak"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="ink-enter ink-enter-1 mt-6 flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-line-strong bg-surface px-8 py-14 text-center">
          <span className="inline-flex text-faint">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 7v14" />
              <path d="M3 18V5a1 1 0 0 1 1-1h5a3 3 0 0 1 3 3 3 3 0 0 1 3-3h5a1 1 0 0 1 1 1v13" />
              <path d="M3 18a1 1 0 0 0 1 1h6a2 2 0 0 1 2 2 2 2 0 0 1 2-2h6a1 1 0 0 0 1-1" />
            </svg>
          </span>
          <div className="max-w-[40ch]">
            <h3
              className="mb-1.5 font-display text-[1.3rem] font-[460] text-ink"
              style={{ fontVariationSettings: "'opsz' 48, 'WONK' 1" }}
            >
              Henüz essay yok
            </h3>
            <p className="font-read text-[.98rem] leading-[1.6] text-muted">
              İlk essay’ini yazdığında burada görünecek.
            </p>
          </div>
          <Link href="/write" className="btn btn-ink px-[18px] py-[9px] text-[.9rem]">
            İlk essay’ini yaz
          </Link>
        </div>
      )}
    </main>
  );
}
