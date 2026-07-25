import Link from "next/link";
import { supabaseConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/db/profile";
import { CEFR_LABELS } from "@/lib/cefr";

export const dynamic = "force-dynamic";

const DISPLAY = { fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" } as const;

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  if (!supabaseConfigured()) return <SetupNotice />;

  const ctx = await ensureProfile();
  if (!ctx) return <SetupNotice />;
  const { profile } = ctx;

  const supabase = await createClient();
  const { data: essays } = await supabase
    .from("essays")
    .select("id,title,status,created_at,word_count")
    .order("created_at", { ascending: false });
  const { data: grades } = await supabase
    .from("essay_grades")
    .select("essay_id,overall_score");

  const all = essays ?? [];
  const recent = all.slice(0, 5);
  const completedCount = all.filter((e) => e.status === "completed").length;
  const draftCount = all.length - completedCount;

  const scoreByEssay = new Map<string, number>();
  for (const g of grades ?? [])
    if (!scoreByEssay.has(g.essay_id))
      scoreByEssay.set(g.essay_id, Number(g.overall_score));

  const avg =
    grades && grades.length
      ? (
          grades.reduce((s, g) => s + Number(g.overall_score), 0) /
          grades.length
        ).toFixed(1)
      : "—";

  const levelLabel = CEFR_LABELS[profile.current_level].split("·")[1]?.trim() ?? "";

  return (
    <main className="mx-auto max-w-[1120px] px-6 pt-10 pb-20">
      {/* Onboarding / welcome banner */}
      {!profile.onboarded && (
        <div className="ink-enter card-lg relative mb-7 overflow-hidden px-8 py-7">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 140% at 88% 0%, color-mix(in srgb, var(--coral) 12%, transparent), transparent 60%)",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-[56ch]">
              <span className="eyebrow eyebrow-coral">Hoş geldin</span>
              <h2
                className="mt-2 mb-1.5 font-display text-[1.9rem] font-[420] leading-[1.1] tracking-[-0.015em] text-ink"
                style={{ fontVariationSettings: "'opsz' 96, 'SOFT' 0, 'WONK' 1" }}
              >
                Yazmaya başlamadan önce seni tanıyalım.
              </h2>
              <p className="font-read text-[1.05rem] leading-[1.6] text-ink-soft">
                Sana en uygun konuları önerebilmemiz için kısa bir seviye
                tespiti yapalım — birkaç cümle yeter.
              </p>
            </div>
            <Link href="/onboarding" className="btn btn-ink shrink-0 px-5 py-3">
              Başla
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="ink-enter ink-enter-1 mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Panel</span>
          <h1
            className="mt-1.5 font-display text-[2.5rem] font-[400] leading-none tracking-[-0.02em] text-ink"
            style={DISPLAY}
          >
            Genel bakış
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/write" className="btn btn-ink px-5 py-[11px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
              <path d="M16 8 2 22" />
            </svg>
            Yeni essay yaz
          </Link>
          <Link href="/progress" className="btn btn-outline px-5 py-[11px]">
            Gelişim planım
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="ink-enter ink-enter-2 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <div className="card p-[22px]">
          <span className="eyebrow">Mevcut seviye</span>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span
              className="font-display text-[3.25rem] font-[390] leading-none text-coral"
              style={{ fontVariationSettings: "'opsz' 144, 'WONK' 1" }}
            >
              {profile.current_level}
            </span>
            <span className="font-sans text-[.85rem] text-muted">{levelLabel}</span>
          </div>
          <span className="mt-2 inline-block font-mono text-[.75rem] text-faint">
            Hedef: {profile.target_level}
          </span>
        </div>

        <div className="card p-[22px]">
          <span className="eyebrow">Yazılan essay</span>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span
              className="font-display text-[3.25rem] font-[400] leading-none text-ink"
              style={{ fontVariationSettings: "'opsz' 144, 'WONK' 1" }}
            >
              {all.length}
            </span>
          </div>
          <span className="mt-2 inline-block font-mono text-[.75rem] text-faint">
            {completedCount} değerlendirildi · {draftCount} taslak
          </span>
        </div>

        <div className="card p-[22px]">
          <span className="eyebrow">Ortalama not</span>
          <div className="mt-3 flex items-baseline gap-1">
            <span
              className="font-display text-[3.25rem] font-[400] leading-none text-ink"
              style={{ fontVariationSettings: "'opsz' 144, 'WONK' 1" }}
            >
              {avg}
            </span>
            <span className="font-display text-[1.3rem] text-muted">/9</span>
          </div>
          <span className="mt-2 inline-block font-mono text-[.75rem] text-faint">
            IELTS benzeri band
          </span>
        </div>
      </div>

      {/* Recent essays */}
      <div className="ink-enter ink-enter-3 mt-9">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <h3
            className="font-display text-[1.5rem] font-[440] text-ink"
            style={{ fontVariationSettings: "'opsz' 72, 'WONK' 1" }}
          >
            Son essaylerin
          </h3>
          {all.length > 0 && (
            <Link
              href="/essays"
              className="inline-flex items-center gap-1.5 font-sans text-[.85rem] text-coral hover:text-coral"
            >
              Tümü
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>

        {recent.length > 0 ? (
          <div className="flex flex-col">
            {recent.map((e, i) => {
              const score = scoreByEssay.get(e.id);
              const done = e.status === "completed";
              return (
                <Link
                  key={e.id}
                  href={done ? `/essays/${e.id}` : `/essays/${e.id}/edit`}
                  className={`row flex items-center justify-between gap-4 px-2.5 py-4 ${
                    i < recent.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div
                      className="font-display text-[1.1rem] font-[440] text-ink"
                      style={{ fontVariationSettings: "'opsz' 36, 'WONK' 1" }}
                    >
                      {e.title}
                    </div>
                    <div className="mt-[3px] font-mono text-[.72rem] text-muted">
                      {e.word_count} kelime · {fmtDate(e.created_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-display text-[1.3rem] text-ink">
                      {score != null ? score.toFixed(1) : <span className="text-faint">—</span>}
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
          <div className="mt-5 flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-line-strong bg-surface px-8 py-14 text-center">
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
                “Yeni essay yaz” ile ilk essay’ine başla.
              </p>
            </div>
            <Link href="/write" className="btn btn-ink px-[18px] py-[9px] text-[.9rem]">
              İlk essay’ini yaz
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
