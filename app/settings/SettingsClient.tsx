"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CEFR_LEVELS, CEFR_LABELS, type CefrLevel } from "@/lib/cefr";
import type { Profile } from "@/lib/db/types";

const LANG_OPTIONS: { value: Profile["feedback_lang_override"]; label: string }[] = [
  { value: "auto", label: "Seviyeye göre (önerilen)" },
  { value: "tr", label: "Türkçe" },
  { value: "mixed", label: "Karışık" },
  { value: "en", label: "İngilizce" },
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="font-sans text-[.82rem] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select {...props} className="field pr-9" />
      <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </span>
  );
}

export default function SettingsClient({ profile }: { profile: Profile }) {
  const [currentLevel, setCurrentLevel] = useState<CefrLevel>(profile.current_level);
  const [targetLevel, setTargetLevel] = useState<CefrLevel>(profile.target_level);
  const [lang, setLang] = useState<Profile["feedback_lang_override"]>(
    profile.feedback_lang_override,
  );
  const [warnings, setWarnings] = useState(profile.ai_warnings_enabled);
  const [interests, setInterests] = useState(profile.interests ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({
          current_level: currentLevel,
          target_level: targetLevel,
          feedback_lang_override: lang,
          ai_warnings_enabled: warnings,
          interests: interests.trim() || null,
        })
        .eq("user_id", user.id);
    }
    setSaving(false);
    setSaved(true);
  };

  return (
    <main className="mx-auto max-w-[760px] px-6 pt-10 pb-20">
      <div className="ink-enter">
        <span className="eyebrow">Tercihler</span>
        <h1
          className="mt-1.5 font-display text-[2.5rem] font-[400] leading-none tracking-[-0.02em] text-ink"
          style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1" }}
        >
          Ayarlar
        </h1>
      </div>

      <div className="ink-enter ink-enter-1 mt-6 flex flex-col gap-[22px] card-lg px-7 py-6">
        <div className="grid gap-[18px] sm:grid-cols-2">
          <Field label="Mevcut seviye">
            <Select
              value={currentLevel}
              onChange={(e) => setCurrentLevel(e.target.value as CefrLevel)}
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {CEFR_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hedef seviye">
            <Select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value as CefrLevel)}
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {CEFR_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Açıklama dili">
          <Select
            value={lang}
            onChange={(e) =>
              setLang(e.target.value as Profile["feedback_lang_override"])
            }
          >
            {LANG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="İlgi alanların">
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="örn: teknoloji, futbol, seyahat, müzik"
            className="field"
          />
        </Field>

        <div className="flex items-center justify-between gap-3.5 border-t border-line pt-[18px]">
          <div>
            <div className="font-sans text-[.92rem] font-medium text-ink">
              Canlı AI uyarıları (varsayılan)
            </div>
            <div className="mt-0.5 font-read text-[.88rem] text-muted">
              Yeni essaylerde yazarken hataları anında işaretle.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={warnings}
            onClick={() => setWarnings((v) => !v)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: warnings ? "var(--coral)" : "var(--line-strong)" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: warnings ? "22px" : "2px" }}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 border-t border-line pt-[18px]">
          <button onClick={save} disabled={saving} className="btn btn-ink px-[22px] py-[11px]">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {saved && (
            <span className="ink-fadein inline-flex items-center gap-1.5 font-sans text-[.88rem] text-positive">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Kaydedildi
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-5 px-1">
        <Link href="/onboarding" className="font-sans text-[.85rem] text-coral hover:text-coral">
          Seviyeni yeniden belirle
        </Link>
      </div>
    </main>
  );
}
