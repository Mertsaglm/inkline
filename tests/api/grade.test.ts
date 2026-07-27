import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/grade/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { gradePrompt } from "@/lib/ai/prompts";
import { gradeSchema, type GradeResult } from "@/lib/ai/schemas";
import { cefrToNumber, smoothLevel } from "@/lib/cefr";
import {
  makeEssay,
  makeGrade,
  makeGradeResult,
  makeProfile,
} from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import {
  jsonRequest,
  malformedRequest,
  readJson,
  silenceConsole,
} from "../helpers/route";

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

const LONG_ESSAY =
  "Last weekend I go to the cinema with my friends and we watched a very interesting film about space travel.";

let supabase: SupabaseMock;

function setupDb(overrides: Record<string, unknown> = {}) {
  supabase = createSupabaseMock({
    responses: {
      "essays.select": { data: makeEssay({ plain_text: LONG_ESSAY }) },
      "essay_grades.insert": { data: makeGrade() },
      ...overrides,
    },
  });
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

function aiReturns(object: GradeResult, model = "gemini-3.5-flash") {
  generateAiObjectMock.mockResolvedValue({
    object,
    model,
    provider: "google",
  } as never);
}

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ current_level: "B1" }),
  });
  generateAiObjectMock.mockReset();
  setupDb();
});

describe("POST /api/ai/grade — kapılar", () => {
  it("AI yapılandırılmamışsa 503 döner", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(503);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "AI anahtarı ayarlanmamış.",
    );
    expect(ensureProfileMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa 401 döner", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Oturum yok." });
  });

  it("essayId yoksa 400 döner ve DB'ye dokunmaz", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: "essayId gerekli." });
    expect(supabase.ops).toHaveLength(0);
  });

  it("bozuk JSON gövdesinde 400 döner (çökmez)", async () => {
    const response = await POST(malformedRequest());
    expect(response.status).toBe(400);
  });

  it("essay bulunamazsa 404 döner ve AI'a gitmez", async () => {
    setupDb({ "essays.select": { data: null } });

    const response = await POST(jsonRequest({ essayId: "yok" }));

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ error: "Essay bulunamadı." });
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  /** Kısa metni değerlendirmek anlamsız ve token israfı. */
  it("40 karakterden kısa essay 400 döner", async () => {
    setupDb({
      "essays.select": { data: makeEssay({ plain_text: "Too short." }) },
    });

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Değerlendirme için essay çok kısa.",
    );
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("uzunluk eşiği trim'lenmiş metne göredir", async () => {
    setupDb({
      "essays.select": {
        data: makeEssay({ plain_text: " ".repeat(100) + "kısa" }),
      },
    });

    const response = await POST(jsonRequest({ essayId: "essay-1" }));
    expect(response.status).toBe(400);
  });

  it("essay'i id ile ve tek satır olarak çeker", async () => {
    aiReturns(makeGradeResult());
    await POST(jsonRequest({ essayId: "essay-42" }));

    const op = supabase.opsFor("essays.select")[0];
    expect(op.filters).toContainEqual({ method: "eq", args: ["id", "essay-42"] });
    expect(op.terminal).toBe("maybeSingle");
  });
});

