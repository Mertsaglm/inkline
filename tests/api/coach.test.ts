import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/coach/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { coachSchema } from "@/lib/ai/schemas";
import { makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import { readJson, silenceConsole } from "../helpers/route";

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return { ...actual, generateAiObject: vi.fn(), isAiConfigured: vi.fn() };
});
vi.mock("@/lib/db/profile", () => ({ ensureProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const generateAiObjectMock = vi.mocked(generateAiObject);
const isAiConfiguredMock = vi.mocked(isAiConfigured);
const ensureProfileMock = vi.mocked(ensureProfile);
const createClientMock = vi.mocked(createClient);

const COACH_RESULT = {
  headline: "Güzel gidiyorsun!",
  focus_areas: [
    { title: "Geçmiş zaman", why: "Sık hata", how: "10 cümle yaz" },
    { title: "Bağlaçlar", why: "Akış zayıf", how: "however kullan" },
  ],
  recurring_mistakes: [{ pattern: "go/went", example: "I go", fix: "I went" }],
  recommended_topics: [
    { title: "A trip", prompt: "Describe a trip." },
    { title: "A book", prompt: "Describe a book." },
  ],
  next_level_tips: ["Daha uzun yaz", "Kelime defteri tut"],
};

let supabase: SupabaseMock;

function setupDb(responses: Record<string, unknown> = {}) {
  supabase = createSupabaseMock({
    responses: {
      "feedback_events.select": { data: [] },
      "essay_grades.select": { data: [] },
      "level_history.select": { data: [] },
      ...responses,
    },
  });
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

/** AI'a gönderilen prompt (istatistik bloğunu içerir). */
function promptSent() {
  return generateAiObjectMock.mock.calls[0][0].prompt;
}

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ current_level: "B1", target_level: "C1" }),
  });
  generateAiObjectMock.mockReset();
  generateAiObjectMock.mockResolvedValue({
    object: COACH_RESULT,
    model: "gemini-3.5-flash",
    provider: "google",
  } as never);
  setupDb();
});

describe("POST /api/ai/coach — kapılar", () => {
  it("AI yapılandırılmamışsa 503 döner", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST();

    expect(response.status).toBe(503);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "AI anahtarı ayarlanmamış.",
    );
    expect(ensureProfileMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa 401 döner ve DB'ye gitmez", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(supabase.ops).toHaveLength(0);
  });

  /** Bu route gövde okumaz — istemci `fetch(url, { method: "POST" })` çağırıyor. */
  it("istek gövdesi olmadan çalışır", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
  });
});

