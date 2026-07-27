import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/topics/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { topicsSchema } from "@/lib/ai/schemas";
import { makeProfile } from "../helpers/fixtures";
import {
  emptyRequest,
  jsonRequest,
  malformedRequest,
  readJson,
  silenceConsole,
} from "../helpers/route";

vi.mock("@/lib/ai/provider", () => ({
  generateAiObject: vi.fn(),
  isAiConfigured: vi.fn(),
}));
vi.mock("@/lib/db/profile", () => ({ ensureProfile: vi.fn() }));

const generateAiObjectMock = vi.mocked(generateAiObject);
const isAiConfiguredMock = vi.mocked(isAiConfigured);
const ensureProfileMock = vi.mocked(ensureProfile);

const RESULT = {
  topics: [
    { title: "A", prompt: "pa", category: "ca" },
    { title: "B", prompt: "pb", category: "cb" },
    { title: "C", prompt: "pc", category: "cc" },
    { title: "D", prompt: "pd", category: "cd" },
  ],
};

function promptSent() {
  return generateAiObjectMock.mock.calls[0][0].prompt;
}

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ current_level: "B1", interests: null }),
  });
  generateAiObjectMock.mockReset();
  generateAiObjectMock.mockResolvedValue({
    object: RESULT,
    model: "gemini-3.5-flash",
    provider: "google",
  } as never);
});

describe("POST /api/ai/topics — kapılar", () => {
  it("AI yapılandırılmamışsa 503 ve hangi anahtarların gerektiğini söyler", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST(jsonRequest({}));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(503);
    expect(body.error).toContain("OPENAI_API_KEY");
    expect(body.error).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("oturum yoksa 401 döner", async () => {
    ensureProfileMock.mockResolvedValue(null);
    expect((await POST(jsonRequest({}))).status).toBe(401);
  });

  it("bozuk JSON ve boş gövdeyle de konu üretir", async () => {
    expect((await POST(malformedRequest())).status).toBe(200);
    expect((await POST(emptyRequest())).status).toBe(200);
  });
});

describe("POST /api/ai/topics — parametreler", () => {
  it("profil seviyesini kullanır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C2" }),
    });

    await POST(jsonRequest({}));

    expect(promptSent()).toContain("CEFR level is C2");
  });

  it("ilgi alanı gövdeden gelmezse profilden okunur", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ interests: "astronomy" }),
    });

    await POST(jsonRequest({}));

    expect(promptSent()).toContain("Their interests: astronomy.");
  });

  it("gövdedeki ilgi alanı profildekini ezer", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ interests: "astronomy" }),
    });

    await POST(jsonRequest({ interests: "cooking" }));

    const prompt = promptSent();
    expect(prompt).toContain("Their interests: cooking.");
    expect(prompt).not.toContain("astronomy");
  });

  it("ilgi alanı hiç yoksa satırı açmaz", async () => {
    await POST(jsonRequest({}));
    expect(promptSent()).not.toContain("Their interests:");
  });

  /** İstemci daha önce gösterilen başlıkları yollar; tekrar önlenir. */
  it("hariç tutulacak başlıkları prompt'a taşır", async () => {
    await POST(jsonRequest({ exclude: ["Old topic one", "Old topic two"] }));

    const prompt = promptSent();
    expect(prompt).toContain("· Old topic one");
    expect(prompt).toContain("· Old topic two");
  });

  it("exclude dizi değilse yok sayar (çökmez)", async () => {
    for (const exclude of ["metin", 42, { a: 1 }, null]) {
      generateAiObjectMock.mockClear();
      const response = await POST(jsonRequest({ exclude }));
      expect(response.status, JSON.stringify(exclude)).toBe(200);
      expect(promptSent()).not.toMatch(/Do NOT repeat/);
    }
  });

  /**
   * Konu önerisi tek yaratıcılık isteyen uç nokta — sıcaklık 1.1.
   * Kaldırılırsa öğrenci her yenilemede aynı 4 konuyu görür.
   */
  it("yaratıcılık için temperature 1.1 gönderir", async () => {
    await POST(jsonRequest({}));
    expect(generateAiObjectMock.mock.calls[0][0].temperature).toBe(1.1);
  });

  it("topicsSchema ile çağırır", async () => {
    await POST(jsonRequest({}));
    expect(generateAiObjectMock.mock.calls[0][0].schema).toBe(topicsSchema);
  });

  it("dil tercihini prompt'a taşır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C1", feedback_lang_override: "tr" }),
    });

    await POST(jsonRequest({}));

    expect(promptSent()).toContain("Write ALL explanations, messages and advice in TURKISH");
  });
});

describe("POST /api/ai/topics — cevap", () => {
  it("konuları ve modeli düz nesne olarak döner", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ...RESULT,
      model: "gemini-3.5-flash",
    });
  });

  it("AI patlarsa 500 ve Türkçe mesaj döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Konu önerileri üretilemedi.",
    );
  });
});
