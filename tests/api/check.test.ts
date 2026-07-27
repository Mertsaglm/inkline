import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ai/check/route";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { ensureProfile } from "@/lib/db/profile";
import { checkPrompt } from "@/lib/ai/prompts";
import { checkSchema, type CheckResult } from "@/lib/ai/schemas";
import { makeIssue, makeProfile } from "../helpers/fixtures";
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

/** 12 karakter eşiğini rahatça geçen bir metin. */
const TEXT = "Yesterday I go to the market with my mother.";

function aiReturns(issues: CheckResult["issues"], model = "gemini-3.5-flash") {
  generateAiObjectMock.mockResolvedValue({
    object: { issues },
    model,
    provider: "google",
  } as never);
}

interface IssueOut {
  span_text: string;
  kind: string;
  severity: string;
  message: string;
  replacement: string | null;
}

async function postIssues(
  issues: CheckResult["issues"],
  text = TEXT,
): Promise<IssueOut[]> {
  aiReturns(issues);
  const response = await POST(jsonRequest({ text }));
  const body = await readJson<{ issues: IssueOut[] }>(response);
  return body.issues;
}

beforeEach(() => {
  silenceConsole();
  isAiConfiguredMock.mockReturnValue(true);
  ensureProfileMock.mockResolvedValue({
    userId: "test-user",
    profile: makeProfile(),
  });
  generateAiObjectMock.mockReset();
});

describe("POST /api/ai/check — kapılar", () => {
  /**
   * Editör her tuş vuruşundan sonra (debounce'lu) buraya geliyor. AI
   * yapılandırılmamışsa 503 DÖNMEZ — sessizce boş liste döner, yoksa
   * yazarken sürekli hata görünür.
   */
  it("AI yapılandırılmamışsa 200 + boş liste döner (hata DEĞİL)", async () => {
    isAiConfiguredMock.mockReturnValue(false);

    const response = await POST(jsonRequest({ text: TEXT }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ issues: [] });
    expect(ensureProfileMock).not.toHaveBeenCalled();
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("oturum yoksa 401 döner", async () => {
    ensureProfileMock.mockResolvedValue(null);

    const response = await POST(jsonRequest({ text: TEXT }));

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ error: "Oturum yok." });
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  /** Kullanıcı uyarıları kapattıysa TEK BİR token bile harcanmamalı. */
  it("ai_warnings_enabled=false ise AI'a hiç gitmez", async () => {
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ ai_warnings_enabled: false }),
    });

    const response = await POST(jsonRequest({ text: TEXT }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ issues: [] });
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("12 karakterden kısa metinde AI'a gitmez", async () => {
    const response = await POST(jsonRequest({ text: "Hello world" })); // 11

    expect(await readJson(response)).toEqual({ issues: [] });
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("eşik trim'lenmiş uzunluğa göredir", async () => {
    const response = await POST(jsonRequest({ text: "   Hello wor   " })); // trim → 9
    expect(await readJson(response)).toEqual({ issues: [] });
    expect(generateAiObjectMock).not.toHaveBeenCalled();
  });

  it("tam 12 karakterde AI'a gider", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: "Hello world!" })); // 12
    expect(generateAiObjectMock).toHaveBeenCalledTimes(1);
  });

  it("boş metinde AI'a gitmez", async () => {
    for (const text of ["", "   ", "\n\n"]) {
      generateAiObjectMock.mockReset();
      const response = await POST(jsonRequest({ text }));
      expect(await readJson(response)).toEqual({ issues: [] });
      expect(generateAiObjectMock).not.toHaveBeenCalled();
    }
  });

  it("bozuk JSON gövdesinde çökmez", async () => {
    const response = await POST(malformedRequest());
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ issues: [] });
  });

  it("gövdesiz istekte çökmez", async () => {
    const response = await POST(emptyRequest());
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ issues: [] });
  });
});

describe("POST /api/ai/check — gövde alanları", () => {
  it("`text` alanını kullanır", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: TEXT }));
    expect(generateAiObjectMock.mock.calls[0][0].prompt).toContain(TEXT);
  });

  /** Eski istemci `paragraph` gönderiyordu; geriye dönük uyum korunmalı. */
  it("eski `paragraph` alanını da kabul eder", async () => {
    aiReturns([]);
    await POST(jsonRequest({ paragraph: TEXT }));
    expect(generateAiObjectMock.mock.calls[0][0].prompt).toContain(TEXT);
  });

  it("ikisi de varsa `text` kazanır", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: TEXT, paragraph: "eski alan metni burada" }));
    const prompt = generateAiObjectMock.mock.calls[0][0].prompt;
    expect(prompt).toContain(TEXT);
    expect(prompt).not.toContain("eski alan metni burada");
  });

  it("`text` null ise `paragraph`'a düşer", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: null, paragraph: TEXT }));
    expect(generateAiObjectMock.mock.calls[0][0].prompt).toContain(TEXT);
  });

  it("string olmayan değeri metne çevirir", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: 123456789012 }));
    expect(generateAiObjectMock.mock.calls[0][0].prompt).toContain("123456789012");
  });
});

