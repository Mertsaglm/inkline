import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/diagnostic/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { diagnosticPrompt } from "@/lib/ai/prompts";
import { diagnosticSchema } from "@/lib/ai/schemas";
import { makeProfile } from "../helpers/fixtures";
import { createSupabaseMock, type SupabaseMock } from "../helpers/supabase-mock";
import {
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
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const generateAiObjectMock = vi.mocked(generateAiObject);
const isAiConfiguredMock = vi.mocked(isAiConfigured);
const ensureProfileMock = vi.mocked(ensureProfile);
const createClientMock = vi.mocked(createClient);

const SAMPLE =
  "I am work in a bank and every day I take the bus to the office in the morning.";

const RESULT = {
  cefr: "B1" as const,
  numeric_estimate: 3.2,
  rationale: "Temel yapılar doğru, zaman hataları var.",
};

let supabase: SupabaseMock;

function setupDb() {
  supabase = createSupabaseMock();
  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile({ onboarded: false }),
  });
  generateAiObjectMock.mockReset();
  generateAiObjectMock.mockResolvedValue({
    object: RESULT,
    model: "gemini-3.5-flash",
    provider: "google",
  } as never);
  setupDb();
});

describe("POST /api/ai/diagnostic — kapılar", () => {
  it("AI yapılandırılmamışsa 503 döner", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ sample: SAMPLE }));

    expect(response.status).toBe(503);
    expect(ensureProfileMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa 401 döner", async () => {
    ensureProfileMock.mockResolvedValue(null);
    expect((await POST(jsonRequest({ sample: SAMPLE }))).status).toBe(401);
  });

  /**
   * Onboarding ekranındaki 20 karakter eşiğiyle aynı olmalı; aksi hâlde
   * düğme etkinleşir ama sunucu reddeder.
   */
  it("20 karakterden kısa örnekte 400 döner", async () => {
    const response = await POST(jsonRequest({ sample: "Hello, I am Mert." })); // 17

    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Değerlendirme için biraz daha uzun bir metin yaz.",
    );
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("tam 20 karakterde kabul eder", async () => {
    const response = await POST(jsonRequest({ sample: "a".repeat(20) }));
    expect(response.status).toBe(200);
  });

  it("eşik kırpılmış uzunluğa göredir", async () => {
    const response = await POST(
      jsonRequest({ sample: "   " + "a".repeat(19) + "   " }),
    );
    expect(response.status).toBe(400);
  });

  it("bozuk JSON gövdesinde 400 döner", async () => {
    expect((await POST(malformedRequest())).status).toBe(400);
  });
});

describe("POST /api/ai/diagnostic — AI çağrısı", () => {
  it("diagnosticSchema ve kırpılmış örnekle çağırır", async () => {
    await POST(jsonRequest({ sample: `  ${SAMPLE}  ` }));

    const args = generateAiObjectMock.mock.calls[0][0];
    expect(args.schema).toBe(diagnosticSchema);
    expect(args.prompt).toBe(diagnosticPrompt(SAMPLE, "auto"));
  });

  /** Seviye henüz bilinmiyor — prompt seviyeye göre değil, override'a bakar. */
  it("profilin seviyesini prompt'a taşımaz, sadece dil tercihini taşır", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C2", feedback_lang_override: "tr" }),
    });

    await POST(jsonRequest({ sample: SAMPLE }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toBe(
      diagnosticPrompt(SAMPLE, "tr"),
    );
  });
});

describe("POST /api/ai/diagnostic — kalıcı yazma", () => {
  it("seviye geçmişine diagnostic kaynaklı kayıt ekler", async () => {
    await POST(jsonRequest({ sample: SAMPLE }));

    expect(supabase.oneOp("level_history.insert").payload).toEqual({
      user_id: "test-user",
      cefr: "B1",
      numeric_estimate: 3.2,
      source: "diagnostic",
    });
  });

  /**
   * Diagnostik, essay notlamasının aksine seviyeyi YUMUŞATMADAN yazar —
   * ilk ölçüm olduğu için karışacak bir geçmiş yok.
   */
  it("profil seviyesini doğrudan (yumuşatmadan) tahmine ayarlar", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "A2", onboarded: false }),
    });
    generateAiObjectMock.mockResolvedValue({
      object: { ...RESULT, cefr: "C1", numeric_estimate: 5 },
      model: "gemini-3.5-flash",
      provider: "google",
    } as never);

    await POST(jsonRequest({ sample: SAMPLE }));

    const op = supabase.oneOp("profiles.update");
    expect(op.payload).toEqual({ current_level: "C1", onboarded: true });
  });

  /** Onboarding bir daha gösterilmesin diye bayrak aynı yazmada set edilir. */
  it("onboarded bayrağını true yapar", async () => {
    await POST(jsonRequest({ sample: SAMPLE }));

    const payload = supabase.oneOp("profiles.update").payload as Record<
      string,
      unknown
    >;
    expect(payload.onboarded).toBe(true);
  });

  it("profili kullanıcıya göre filtreleyerek günceller", async () => {
    await POST(jsonRequest({ sample: SAMPLE }));

    expect(supabase.oneOp("profiles.update").filters).toContainEqual({
      method: "eq",
      args: ["user_id", "test-user"],
    });
  });

  it("AI patlarsa hiçbir şey yazılmaz", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));

    await POST(jsonRequest({ sample: SAMPLE }));

    expect(supabase.ops).toHaveLength(0);
  });
});

describe("POST /api/ai/diagnostic — cevap", () => {
  it("tahmini ve modeli döner", async () => {
    const response = await POST(jsonRequest({ sample: SAMPLE }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ...RESULT,
      model: "gemini-3.5-flash",
    });
  });

  it("AI patlarsa 500 ve Türkçe mesaj döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));

    const response = await POST(jsonRequest({ sample: SAMPLE }));

    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe(
      "Seviye değerlendirmesi yapılamadı.",
    );
  });
});
