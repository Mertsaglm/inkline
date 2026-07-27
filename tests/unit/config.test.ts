import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiConfigured, supabaseConfigured } from "@/lib/config";

/**
 * Bu iki kapı, env yoksa uygulamanın çökmek yerine `SetupNotice` göstermesini
 * sağlıyor — build'in env olmadan geçmesi buna bağlı (bkz. AGENTS.md).
 * Değerler modül yüklenirken değil, *çağrı anında* okunmalı; aksi hâlde
 * Vercel'de env eklenip yeniden deploy edilmeden değişiklik görünmez.
 */
describe("supabaseConfigured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  it("her iki değişken de varsa true", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabaseConfigured()).toBe(true);
  });

  it("biri eksikse false", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    expect(supabaseConfigured()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabaseConfigured()).toBe(false);
  });

  it("ikisi de yoksa false", () => {
    expect(supabaseConfigured()).toBe(false);
  });

  it("her çağrıda env'i yeniden okur (modül yüklenirken sabitlenmez)", () => {
    expect(supabaseConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(supabaseConfigured()).toBe(true);
  });
});

describe("aiConfigured", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  });

  it("tek bir sağlayıcı anahtarı yeterlidir", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(aiConfigured()).toBe(true);
  });

  it("sadece Google anahtarı da yeterlidir", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    expect(aiConfigured()).toBe(true);
  });

  it("hiç anahtar yoksa false", () => {
    expect(aiConfigured()).toBe(false);
  });
});
