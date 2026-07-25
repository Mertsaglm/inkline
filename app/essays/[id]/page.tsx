import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import ModelNote from "@/components/ModelNote";
import { createClient } from "@/lib/supabase/server";
import type { Essay, EssayGrade, RubricScores } from "@/lib/db/types";

const RUBRIC_LABELS: Record<keyof RubricScores, string> = {
  task_achievement: "Konuya uygunluk",
  coherence_cohesion: "Tutarlılık & akış",
  lexical_resource: "Kelime zenginliği",
  grammatical_range: "Gramer doğruluğu",
};

const RUBRIC_ORDER: (keyof RubricScores)[] = [
  "task_achievement",
  "coherence_cohesion",
  "lexical_resource",
  "grammatical_range",
];

function ScoreBar({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: number;
  accent: boolean;
  delay: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / 9) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between">
        <span className="font-sans text-[.9rem] text-ink">{label}</span>
        <span className={`font-mono text-[.82rem] ${accent ? "text-coral" : "text-muted"}`}>
          {value.toFixed(1)}/9
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className="h-full origin-left rounded-full"
          style={{
            width: `${pct}%`,
            background: accent ? "var(--coral)" : "var(--ink)",
            animation: `ink-fill .7s ${delay}s cubic-bezier(.2,.7,.2,1) both`,
          }}
        />
      </div>
    </div>
  );
}

