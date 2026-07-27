import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import {
  AiNotConfiguredError,
  activeAiChain,
  generateAiObject,
  isAiConfigured,
  isQuotaError,
  modelChain,
  providerConfigured,
  providerOf,
} from "@/lib/ai/provider";
import { silenceConsole } from "../helpers/route";

/**
 * `lib/ai/provider.ts` bu uygulamanın tek AI giriş noktası. Buradaki
 * davranışlar sessizce bozulabilir ve ancak üretimde (kota dolduğunda,
 * bir model kaldırıldığında) ortaya çıkar. O yüzden çok ayrıntılı pinliyoruz:
 *
 *  - zincirin *sırası* ve anahtarsız sağlayıcının elenmesi
 *  - bir model patlarsa sıradakine geçilmesi ve cevabı verenin bildirilmesi
 *  - akıl yürütme modellerine `temperature` GÖNDERİLMEMESİ (400 döner)
 *  - gemini-2.5'e `thinkingLevel` GÖNDERİLMEMESİ (400 döner)
 *  - yedeği olan denemede tekrar yapılmaması (`maxRetries: 0`)
 */

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn((id: string) => ({ __sdk: "openai", modelId: id })),
}));
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn((id: string) => ({ __sdk: "google", modelId: id })),
}));

const generateObjectMock = vi.mocked(generateObject);
const schema = z.object({ ok: z.boolean() });

/** Zincirin varsayılan sırası — provider.ts'teki JSDoc ile aynı olmalı. */
const DEFAULT_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite-preview",
  "gpt-5-mini",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

function bothKeys() {
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
}

/** `generateObject`'e verilen n. çağrının argümanları. */
function callArgs(index: number) {
  return generateObjectMock.mock.calls[index]?.[0] as unknown as Record<
    string,
    unknown
  >;
}

beforeEach(() => {
  // Yedeklemeye düşerken bilinçli olarak console.warn yazılıyor (Vercel
  // loglarında görünmesi gerekiyor); test çıktısını kirletmesin.
  silenceConsole();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
  vi.stubEnv("AI_MODEL_CHAIN", "");
  vi.stubEnv("OPENAI_REASONING_EFFORT", "");
  vi.stubEnv("GEMINI_THINKING_LEVEL", "");
  generateObjectMock.mockReset();
  vi.mocked(openai).mockImplementation(
    (id: string) => ({ __sdk: "openai", modelId: id }) as never,
  );
  vi.mocked(google).mockImplementation(
    (id: string) => ({ __sdk: "google", modelId: id }) as never,
  );
});

describe("providerOf", () => {
  it("gemini* ve gemma* Google'a gider", () => {
    for (const id of [
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "Gemini-3-Pro",
      "gemma-3-27b",
      "GEMMA-2",
    ]) {
      expect(providerOf(id), id).toBe("google");
    }
  });

  it("diğer her şey OpenAI kabul edilir", () => {
    for (const id of ["gpt-5-mini", "gpt-4o", "o3-mini", "o1", "anything"]) {
      expect(providerOf(id), id).toBe("openai");
    }
  });
});

describe("providerConfigured", () => {
  it("ilgili anahtar env'de varsa true", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(providerConfigured("openai")).toBe(true);
    expect(providerConfigured("google")).toBe(false);

    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    expect(providerConfigured("google")).toBe(true);
  });

  it("sadece boşluktan oluşan anahtarı yok sayar", () => {
    vi.stubEnv("OPENAI_API_KEY", "   ");
    expect(providerConfigured("openai")).toBe(false);
  });
});