describe("POST /api/ai/grade — AI çağrısı", () => {
  it("gradeSchema ve essay metniyle çağırır", async () => {
    aiReturns(makeGradeResult());
    await POST(jsonRequest({ essayId: "essay-1" }));

    const args = generateAiObjectMock.mock.calls[0][0];
    expect(args.schema).toBe(gradeSchema);
    expect(args.prompt).toBe(
      gradePrompt(LONG_ESSAY, "Describe your weekend.", "B1", "auto"),
    );
  });

  it("essay'in konu yönergesini prompt'a taşır", async () => {
    setupDb({
      "essays.select": {
        data: makeEssay({ plain_text: LONG_ESSAY, prompt: "Write about food." }),
      },
    });
    aiReturns(makeGradeResult());

    await POST(jsonRequest({ essayId: "essay-1" }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toContain(
      "Write about food.",
    );
  });

  it("konu yönergesi yoksa da çalışır", async () => {
    setupDb({
      "essays.select": {
        data: makeEssay({ plain_text: LONG_ESSAY, prompt: null }),
      },
    });
    aiReturns(makeGradeResult());

    const response = await POST(jsonRequest({ essayId: "essay-1" }));
    expect(response.status).toBe(200);
    expect(generateAiObjectMock.mock.calls[0][0].prompt).not.toContain(
      "TOPIC PROMPT:",
    );
  });

  /**
   * Değerlendirme öğrencinin *kendi bildirdiği* seviyesine göre yapılıyor —
   * essay yazılırken kayıtlı seviye değil, profildeki güncel seviye.
   */
  it("prompt'ta profildeki güncel seviye kullanılır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C1", feedback_lang_override: "tr" }),
    });
    aiReturns(makeGradeResult());

    await POST(jsonRequest({ essayId: "essay-1" }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toBe(
      gradePrompt(LONG_ESSAY, "Describe your weekend.", "C1", "tr"),
    );
  });
});

describe("POST /api/ai/grade — kalıcı yazma", () => {
  beforeEach(() => {
    aiReturns(
      makeGradeResult({
        overall_score: 6.5,
        cefr_estimate: "B2",
        summary_feedback: "Güzel bir metin.",
        corrected_text: "Last weekend I went to the cinema.",
        strengths: ["Akıcı"],
        improvements: ["Zaman uyumu"],
      }),
      "gpt-5-mini",
    );
  });

  it("notu tüm alanlarıyla essay_grades'e yazar", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    const payload = supabase.oneOp("essay_grades.insert").payload as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      essay_id: "essay-1",
      user_id: "test-user",
      overall_score: 6.5,
      cefr_estimate: "B2",
      summary_feedback: "Güzel bir metin.",
      corrected_text: "Last weekend I went to the cinema.",
      strengths: ["Akıcı"],
      improvements: ["Zaman uyumu"],
    });
    expect(payload.rubric).toEqual(makeGradeResult().rubric);
  });

  /** 0002 migration'ı bu kolonu ekledi; essay detayında rozet olarak çiziliyor. */
  it("cevabı veren modeli ai_model kolonuna yazar", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    const payload = supabase.oneOp("essay_grades.insert").payload as Record<
      string,
      unknown
    >;
    expect(payload.ai_model).toBe("gpt-5-mini");
  });

  it("essay'i tamamlandı olarak işaretler", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    const op = supabase.oneOp("essays.update");
    const payload = op.payload as Record<string, unknown>;
    expect(payload.status).toBe("completed");
    expect(payload.level_at_writing).toBe("B1");
    expect(typeof payload.completed_at).toBe("string");
    expect(new Date(payload.completed_at as string).toISOString()).toBe(
      payload.completed_at,
    );
    expect(op.filters).toContainEqual({ method: "eq", args: ["id", "essay-1"] });
  });

  it("seviye geçmişine essay kaynaklı bir kayıt ekler", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    expect(supabase.oneOp("level_history.insert").payload).toEqual({
      user_id: "test-user",
      cefr: "B2",
      numeric_estimate: cefrToNumber("B2"),
      source: "essay",
      essay_id: "essay-1",
    });
  });

  /**
   * numeric_estimate, modelin serbest sayısı DEĞİL — band'in tam karşılığı.
   * gradeSchema'da sayısal tahmin alanı yok; buraya uydurma bir değer
   * konursa gelişim grafiği bozulur.
   */
  it("numeric_estimate, cefr_estimate'in tam sayısal karşılığıdır", async () => {
    for (const [level, expected] of [
      ["A1", 1],
      ["B2", 4],
      ["C2", 6],
    ] as const) {
      setupDb();
      aiReturns(makeGradeResult({ cefr_estimate: level }));
      await POST(jsonRequest({ essayId: "essay-1" }));

      const payload = supabase.oneOp("level_history.insert").payload as Record<
        string,
        unknown
      >;
      expect(payload.cefr).toBe(level);
      expect(payload.numeric_estimate).toBe(expected);
    }
  });

  /**
   * Profil seviyesi HAM tahminle değil, yumuşatılmış değerle güncellenir.
   * Yumuşatma kalkarsa tek kötü essay öğrenciyi A1'e düşürür.
   */
  it("profil seviyesini yumuşatılmış değerle günceller", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    const op = supabase.oneOp("profiles.update");
    // B1 + B2 tahmini → yumuşatılmış hâli hâlâ B1
    expect(op.payload).toEqual({ current_level: smoothLevel("B1", "B2") });
    expect(op.payload).toEqual({ current_level: "B1" });
    expect(op.filters).toContainEqual({
      method: "eq",
      args: ["user_id", "test-user"],
    });
  });

  it("tek bir mükemmel essay seviyeyi C2'ye fırlatmaz", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "A1" }),
    });
    setupDb();
    aiReturns(makeGradeResult({ cefr_estimate: "C2" }));

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect((supabase.oneOp("profiles.update").payload as { current_level: string }).current_level).toBe("B1");
    expect((await readJson<{ new_level: string }>(response)).new_level).toBe("B1");
  });

  it("dört yazma işlemini de yapar", async () => {
    await POST(jsonRequest({ essayId: "essay-1" }));

    expect(supabase.opsFor("essay_grades.insert")).toHaveLength(1);
    expect(supabase.opsFor("essays.update")).toHaveLength(1);
    expect(supabase.opsFor("level_history.insert")).toHaveLength(1);
    expect(supabase.opsFor("profiles.update")).toHaveLength(1);
  });
});