export default async function EssayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!supabaseConfigured()) return <SetupNotice />;
  const { id } = await params;

  const supabase = await createClient();
  const { data: essayData } = await supabase
    .from("essays")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!essayData) notFound();
  const essay = essayData as Essay;

  const { data: gradeData } = await supabase
    .from("essay_grades")
    .select("*")
    .eq("essay_id", id)
    .order("created_at", { ascending: false })
    .maybeSingle();
  const grade = gradeData as EssayGrade | null;

  // Lowest-scoring rubric row is accented coral (draws the eye to the focus area).
  const lowestKey = grade
    ? RUBRIC_ORDER.reduce((lo, k) =>
        Number(grade.rubric[k] ?? 0) < Number(grade.rubric[lo] ?? 0) ? k : lo,
      )
    : null;

  return (
    <main className="mx-auto max-w-[1000px] px-6 pt-9 pb-20">
      <Link
        href="/essays"
        className="mb-5 inline-flex items-center gap-[7px] font-sans text-[.88rem] text-muted hover:text-coral"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Tüm essaylerim
      </Link>

      <div className="ink-enter flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-[60ch]">
          <h1
            className="mb-2 font-display text-[2.6rem] font-[400] leading-[1.05] tracking-[-0.02em] text-ink"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" }}
          >
            {essay.title}
          </h1>
          {essay.prompt && (
            <p className="font-read text-[1rem] leading-[1.5] text-muted">
              {essay.prompt}
            </p>
          )}
        </div>
        <Link href={`/essays/${id}/edit`} className="btn btn-outline px-[18px] py-2.5 text-[.9rem]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          Düzenle
        </Link>
      </div>

      {grade ? (
        <>
          {/* Overall band + summary */}
          <div className="ink-enter ink-enter-1 mt-7 grid items-center gap-8 card-lg px-8 py-7 [grid-template-columns:auto_1fr] max-sm:[grid-template-columns:1fr]">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-baseline gap-1">
                <span
                  className="font-display text-[4.75rem] font-[390] leading-none text-ink"
                  style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" }}
                >
                  {Number(grade.overall_score).toFixed(1)}
                </span>
                <span className="font-display text-[1.75rem] text-muted">/9</span>
              </div>
              <span className="band">CEFR {grade.cefr_estimate}</span>
            </div>
            <div className="border-line pl-8 max-sm:border-l-0 max-sm:pl-0 sm:border-l">
              <span className="eyebrow">Özet</span>
              <p className="mt-2 font-read text-[1.1rem] leading-[1.65] text-ink [text-wrap:pretty]">
                {grade.summary_feedback}
              </p>
              <div className="mt-3.5">
                <ModelNote model={grade.ai_model} />
              </div>
            </div>
          </div>

          {/* Rubric */}
          <div className="ink-enter ink-enter-2 mt-5 card-lg px-8 py-7">
            <span className="eyebrow">Rubrik · IELTS benzeri</span>
            <div className="mt-[18px] grid gap-x-10 gap-y-[22px] sm:grid-cols-2">
              {RUBRIC_ORDER.map((k, i) => (
                <ScoreBar
                  key={k}
                  label={RUBRIC_LABELS[k]}
                  value={Number(grade.rubric[k] ?? 0)}
                  accent={k === lowestKey}
                  delay={0.15 + i * 0.07}
                />
              ))}
            </div>
          </div>

          {/* Strengths / improvements */}
          <div className="ink-enter ink-enter-3 mt-5 grid gap-5 sm:grid-cols-2">
            <div
              className="rounded-lg p-6"
              style={{
                border: "1px solid color-mix(in srgb, var(--positive) 30%, transparent)",
                background: "color-mix(in srgb, var(--positive) 7%, transparent)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex text-positive">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <h3
                  className="font-display text-[1.2rem] font-[460] text-ink"
                  style={{ fontVariationSettings: "'opsz' 48, 'WONK' 1" }}
                >
                  Güçlü yönler
                </h3>
              </div>
              <ul className="mt-3.5 flex list-none flex-col gap-[11px] p-0">
                {grade.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5 font-read text-[.98rem] leading-[1.5] text-ink-soft">
                    <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-positive" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="rounded-lg p-6"
              style={{
                border: "1px solid color-mix(in srgb, var(--suggestion) 32%, transparent)",
                background: "color-mix(in srgb, var(--suggestion) 8%, transparent)",
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-flex text-suggestion">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </span>
                <h3
                  className="font-display text-[1.2rem] font-[460] text-ink"
                  style={{ fontVariationSettings: "'opsz' 48, 'WONK' 1" }}
                >
                  Geliştirilecekler
                </h3>
              </div>
              <ul className="mt-3.5 flex list-none flex-col gap-[11px] p-0">
                {grade.improvements.map((s, i) => (
                  <li key={i} className="flex gap-2.5 font-read text-[.98rem] leading-[1.5] text-ink-soft">
                    <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-suggestion" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Text comparison */}
          <div className="ink-enter ink-enter-4 mt-5 grid gap-5 sm:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-line bg-surface-2" style={{ background: "var(--surface-2)" }}>
              <div className="border-b border-line bg-surface px-5 py-3" style={{ background: "var(--surface)" }}>
                <span className="eyebrow">Senin metnin</span>
              </div>
              <p className="m-0 whitespace-pre-wrap px-6 py-[22px] font-read text-[1.02rem] leading-[1.75] text-ink">
                {essay.plain_text}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-surface-2" style={{ background: "var(--surface-2)" }}>
              <div
                className="border-b border-line px-5 py-3"
                style={{ background: "color-mix(in srgb, var(--positive) 8%, transparent)" }}
              >
                <span className="eyebrow" style={{ color: "var(--positive)" }}>
                  Düzeltilmiş hâli
                </span>
              </div>
              <p className="m-0 whitespace-pre-wrap px-6 py-[22px] font-read text-[1.02rem] leading-[1.75] text-ink">
                {grade.corrected_text}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="ink-enter ink-enter-1 mt-7 flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-line-strong bg-surface px-8 py-14 text-center">
          <p className="font-read text-[1rem] text-muted">
            Bu essay henüz değerlendirilmedi.
          </p>
          <Link href={`/essays/${id}/edit`} className="btn btn-positive px-5 py-2.5">
            Yazmaya devam et & değerlendir
          </Link>
        </div>
      )}
    </main>
  );
}