describe("modelChain", () => {
  it("iki anahtar varken varsayılan zinciri, tam bu sırayla döner", () => {
    bothKeys();
    expect(modelChain()).toEqual(DEFAULT_CHAIN);
  });

  it("sadece Google anahtarı varsa OpenAI modelleri düşer", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    expect(modelChain()).toEqual(DEFAULT_CHAIN.filter((m) => m.startsWith("gemini")));
    expect(modelChain()).not.toContain("gpt-5-mini");
  });

  it("sadece OpenAI anahtarı varsa yalnızca OpenAI modeli kalır", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(modelChain()).toEqual(["gpt-5-mini"]);
  });

  it("hiç anahtar yoksa zincir boştur", () => {
    expect(modelChain()).toEqual([]);
    expect(isAiConfigured()).toBe(false);
  });

  it("AI_MODEL_CHAIN varsayılanı tamamen değiştirir", () => {
    bothKeys();
    vi.stubEnv("AI_MODEL_CHAIN", "gpt-4o,gemini-2.5-flash");
    expect(modelChain()).toEqual(["gpt-4o", "gemini-2.5-flash"]);
  });

  it("AI_MODEL_CHAIN'de boşlukları kırpar, boş girdileri atar", () => {
    bothKeys();
    vi.stubEnv("AI_MODEL_CHAIN", " gpt-4o , , gemini-2.5-flash ,");
    expect(modelChain()).toEqual(["gpt-4o", "gemini-2.5-flash"]);
  });

  it("AI_MODEL_CHAIN'de de anahtarsız sağlayıcı elenir", () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gpt-4o,gemini-2.5-flash");
    expect(modelChain()).toEqual(["gemini-2.5-flash"]);
  });

  it("boş AI_MODEL_CHAIN varsayılana döner", () => {
    bothKeys();
    vi.stubEnv("AI_MODEL_CHAIN", "   ");
    expect(modelChain()).toEqual(DEFAULT_CHAIN);
  });

  it("isAiConfigured, zincirde en az bir model olmasıdır", () => {
    expect(isAiConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    expect(isAiConfigured()).toBe(true);
  });
});

describe("activeAiChain", () => {
  it("her model için sağlayıcısını da bildirir", () => {
    bothKeys();
    expect(activeAiChain()).toEqual([
      { id: "gemini-3.5-flash", provider: "google" },
      { id: "gemini-3.1-flash-lite-preview", provider: "google" },
      { id: "gpt-5-mini", provider: "openai" },
      { id: "gemini-3-flash-preview", provider: "google" },
      { id: "gemini-2.5-flash", provider: "google" },
    ]);
  });
});

describe("isQuotaError", () => {
  it("HTTP 429 statusCode'unu kota sayar", () => {
    expect(isQuotaError({ statusCode: 429 })).toBe(true);
  });

  it("bilinen kota mesajlarını tanır", () => {
    // Desen: /quota|RESOURCE_EXHAUSTED|429|rate ?limit|insufficient_quota/i
    const messages = [
      "You exceeded your current quota",
      "RESOURCE_EXHAUSTED",
      "Error 429: too many requests",
      "rate limit reached",
      "ratelimit reached",
      "insufficient_quota",
      "Quota exceeded for quota metric", // büyük/küçük harf duyarsız
    ];
    for (const message of messages) {
      expect(isQuotaError(new Error(message)), message).toBe(true);
    }
  });

  it("ilgisiz hataları kota saymaz", () => {
    for (const error of [
      new Error("model not found"),
      new Error("invalid api key"),
      new Error("schema validation failed"),
      { statusCode: 500 },
      { statusCode: 400 },
      null,
      undefined,
    ]) {
      expect(isQuotaError(error), String(error)).toBe(false);
    }
  });

  it("Error olmayan değerlerde patlamaz", () => {
    expect(() => isQuotaError("quota exceeded")).not.toThrow();
    expect(isQuotaError("quota exceeded")).toBe(true);
    expect(isQuotaError(429)).toBe(true); // "429" metni
  });
});

