import Link from "next/link";
import type { ReactNode } from "react";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full font-mono text-[.8rem]"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        {n}
      </span>
      <div className="flex-1">{children}</div>
    </li>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-sm border border-line px-1.5 py-px font-mono text-[.85rem] text-coral"
      style={{ background: "var(--surface-2)" }}
    >
      {children}
    </code>
  );
}

function Pre({ children }: { children: ReactNode }) {
  return (
    <pre
      className="mt-2 overflow-x-auto rounded-md px-4 py-3.5 font-mono text-[.82rem] leading-[1.6]"
      style={{ background: "var(--ink)", color: "var(--paper)" }}
    >
      {children}
    </pre>
  );
}

export default function SetupNotice({ needAi = false }: { needAi?: boolean }) {
  let n = 0;
  return (
    <main className="mx-auto max-w-[720px] px-6 pt-11 pb-20">
      <div
        className="ink-enter rounded-lg px-8 py-7"
        style={{
          border: "1px solid color-mix(in srgb, var(--suggestion) 32%, transparent)",
          background: "color-mix(in srgb, var(--suggestion) 8%, transparent)",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex text-suggestion">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <h1
            className="font-display text-[1.7rem] font-[440] text-ink"
            style={{ fontVariationSettings: "'opsz' 72, 'WONK' 1" }}
          >
            Kurulum gerekli
          </h1>
        </div>
        <p className="mt-3.5 font-read text-[1.05rem] leading-[1.6] text-ink-soft">
          Uygulamanın çalışması için ortam değişkenlerini tanımlaman gerekiyor.
          Proje kökünde <Code>.env.local</Code> dosyası oluştur (
          <Code>.env.example</Code> dosyasını kopyalayabilirsin) ve aşağıdaki
          adımları izle.
        </p>

        <ol className="mt-5 flex list-none flex-col gap-4 p-0">
          {!needAi && (
            <>
              <Step n={++n}>
                <div className="font-sans text-[.95rem] font-medium text-ink">
                  <b>Supabase</b> projesi oluştur ve API bilgilerini gir
                </div>
                <Pre>{`NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...`}</Pre>
              </Step>
              <Step n={++n}>
                <div className="font-sans text-[.95rem] font-medium text-ink">
                  <b>Anonymous sign-ins</b> ayarını aç
                </div>
                <div className="mt-1 font-read text-[.9rem] leading-[1.55] text-muted">
                  Supabase panelinde Authentication → Sign In / Providers.
                </div>
              </Step>
              <Step n={++n}>
                <div className="font-sans text-[.95rem] font-medium text-ink">
                  Veritabanı şemasını çalıştır
                </div>
                <div className="mt-1 font-read text-[.9rem] leading-[1.55] text-muted">
                  <Code>supabase/migrations/0001_init.sql</Code> dosyasını SQL
                  Editor’de çalıştır.
                </div>
              </Step>
            </>
          )}
          <Step n={++n}>
            <div className="font-sans text-[.95rem] font-medium text-ink">
              <b>OpenAI</b> ya da <b>Gemini</b> API anahtarını ekle
            </div>
            <Pre>{`OPENAI_API_KEY=...
# ya da / yedek olarak:
GOOGLE_GENERATIVE_AI_API_KEY=...`}</Pre>
            <div className="mt-1 font-read text-[.9rem] leading-[1.55] text-muted">
              Biri yeterli. İkisi de varsa <b>OpenAI</b> kullanılır, hata
              durumunda Gemini’ye düşülür. Anahtarlar:
              platform.openai.com/api-keys · aistudio.google.com/apikey
            </div>
          </Step>
          <Step n={++n}>
            <div className="font-sans text-[.95rem] font-medium text-ink">
              Geliştirme sunucusunu yeniden başlat
            </div>
            <Pre>{`npm run dev`}</Pre>
          </Step>
        </ol>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/" className="btn btn-ink px-5 py-2.5 text-[.92rem]">
            Panele dön
          </Link>
          <Link href="/settings" className="btn btn-outline px-5 py-2.5 text-[.92rem]">
            Ayarlar
          </Link>
        </div>
      </div>
    </main>
  );
}
