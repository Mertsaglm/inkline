"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ModelNote from "@/components/ModelNote";

interface Topic {
  title: string;
  prompt: string;
  category: string;
}

const DISPLAY_H1 = { fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" } as const;
const DISPLAY_CARD = { fontVariationSettings: "'opsz' 48, 'WONK' 1" } as const;

function Skeleton() {
  return (
    <div className="card flex flex-col gap-3 p-[22px]">
      <div className="ink-skeleton h-5 w-2/5" />
      <div className="ink-skeleton h-[22px] w-3/4" />
      <div className="ink-skeleton h-3.5 w-[96%]" />
      <div className="ink-skeleton h-3.5 w-3/5" />
    </div>
  );
}

export default function WriteClient() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const seenTitles = useRef<string[]>([]);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclude: seenTitles.current.slice(-24) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Konular alınamadı.");
      const next: Topic[] = data.topics ?? [];
      setTopics(next);
      setModel(data.model ?? null);
      seenTitles.current = [...seenTitles.current, ...next.map((t) => t.title)];
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const start = async (title: string, prompt: string | null) => {
    setCreating(true);
    try {
      const res = await fetch("/api/essays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Essay oluşturulamadı.");
      router.push(`/essays/${data.id}/edit`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1120px] px-6 pt-10 pb-20">
      <div className="ink-enter flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Yeni essay</span>
          <h1
            className="mt-1.5 font-display text-[2.5rem] font-[400] leading-none tracking-[-0.02em] text-ink"
            style={DISPLAY_H1}
          >
            Ne yazalım?
          </h1>
        </div>
        <button
          onClick={loadTopics}
          disabled={loading}
          className="btn btn-outline px-[18px] py-2.5 text-[.92rem]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          Yeniden öner
        </button>
      </div>

      {loading && (
        <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} />
          ))}
        </div>
      )}

      {error && <p className="mt-6 text-sm text-critical">{error}</p>}

      {!loading && (
        <div className="ink-enter ink-enter-1 mt-6 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {topics.map((t, i) => (
            <button
              key={i}
              disabled={creating}
              onClick={() => start(t.title, t.prompt)}
              className="lift card-lg bg-surface-2 p-[22px] text-left disabled:opacity-60"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="chip chip-cat">{t.category}</span>
              <h3
                className="mt-3.5 mb-1.5 font-display text-[1.3rem] font-[440] leading-[1.15] text-ink"
                style={DISPLAY_CARD}
              >
                {t.title}
              </h3>
              <p className="font-read text-[.95rem] leading-[1.55] text-muted">
                {t.prompt}
              </p>
            </button>
          ))}
        </div>
      )}

      {!loading && topics.length > 0 && (
        <div className="mt-3.5">
          <ModelNote model={model} />
        </div>
      )}

      {/* Custom topic */}
      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-6">
        <label className="flex min-w-[240px] flex-1 flex-col gap-[7px]">
          <span className="font-sans text-[.82rem] font-medium text-ink-soft">
            Kendi konun
          </span>
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Kendi essay konunu yaz…"
            className="field"
          />
        </label>
        <button
          onClick={() =>
            start(customTitle.trim() || "Untitled", customTitle.trim() || null)
          }
          disabled={creating}
          className="btn btn-ink px-5 py-[11px]"
        >
          Boş sayfa aç
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </main>
  );
}