describe("generateAiObject — yapılandırma", () => {
  it("anahtar yoksa AiNotConfiguredError atar ve AI'a hiç gitmez", async () => {
    await expect(
      generateAiObject({ schema, prompt: "p" }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("AiNotConfiguredError mesajı iki anahtarın adını da içerir", async () => {
    let error: Error | undefined;
    try {
      await generateAiObject({ schema, prompt: "p" });
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(AiNotConfiguredError);
    expect(error!.message).toContain("OPENAI_API_KEY");
    expect(error!.message).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });
});

describe("generateAiObject — zincir ve yedekleme", () => {
  it("ilk model cevap verirse tek çağrı yapılır ve model adı bildirilir", async () => {
    bothKeys();
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    const result = await generateAiObject({ schema, prompt: "merhaba" });

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.object).toEqual({ ok: true });
    expect(result.model).toBe("gemini-3.5-flash");
    expect(result.provider).toBe("google");
  });

  it("prompt ve schema olduğu gibi iletilir", async () => {
    bothKeys();
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "tam bu metin" });

    expect(callArgs(0).prompt).toBe("tam bu metin");
    expect(callArgs(0).schema).toBe(schema);
  });

  it("bir model patlarsa sıradaki denenir ve cevabı veren bildirilir", async () => {
    bothKeys();
    generateObjectMock
      .mockRejectedValueOnce(new Error("429 quota"))
      .mockRejectedValueOnce(new Error("model not found"))
      .mockResolvedValueOnce({ object: { ok: true } } as never);

    const result = await generateAiObject({ schema, prompt: "p" });

    expect(generateObjectMock).toHaveBeenCalledTimes(3);
    expect(result.model).toBe("gpt-5-mini");
    expect(result.provider).toBe("openai");
  });

  it("hata türü ne olursa olsun sıradakine geçer (şema hatası dahil)", async () => {
    bothKeys();
    generateObjectMock
      .mockRejectedValueOnce(new Error("response did not match schema"))
      .mockResolvedValueOnce({ object: { ok: true } } as never);

    const result = await generateAiObject({ schema, prompt: "p" });
    expect(result.model).toBe("gemini-3.1-flash-lite-preview");
  });

  it("zincirdeki modelleri tam sırayla dener", async () => {
    bothKeys();
    generateObjectMock.mockRejectedValue(new Error("boom"));

    await generateAiObject({ schema, prompt: "p" }).catch(() => {});

    const tried = generateObjectMock.mock.calls.map(
      (call) =>
        (call[0] as unknown as { model: { modelId: string } }).model.modelId,
    );
    expect(tried).toEqual(DEFAULT_CHAIN);
  });

  it("hepsi patlarsa SON hatayı yukarı atar", async () => {
    bothKeys();
    const last = new Error("son model de patladı");
    generateObjectMock
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockRejectedValueOnce(new Error("3"))
      .mockRejectedValueOnce(new Error("4"))
      .mockRejectedValueOnce(last);

    await expect(generateAiObject({ schema, prompt: "p" })).rejects.toBe(last);
  });

  it("zincirde tek model varsa hatası doğrudan yukarı çıkar", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const boom = new Error("tek model patladı");
    generateObjectMock.mockRejectedValue(boom);

    await expect(generateAiObject({ schema, prompt: "p" })).rejects.toBe(boom);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("doğru SDK fabrikası kullanılır (google vs openai)", async () => {
    bothKeys();
    generateObjectMock
      .mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });

    expect(vi.mocked(google).mock.calls.map((c) => c[0])).toEqual([
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite-preview",
    ]);
    expect(vi.mocked(openai).mock.calls.map((c) => c[0])).toEqual(["gpt-5-mini"]);
  });
});

describe("generateAiObject — maxRetries", () => {
  /**
   * Arkasında yedek varken tekrar denemek boşa zaman harcar (route'ların
   * maxDuration'ı 30-60 sn). Sadece zincirin SON halkası tekrar dener.
   */
  it("son olmayan modellerde 0, son modelde 2 tekrar", async () => {
    bothKeys();
    generateObjectMock.mockRejectedValue(new Error("boom"));

    await generateAiObject({ schema, prompt: "p" }).catch(() => {});

    const retries = generateObjectMock.mock.calls.map(
      (call) => (call[0] as unknown as { maxRetries: number }).maxRetries,
    );
    expect(retries).toEqual([0, 0, 0, 0, 2]);
  });

  it("tek modelli zincirde o model 'son'dur → 2 tekrar", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).maxRetries).toBe(2);
  });
});