describe("POST /api/ai/check — prompt ve şema", () => {
  it("checkSchema ve profil seviyesiyle çağırır", async () => {
    aiReturns([]);
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "C1" }),
    });

    await POST(jsonRequest({ text: TEXT }));

    const args = generateAiObjectMock.mock.calls[0][0];
    expect(args.schema).toBe(checkSchema);
    expect(args.prompt).toBe(checkPrompt(TEXT, "C1", "auto"));
  });

  it("profildeki dil tercihini prompt'a taşır", async () => {
    aiReturns([]);
    ensureProfileMock.mockResolvedValue({
      userId: "test-user",
      profile: makeProfile({ current_level: "A1", feedback_lang_override: "en" }),
    });

    await POST(jsonRequest({ text: TEXT }));

    expect(generateAiObjectMock.mock.calls[0][0].prompt).toBe(
      checkPrompt(TEXT, "A1", "en"),
    );
  });

  it("temperature göndermez (kontrol tutarlı olmalı)", async () => {
    aiReturns([]);
    await POST(jsonRequest({ text: TEXT }));
    expect(generateAiObjectMock.mock.calls[0][0].temperature).toBeUndefined();
  });

  it("cevabı veren modeli gövdede bildirir", async () => {
    aiReturns([], "gpt-5-mini");
    const response = await POST(jsonRequest({ text: TEXT }));
    expect(await readJson(response)).toEqual({ issues: [], model: "gpt-5-mini" });
  });
});

describe("POST /api/ai/check — span doğrulaması", () => {
  /**
   * span_text metinde birebir bulunmuyorsa işaretlemeyi konumlandırmak
   * imkânsız; editör yanlış kelimenin altını çizer. Bu yüzden route
   * modele güvenmiyor, kendisi doğruluyor.
   */
  it("metinde bulunmayan span'ler tamamen atılır", async () => {
    const issues = await postIssues([
      makeIssue({ span_text: "I go" }), // metinde var
      makeIssue({ span_text: "she goes" }), // metinde YOK
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].span_text).toBe("I go");
  });

  it("büyük/küçük harf farkı span'i geçersiz kılar (birebir eşleşme)", async () => {
    const issues = await postIssues([makeIssue({ span_text: "i go" })]);
    expect(issues).toHaveLength(0);
  });

  it("boş span_text atılır", async () => {
    const issues = await postIssues([makeIssue({ span_text: "" })]);
    expect(issues).toHaveLength(0);
  });

  it("geçerli span'lerin sırası korunur", async () => {
    const issues = await postIssues([
      makeIssue({ span_text: "Yesterday", kind: "style" }),
      makeIssue({ span_text: "I go", kind: "grammar" }),
      makeIssue({ span_text: "my mother", kind: "vocab" }),
    ]);

    expect(issues.map((i) => i.span_text)).toEqual([
      "Yesterday",
      "I go",
      "my mother",
    ]);
  });

  it("span, kelime ortasında da olsa metinde varsa kabul edilir", async () => {
    const issues = await postIssues([makeIssue({ span_text: "market with" })]);
    expect(issues).toHaveLength(1);
  });

  it("kind, severity ve message olduğu gibi geçer", async () => {
    const issues = await postIssues([
      makeIssue({
        span_text: "I go",
        kind: "structure",
        severity: "suggestion",
        message: "Cümleyi bölmeyi dene.",
        replacement: null,
      }),
    ]);

    expect(issues[0]).toMatchObject({
      kind: "structure",
      severity: "suggestion",
      message: "Cümleyi bölmeyi dene.",
    });
  });
});

/**
 * ====================================================================
 *  safeReplacement — bu bloğu kimse "sadeleştirmesin".
 *
 *  `replacement` öğrencinin essay'ine BİREBİR yazılıyor. Model kural gereği
 *  sadece düzeltmeyi yazmalı, ama zaman zaman açıklama/alternatif döküyor
 *  (ör. `"you are really enjoying" veya daha uygun: "you really enjoy"`).
 *  Bu metin essay'e girerse cümleyi bozar. Guard, şüpheli her replacement'ı
 *  null'a düşürerek öneriyi "sadece açıklama" hâline getiriyor —
 *  arayüzde "Uygula" düğmesi gösterilmez.
 * ====================================================================
 */