describe("POST /api/ai/grade — cevap gövdesi", () => {
  it("kaydedilen notu, yeni seviyeyi ve modeli döner", async () => {
    const gradeRow = makeGrade({ id: "grade-9" });
    setupDb({ "essay_grades.insert": { data: gradeRow } });
    aiReturns(makeGradeResult({ cefr_estimate: "B2" }), "gemini-3.5-flash");

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      grade: gradeRow,
      new_level: "B1",
      model: "gemini-3.5-flash",
    });
  });
});

describe("POST /api/ai/grade — hata yolları", () => {
  it("kota hatasında 429 ve Türkçe kota mesajı döner", async () => {
    generateAiObjectMock.mockRejectedValue(
      new Error("You exceeded your current quota"),
    );

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(429);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "AI kotası doldu. Birkaç dakika sonra tekrar dene.",
    );
  });

  it("HTTP 429 statusCode'unu da kota sayar", async () => {
    generateAiObjectMock.mockRejectedValue({ statusCode: 429 });
    const response = await POST(jsonRequest({ essayId: "essay-1" }));
    expect(response.status).toBe(429);
  });

  it("kota dışı hatalarda 500 ve genel mesaj döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("schema mismatch"));

    const response = await POST(jsonRequest({ essayId: "essay-1" }));

    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Değerlendirme yapılamadı.",
    );
  });

  /** Not üretilemediyse essay taslak kalmalı — "tamamlandı" görünmesin. */
  it("AI patlarsa hiçbir şey yazılmaz", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));

    await POST(jsonRequest({ essayId: "essay-1" }));

    expect(supabase.opsFor("essay_grades.insert")).toHaveLength(0);
    expect(supabase.opsFor("essays.update")).toHaveLength(0);
    expect(supabase.opsFor("level_history.insert")).toHaveLength(0);
    expect(supabase.opsFor("profiles.update")).toHaveLength(0);
  });

  it("ham hata mesajı istemciye sızmaz", async () => {
    generateAiObjectMock.mockRejectedValue(
      new Error("OPENAI_API_KEY sk-secret geçersiz"),
    );

    const response = await POST(jsonRequest({ essayId: "essay-1" }));
    const body = JSON.stringify(await readJson(response));

    expect(body).not.toContain("sk-secret");
    expect(body).not.toContain("OPENAI_API_KEY");
  });
});