describe("generateAiObject — temperature", () => {
  it("verilmezse hiç gönderilmez", async () => {
    bothKeys();
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect("temperature" in callArgs(0)).toBe(false);
  });

  it("Gemini modellerine iletilir", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 1.1 });
    expect(callArgs(0).temperature).toBe(1.1);
  });

  /**
   * gpt-5* / o-serisi `temperature` kabul etmiyor; gönderilirse istek 400
   * döner ve /api/ai/topics sessizce yedeğe düşer. Bu testi kaldıran biri
   * hatayı ancak Gemini kotası dolduğunda görür.
   */
  it("OpenAI akıl yürütme modellerine GÖNDERİLMEZ", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 1.1 });
    expect("temperature" in callArgs(0)).toBe(false);
  });

  it("OpenAI'nin akıl yürütmeyen modellerine iletilir", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gpt-4o");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 0.7 });
    expect(callArgs(0).temperature).toBe(0.7);
  });

  it("gpt-5-chat-latest akıl yürütme modeli SAYILMAZ", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gpt-5-chat-latest");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 0.7 });
    expect(callArgs(0).temperature).toBe(0.7);
    expect(callArgs(0).providerOptions).toBeUndefined();
  });

  it("temperature 0 da iletilir (falsy tuzağı)", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 0 });
    expect(callArgs(0).temperature).toBe(0);
  });
});

describe("generateAiObject — providerOptions (düşünme bütçesi)", () => {
  it("Gemini 3+ için thinkingLevel: medium", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: "medium" } },
    });
  });

  it("GEMINI_THINKING_LEVEL varsayılanı ezer", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    vi.stubEnv("GEMINI_THINKING_LEVEL", "high");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: "high" } },
    });
  });

  /**
   * gemini-2.5-* `thinkingLevel` tanımıyor → 400. Zincirin son halkası bu
   * model olduğu için, bu kural bozulursa TÜM yedekler tükendiğinde
   * uygulama tamamen cevapsız kalır.
   */
  it("gemini-2.5-* için providerOptions GÖNDERİLMEZ", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gemini-2.5-flash");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toBeUndefined();
  });

  it("sürüm numarası okunamayan Google modellerinde de gönderilmez", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "g-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gemma-3-27b-it");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toBeUndefined();
  });

  it("OpenAI akıl yürütme modelleri için reasoningEffort: low", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });

  it("OPENAI_REASONING_EFFORT varsayılanı ezer", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("OPENAI_REASONING_EFFORT", "medium");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toEqual({
      openai: { reasoningEffort: "medium" },
    });
  });

  it("o-serisi de akıl yürütme modeli sayılır", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AI_MODEL_CHAIN", "o3-mini");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p", temperature: 0.5 });
    expect(callArgs(0).providerOptions).toEqual({
      openai: { reasoningEffort: "low" },
    });
    expect("temperature" in callArgs(0)).toBe(false);
  });

  it("gpt-4o gibi klasik modellere providerOptions gönderilmez", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("AI_MODEL_CHAIN", "gpt-4o-mini");
    generateObjectMock.mockResolvedValue({ object: { ok: true } } as never);

    await generateAiObject({ schema, prompt: "p" });
    expect(callArgs(0).providerOptions).toBeUndefined();
  });

  it("her zincir halkası kendi providerOptions'ıyla çağrılır", async () => {
    bothKeys();
    generateObjectMock.mockRejectedValue(new Error("boom"));

    await generateAiObject({ schema, prompt: "p" }).catch(() => {});

    // gemini-3.5, gemini-3.1, gpt-5-mini, gemini-3, gemini-2.5
    expect(callArgs(0).providerOptions).toEqual({
      google: { thinkingConfig: { thinkingLevel: "medium" } },
    });
    expect(callArgs(2).providerOptions).toEqual({
      openai: { reasoningEffort: "low" },
    });
    expect(callArgs(4).providerOptions).toBeUndefined();
  });
});
