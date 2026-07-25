"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CEFR_LABELS, type CefrLevel } from "@/lib/cefr";
import ModelNote from "@/components/ModelNote";

const PROMPT =
  "Describe your typical day and what you enjoy doing in your free time. Write 4–6 sentences.";

export default function OnboardingClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    cefr: CefrLevel;
    rationale: string;
    model?: string | null;
  } | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-[720px] px-6 pt-11 pb-20">
      <div className="ink-enter text-center">
        <span className="eyebrow eyebrow-coral">Hoş geldin</span>
        <h1
          className="mt-2 font-display text-[2.6rem] font-[400] leading-[1.02] tracking-[-0.02em] text-ink"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" }}
        >
          Seviye tespiti
        </h1>
      </div>

      {result ? (
        <div className="ink-enter mt-7 card-lg px-8 py-9 text-center">
          <span className="eyebrow">Tahmini seviyen</span>
          <div
            className="mt-2 mb-0.5 font-display text-[6rem] font-[380] leading-none text-coral"
            style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" }}
          >
            {result.cefr}
          </div>
          <div
            className="mb-3.5 font-display text-[1.3rem] text-ink"
            style={{ fontVariationSettings: "'opsz' 40, 'WONK' 1" }}
          >
            {CEFR_LABELS[result.cefr]}
          </div>
          <p className="mx-auto max-w-[52ch] font-read text-[1.05rem] leading-[1.65] text-ink-soft [text-wrap:pretty]">
            {result.rationale}
          </p>
          <div className="mt-4">
            <ModelNote model={result.model} />
          </div>
          <button
            onClick={() => router.push("/write")}
            className="btn btn-ink mt-6 px-6 py-3 text-[.98rem]"
          >
            İlk essay’ime başla
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="ink-enter ink-enter-1 mt-7">
          <div
            className="rounded-md border border-line bg-surface px-5 py-[18px]"
            style={{ borderLeft: "3px solid var(--coral)" }}
          >
            <p className="font-read text-[1.08rem] leading-[1.6] text-ink">
              {PROMPT}
            </p>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Yazmaya buradan başla…"
            className="field mt-4 !p-5 font-read text-[1.1rem]"
          />
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[.75rem] text-faint">
              {text.trim().length < 20 ? "En az ~20 karakter yaz" : "En az 50 kelime önerilir"}
            </span>
            <button
              onClick={submit}
              disabled={loading || text.trim().length < 20}
              className="btn btn-ink px-6 py-3 text-[.98rem]"
            >
              {loading ? (
                <>
                  <span className="ink-pulse inline-flex">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                      <path d="M16 8 2 22" />
                    </svg>
                  </span>
                  Değerlendiriliyor…
                </>
              ) : (
                <>
                  Seviyemi belirle
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
          </div>
          {error && <p className="mt-3 font-sans text-[.9rem] text-critical">{error}</p>}
        </div>
      )}
    </main>
  );
}
