"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
} from "recharts";
import { numberToCefr } from "@/lib/cefr";
import type { CoachResult } from "@/lib/ai/schemas";
import ModelNote from "@/components/ModelNote";

const KIND_LABELS: Record<string, string> = {
  grammar: "Gramer",
  vocab: "Kelime",
  structure: "Cümle",
  spelling: "Yazım",
  style: "Üslup",
};

interface Props {
  levelSeries: { date: string; value: number }[];
  kindCounts: { kind: string; count: number }[];
  scoreSeries: { date: string; score: number }[];
  hasData: boolean;
}

const tick = { fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--muted)" };
const DISPLAY_H1 = { fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" } as const;
const DISPLAY_CARD = { fontVariationSettings: "'opsz' 48, 'WONK' 1" } as const;

function ChartCard({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="card-lg px-6 py-[22px]">
      <span className="eyebrow">{title}</span>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-1.5 font-sans text-[.78rem] text-faint">{note}</p>}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-[210px] items-center justify-center">
      <p className="font-read text-[.9rem] text-faint">Grafik için birkaç essay daha yaz.</p>
    </div>
  );
}

function tooltipStyle() {
  return {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    boxShadow: "var(--shadow-float)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--ink)",
  } as const;
}

export default function ProgressClient({
  levelSeries,
  kindCounts,
  scoreSeries,
  hasData,
}: Props) {
  const router = useRouter();
  const [coach, setCoach] = useState<(CoachResult & { model?: string | null }) | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/coach", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Plan üretilemedi.");
      setCoach(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const startTopic = async (title: string, prompt: string) => {
    const res = await fetch("/api/essays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, prompt }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/essays/${data.id}/edit`);
  };

  const maxKind = Math.max(1, ...kindCounts.map((k) => k.count));

  return (
    <main className="mx-auto max-w-[1120px] px-6 pt-10 pb-20">
      <div className="ink-enter">
        <span className="eyebrow">Zamanla</span>
        <h1
          className="mt-1.5 font-display text-[2.5rem] font-[400] leading-none tracking-[-0.02em] text-ink"
          style={DISPLAY_H1}
        >
          Gelişimim
        </h1>
      </div>

      {/* Charts */}
      <div className="ink-enter ink-enter-1 mt-6 grid gap-[18px] lg:grid-cols-2">
        <ChartCard title="Seviye gelişimi" note="Zaman içindeki CEFR seviyen.">
          {levelSeries.length > 1 ? (
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={levelSeries} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                  <YAxis
                    domain={[1, 6]}
                    ticks={[1, 2, 3, 4, 5, 6]}
                    tickFormatter={(v) => numberToCefr(v)}
                    tick={tick}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(v) => numberToCefr(Number(v))}
                    contentStyle={tooltipStyle()}
                    labelStyle={{ color: "var(--muted)" }}
                    cursor={{ stroke: "var(--line-strong)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ink)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 2 }}
                    activeDot={{ r: 4.5, fill: "var(--coral)", stroke: "var(--surface)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>

        <ChartCard title="Not trendi (band)" note="IELTS benzeri band, 0–9.">
          {scoreSeries.length > 1 ? (
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreSeries} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                  <YAxis domain={[0, 9]} tick={tick} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle()}
                    labelStyle={{ color: "var(--muted)" }}
                    cursor={{ stroke: "var(--line-strong)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--coral)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "var(--surface)", stroke: "var(--coral)", strokeWidth: 2 }}
                    activeDot={{ r: 4.5, fill: "var(--coral)", stroke: "var(--surface)", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      {/* Error types */}
      <div className="ink-enter ink-enter-2 mt-[18px]">
        <ChartCard title="Hata türleri" note="Türlere göre işaretlenen hatalar.">
          {kindCounts.length > 0 ? (
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kindCounts} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="kind"
                    tickFormatter={(k) => KIND_LABELS[k] ?? k}
                    tick={tick}
                    tickLine={false}
                    axisLine={{ stroke: "var(--line)" }}
                  />
                  <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v) => [`${v}`, "adet"]}
                    labelFormatter={(k) => KIND_LABELS[k as string] ?? k}
                    contentStyle={tooltipStyle()}
                    labelStyle={{ color: "var(--muted)" }}
                    cursor={{ fill: "color-mix(in srgb, var(--ink) 5%, transparent)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {kindCounts.map((k, i) => (
                      <Cell
                        key={i}
                        fill={k.count === maxKind ? "var(--coral)" : "var(--ink)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[210px] items-center justify-center">
              <p className="font-read text-[.9rem] text-faint">Henüz veri yok.</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* AI Coach */}
      <div className="ink-enter ink-enter-3 mt-6 overflow-hidden card-lg">
        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex text-coral">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
              </svg>
            </span>
            <h3
              className="font-display text-[1.3rem] font-[460] text-ink"
              style={DISPLAY_CARD}
            >
              Kişisel gelişim planı
            </h3>
          </div>
          <button
            onClick={generate}
            disabled={loading || !hasData}
            className="btn btn-outline px-4 py-2.5 text-[.88rem]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            {loading ? "Üretiliyor…" : coach ? "Yenile" : "Plan üret"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 px-6 py-12">
            <span className="ink-pulse inline-flex text-coral">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                <path d="M16 8 2 22" />
              </svg>
            </span>
            <span className="font-sans text-[.95rem] text-muted">Planın hazırlanıyor…</span>
          </div>
        ) : !coach ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="max-w-[42ch] font-read text-[1rem] leading-[1.6] text-muted">
              {hasData
                ? "Son essaylerine bakarak sana özel bir gelişim planı hazırlayalım."
                : "Plan için önce en az bir essay yazıp değerlendir."}
            </p>
            {hasData && (
              <button onClick={generate} className="btn btn-ink px-5 py-2.5">
                Plan üret
              </button>
            )}
            {error && <p className="font-sans text-[.9rem] text-critical">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-[22px] px-6 py-[22px]">
            <p className="font-read text-[1.15rem] leading-[1.55] text-ink [text-wrap:pretty]">
              {coach.headline}
            </p>

            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {coach.focus_areas.map((f, i) => (
                <div
                  key={i}
                  className="rounded-md border border-line p-4"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="eyebrow eyebrow-coral">Odak {i + 1}</span>
                  <h4
                    className="mt-2 mb-1.5 font-display text-[1.1rem] font-[460] text-ink"
                    style={{ fontVariationSettings: "'opsz' 40, 'WONK' 1" }}
                  >
                    {f.title}
                  </h4>
                  <p className="font-read text-[.9rem] leading-[1.5] text-muted">{f.why}</p>
                  <p className="mt-2 font-read text-[.9rem] leading-[1.5] text-ink-soft">
                    <span className="font-semibold text-coral">Nasıl: </span>
                    {f.how}
                  </p>
                </div>
              ))}
            </div>

            {coach.recurring_mistakes.length > 0 && (
              <div>
                <span className="eyebrow">Tekrarlayan hatalar</span>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {coach.recurring_mistakes.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-line px-4 py-3"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <div className="font-sans text-[.85rem] font-semibold text-ink">
                        {m.pattern}
                      </div>
                      <div className="mt-1 font-read text-[.92rem] leading-[1.6]">
                        <span className="italic text-muted">{m.example}</span>
                        <span className="mx-1.5 text-muted">→</span>
                        <span className="text-positive">{m.fix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coach.recommended_topics.length > 0 && (
              <div>
                <span className="eyebrow">Önerilen konular</span>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {coach.recommended_topics.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => startTopic(t.title, t.prompt)}
                      className="rounded-full border border-transparent px-3.5 py-[7px] font-sans text-[.85rem] text-coral transition-colors hover:border-coral"
                      style={{ background: "var(--coral-soft)" }}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <span className="eyebrow">Bir üst seviye için ipuçları</span>
              <ul className="mt-2.5 flex list-none flex-col gap-2.5 p-0">
                {coach.next_level_tips.map((t, i) => (
                  <li key={i} className="flex gap-2.5 font-read text-[.96rem] leading-[1.5] text-ink-soft">
                    <span className="mt-[7px] h-[5px] w-[5px] flex-shrink-0 rounded-full bg-coral" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-line pt-3.5">
              <ModelNote model={coach.model} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