describe("POST /api/ai/check — safeReplacement guard", () => {
  /** span "I go" → 4 karakter → sınır 4*3+30 = 42 */
  const SPAN = "I go";

  async function replacementFor(replacement: string | null) {
    const issues = await postIssues([
      makeIssue({ span_text: SPAN, replacement }),
    ]);
    expect(issues).toHaveLength(1);
    return issues[0].replacement;
  }

  it("temiz bir düzeltmeyi olduğu gibi geçirir", async () => {
    expect(await replacementFor("I went")).toBe("I went");
  });

  it("baştaki/sondaki boşlukları kırpar", async () => {
    expect(await replacementFor("  I went  ")).toBe("I went");
  });

  it("null zaten null kalır", async () => {
    expect(await replacementFor(null)).toBeNull();
  });

  it("boş ve sadece boşluk olan düzeltmeyi null'a düşürür", async () => {
    expect(await replacementFor("")).toBeNull();
    expect(await replacementFor("   ")).toBeNull();
    expect(await replacementFor("\t")).toBeNull();
  });

  it("span ile aynı olan düzeltmeyi null'a düşürür (değişiklik yok)", async () => {
    expect(await replacementFor(SPAN)).toBeNull();
  });

  it("kırpıldıktan sonra span'e eşitse yine null olur", async () => {
    // Guard önce trim ediyor, sonra karşılaştırıyor.
    expect(await replacementFor(`  ${SPAN}  `)).toBeNull();
  });

  /** Çift tırnak = alıntı/alternatif → düzeltme değil, anlatım. */
  it("düz çift tırnak içeren düzeltmeyi null'a düşürür", async () => {
    expect(await replacementFor('"I went"')).toBeNull();
    expect(await replacementFor('I went "or" I go')).toBeNull();
  });

  it("kıvrık çift tırnakları da yakalar", async () => {
    expect(await replacementFor("“I went”")).toBeNull();
    expect(await replacementFor("I went “doğrusu”")).toBeNull();
  });

  it("gerçek dünyadaki bozuk çıktıyı yakalar", async () => {
    expect(
      await replacementFor('"you are really enjoying" veya: "you really enjoy"'),
    ).toBeNull();
  });

  /** Tek tırnak MEŞRU: don't, it's, I've … Buna dokunulmamalı. */
  it("kesme işaretli düzeltmeleri korur", async () => {
    expect(await replacementFor("I don't")).toBe("I don't");
    expect(await replacementFor("I’ve")).toBe("I’ve");
    expect(await replacementFor("it's fine")).toBe("it's fine");
  });

  it("satır sonu içeren düzeltmeyi null'a düşürür", async () => {
    expect(await replacementFor("I went\nto")).toBeNull();
    expect(await replacementFor("I went\r\nto")).toBeNull();
    expect(await replacementFor("I went\rto")).toBeNull();
  });

  it("span'e göre aşırı uzun düzeltmeyi null'a düşürür", async () => {
    // Sınır: span.length * 3 + 30 = 42
    expect((await replacementFor("x".repeat(42)))).toBe("x".repeat(42));
    expect(await replacementFor("x".repeat(43))).toBeNull();
    expect(await replacementFor("x".repeat(200))).toBeNull();
  });

  it("uzunluk sınırı span'e göre ölçeklenir", async () => {
    const longSpan = "with my mother"; // 14 → sınır 14*3+30 = 72
    const issues = await postIssues([
      makeIssue({ span_text: longSpan, replacement: "y".repeat(72) }),
      makeIssue({ span_text: longSpan, replacement: "z".repeat(73) }),
    ]);
    expect(issues[0].replacement).toBe("y".repeat(72));
    expect(issues[1].replacement).toBeNull();
  });

  it("uzunluk kırpma SONRASI ölçülür", async () => {
    // 42 karakter + boşluklar → kırpınca sınırda kalır.
    expect(await replacementFor(`   ${"x".repeat(42)}   `)).toBe("x".repeat(42));
  });

  /**
   * Guard yalnızca `replacement`'ı temizler; öneriyi silmez. Öğrenci
   * açıklamayı yine görür, sadece tek tıkla uygulayamaz.
   */
  it("düzeltme null'a düşse bile öneri (message) korunur", async () => {
    const issues = await postIssues([
      makeIssue({
        span_text: SPAN,
        replacement: '"I went" olmalı',
        message: "Geçmiş zaman kullan.",
      }),
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe("Geçmiş zaman kullan.");
    expect(issues[0].replacement).toBeNull();
  });

  it("her öneri kendi span'ine göre ayrı ayrı denetlenir", async () => {
    const issues = await postIssues([
      makeIssue({ span_text: "I go", replacement: "I went" }),
      makeIssue({ span_text: "my mother", replacement: '"my mum"' }),
      makeIssue({ span_text: "the market", replacement: "the bazaar" }),
    ]);

    expect(issues.map((i) => i.replacement)).toEqual([
      "I went",
      null,
      "the bazaar",
    ]);
  });
});

describe("POST /api/ai/check — hata yolları", () => {
  /** Editör bu uç noktadan asla hata görmemeli; yazma akışı kesilmesin. */
  it("AI patlarsa 200 + boş liste döner", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("429 quota exceeded"));

    const response = await POST(jsonRequest({ text: TEXT }));

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ issues: [] });
  });

  it("kota hatasında bile 429 DÖNMEZ (canlı kontrol sessizdir)", async () => {
    generateAiObjectMock.mockRejectedValue({ statusCode: 429 });
    const response = await POST(jsonRequest({ text: TEXT }));
    expect(response.status).toBe(200);
  });

  it("hatayı sunucu loguna yazar", async () => {
    generateAiObjectMock.mockRejectedValue(new Error("boom"));
    await POST(jsonRequest({ text: TEXT }));
    expect(console.error).toHaveBeenCalled();
  });
});
