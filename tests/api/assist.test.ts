import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/assist/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { assistPrompt } from "@/lib/ai/prompts";
import { assistSchema } from "@/lib/ai/schemas";
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
  suggestions: [
    {
      type: "grammar" as const,
      title: "Zaman uyumu",
      explanation: "Geçmiş olay anlatılıyor.",
      span_text: "I go",
      replacement: "I went",
    },
  ],
};

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ current_level: "B2" }),
  });
  generateAiObjectMock.mockReset();
  generateAiObjectMock.mockResolvedValue({
    object: RESULT,
    model: "gemini-3.5-flash",
    provider: "google",
  } as never);
});

describe("POST /api/ai/assist — kapılar", () => {
  it("AI yapılandırılmamışsa 503 döner", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ selection: "I go" }));

    expect(response.status).toBe(503);
    expect(ensureProfileMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa 401 döner", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ selection: "I go" }));

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Oturum yok." });
  });

  /** Bu uç nokta yalnızca kullanıcı metin seçtiğinde çağrılır. */
  it("seçim yoksa 400 ve yönlendirici Türkçe mesaj döner", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Önce yardım almak istediğin metni seç.",
    );
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("sadece boşluktan oluşan seçim de reddedilir", async () => {
    for (const selection of ["", "   ", "\n\t "]) {
      const response = await POST(jsonRequest({ selection }));
      expect(response.status, JSON.stringify(selection)).toBe(400);
    }
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("bozuk JSON ve boş gövdede 400 döner (çökmez)", async () => {
    expect((await POST(malformedRequest())).status).toBe(400);
    expect((await POST(emptyRequest())).status).toBe(400);
  });
});

describe("POST /api/ai/assist — AI çağrısı", () => {
  it("seçimi kırpar ve bağlamla birlikte iletir", async () => {
    await POST(
      jsonRequest({ selection: "  I go to school  ", context: "Full essay." }),
    );

    const args = generateAiObjectMock.mock.calls[0][0];
    expect(args.schema).toBe(assistSchema);
    expect(args.prompt).toBe(
      assistPrompt("I go to school", "Full essay.", "B2", "auto"),
    );
  });

  it("bağlam yoksa boş dize kullanır", async () => {
    await POST(jsonRequest({ selection: "I go" }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toBe(
      assistPrompt("I go", "", "B2", "auto"),
    );
  });

  it("profil seviyesi ve dil tercihi prompt'a girer", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "A1", feedback_lang_override: "tr" }),
    });

    await POST(jsonRequest({ selection: "I go", context: "ctx" }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toBe(
      assistPrompt("I go", "ctx", "A1", "tr"),
    );
  });

  it("temperature göndermez", async () => {
    await POST(jsonRequest({ selection: "I go" }));
    expect(generateAiObjectMock.mock.calls[0][0].temperature).toBeUndefined();
  });
});

describe("POST /api/ai/assist — cevap", () => {
  it("önerileri ve modeli düz nesne olarak döner", async () => {
    const response = await POST(jsonRequest({ selection: "I go" }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ...RESULT,
      model: "gemini-3.5-flash",
    });
  });

  it("AI patlarsa 500 ve Türkçe mesaj döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));

    const response = await POST(jsonRequest({ selection: "I go" }));

    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Yardım üretilemedi.",
    );
  });

  it("ham hata mesajı istemciye sızmaz", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("sk-secret-key rejected"));

    const response = await POST(jsonRequest({ selection: "I go" }));

    expect(JSON.stringify(await readJson(response))).not.toContain("sk-secret");
  });
});