describe("POST /api/ai/coach — veri toplama", () => {
  it("geri bildirimleri en yeniden başlayarak 120 kayıtla sınırlar", async () => {
    await POST();

    const op = supabase.oneOp("feedback_events.select");
    expect(op.columns).toBe("kind, message, span_text");
    expect(op.filters).toContainEqual({
      method: "eq",
      args: ["user_id", "test-user"],
    });
    expect(op.filters).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(op.filters).toContainEqual({ method: "limit", args: [120] });
  });

  it("son 10 notu çeker", async () => {
    await POST();

    const op = supabase.oneOp("essay_grades.select");
    expect(op.filters).toContainEqual({ method: "limit", args: [10] });
    expect(op.filters).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  /** Gelişim çizgisi kronolojik olmalı — ARTAN sıralama. */
  it("seviye geçmişini kronolojik (artan) çeker", async () => {
    await POST();

    const op = supabase.oneOp("level_history.select");
    expect(op.filters).toContainEqual({
      method: "order",
      args: ["assessed_at", { ascending: true }],
    });
  });

  it("üç sorgu da kullanıcıya göre filtrelenir", async () => {
    await POST();

    for (const key of [
      "feedback_events.select",
      "essay_grades.select",
      "level_history.select",
    ]) {
      expect(
        supabase.oneOp(key).filters,
        `${key} user_id ile filtrelenmiyor`,
      ).toContainEqual({ method: "eq", args: ["user_id", "test-user"] });
    }
  });
});

describe("POST /api/ai/coach — istatistik bloğu", () => {
  it("mevcut ve hedef seviyeyi yazar", async () => {
    await POST();
    expect(promptSent()).toContain("Current level: B1 · Target: C1");
  });

  it("veri yokken bile geçerli bir blok üretir", async () => {
    await POST();

    const prompt = promptSent();
    expect(prompt).toContain("Essays graded: 0");
    expect(prompt).toContain("No grades yet.");
    expect(prompt).toContain("Mistake counts by type: {}");
  });

  it("hata türlerini sayar", async () => {
    setupDb({
      "feedback_events.select": {
        data: [
          { kind: "grammar", message: "m1", span_text: "a" },
          { kind: "grammar", message: "m2", span_text: "b" },
          { kind: "vocab", message: "m3", span_text: "c" },
        ],
      },
    });

    await POST();

    expect(promptSent()).toContain(
      'Mistake counts by type: {"grammar":2,"vocab":1}',
    );
  });

  it("not bandlarını en yeniden eskiye listeler", async () => {
    setupDb({
      "essay_grades.select": {
        data: [
          { overall_score: 6.5, rubric: {}, created_at: "c", summary_feedback: "" },
          { overall_score: 5, rubric: {}, created_at: "b", summary_feedback: "" },
        ],
      },
    });

    await POST();

    const prompt = promptSent();
    expect(prompt).toContain("Essays graded: 2");
    expect(prompt).toContain("Recent overall bands: 6.5, 5");
    expect(prompt).not.toContain("No grades yet.");
  });

  it("seviye yörüngesini ok işaretiyle birleştirir", async () => {
    setupDb({
      "level_history.select": {
        data: [
          { cefr: "A2", numeric_estimate: 2, assessed_at: "1" },
          { cefr: "B1", numeric_estimate: 3, assessed_at: "2" },
          { cefr: "B2", numeric_estimate: 4, assessed_at: "3" },
        ],
      },
    });

    await POST();

    expect(promptSent()).toContain("Level trajectory: A2 → B1 → B2");
  });

  it("hata örneklerini `- [tür] \"span\" → mesaj` biçiminde verir", async () => {
    setupDb({
      "feedback_events.select": {
        data: [
          {
            kind: "grammar",
            message: "Geçmiş zaman kullan.",
            span_text: "I go",
          },
        ],
      },
    });

    await POST();

    expect(promptSent()).toContain('- [grammar] "I go" → Geçmiş zaman kullan.');
  });

  /** Prompt'un sınırsız büyümesini engelleyen kap. */
  it("en fazla 15 hata örneği ekler", async () => {
    setupDb({
      "feedback_events.select": {
        data: Array.from({ length: 40 }, (_, i) => ({
          kind: "grammar",
          message: `mesaj-${i}`,
          span_text: `span-${i}`,
        })),
      },
    });

    await POST();

    const prompt = promptSent();
    expect(prompt).toContain('"span-14"');
    expect(prompt).not.toContain('"span-15"');
    expect(prompt.match(/- \[grammar\]/g) ?? []).toHaveLength(15);
    // Sayım kapsanmıyor: 40 kaydın hepsi sayılır, sadece örnekler kısıtlı.
    expect(prompt).toContain('Mistake counts by type: {"grammar":40}');
  });

  it("span_text'i olmayan kayıtlar örnek olarak eklenmez ama sayılır", async () => {
    setupDb({
      "feedback_events.select": {
        data: [
          { kind: "style", message: "m", span_text: null },
          { kind: "style", message: "m", span_text: "" },
        ],
      },
    });

    await POST();

    const prompt = promptSent();
    expect(prompt).toContain('Mistake counts by type: {"style":2}');
    expect(prompt).not.toContain("Recent mistake examples");
  });

  it("boş bölümler prompt'a boş satır olarak sızmaz", async () => {
    await POST();
    expect(promptSent()).not.toMatch(/\n\n\n/);
  });

  it("coachSchema ile çağırır", async () => {
    await POST();
    expect(generateAiObjectMock.mock.calls[0][0].schema).toBe(coachSchema);
  });

  it("dil tercihini prompt'a taşır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({
        current_level: "A1",
        target_level: "A2",
        feedback_lang_override: "en",
      }),
    });

    await POST();

    expect(promptSent()).toContain("Write ALL explanations in clear, simple ENGLISH");
  });
});

describe("POST /api/ai/coach — cevap", () => {
  it("planı ve modeli düz bir nesne olarak döner", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ...COACH_RESULT,
      model: "gemini-3.5-flash",
    });
  });

  it("kota hatasında 429 döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("RESOURCE_EXHAUSTED"));

    const response = await POST();

    expect(response.status).toBe(429);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "AI kotası doldu. Birkaç dakika sonra tekrar dene.",
    );
  });

  it("diğer hatalarda 500 döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("bilinmeyen"));

    const response = await POST();

    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Gelişim planı üretilemedi.",
    );
  });
});
