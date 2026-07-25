import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { generateObject, type JSONValue, type LanguageModel } from "ai";
import type { z } from "zod";

/**
 * AI model zinciri — tek sıralı liste, görev ayrımı yok.
 *
 * Her istek zincirin başından başlar; bir model cevap veremezse (kota, yetki,
 * bulunamayan model, ağ, zaman aşımı, şemaya uymayan çıktı — fark etmez) sıradaki
 * modele geçilir. Anahtarı olmayan sağlayıcının modelleri zincirden düşer.
 *
 * Sıra (varsayılan):
 *   1. gemini-3.5-flash               (Google)
 *   2. gemini-3.1-flash-lite-preview  (Google)
 *   3. gpt-5-mini                     (OpenAI)
 *   4. gemini-3-flash-preview         (Google)
 *   5. gemini-2.5-flash               (Google)
 *
 * Düşünme bütçesi: OpenAI tarafı her zaman "low", Gemini tarafı her zaman "medium".
 *
 * Anahtarlar ve ayarlar YALNIZCA sunucuda okunur.
 */

export type AiProviderId = "openai" | "google";

const DEFAULT_CHAIN = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite-preview",
  "gpt-5-mini",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
];

const env = (name: string) => (process.env[name] ?? "").trim();

const API_KEY_ENV: Record<AiProviderId, string> = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Model adından sağlayıcıyı çıkar. */
export function providerOf(modelId: string): AiProviderId {
  return /^(gemini|gemma)/i.test(modelId) ? "google" : "openai";
}

export function providerConfigured(provider: AiProviderId) {
  return Boolean(env(API_KEY_ENV[provider]));
}

/**
 * Sırayla denenecek modeller. `AI_MODEL_CHAIN` ile (virgülle ayrılmış) tamamen
 * değiştirilebilir; boşsa yukarıdaki varsayılan sıra kullanılır. Anahtarı
 * bulunmayan sağlayıcının modelleri elenir.
 */
export function modelChain(): string[] {
  const override = env("AI_MODEL_CHAIN");
  const list = override
    ? override
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    : DEFAULT_CHAIN;
  return list.filter((id) => providerConfigured(providerOf(id)));
}

export function isAiConfigured() {
  return modelChain().length > 0;
}

/** Teşhis / arayüz için: hangi modeller sırayla denenecek. */
export function activeAiChain() {
  return modelChain().map((id) => ({ id, provider: providerOf(id) }));
}

/**
 * OpenAI'nin akıl yürütme modelleri (gpt-5*, o-serisi) `temperature` kabul
 * etmez; gönderilirse istek 400 döner. Bunlarda temperature yerine
 * reasoningEffort kullanılır.
 */
function isOpenAiReasoningModel(id: string) {
  return (
    (/^gpt-5/.test(id) || /^o[1-9]/.test(id)) && !/-chat-latest$/.test(id)
  );
}

/**
 * `thinkingLevel` Gemini 3 ve sonrasının parametresi. gemini-2.5-* bunu
 * tanımaz (400 döner) — o modeller kendi dinamik düşünme varsayılanıyla çalışır.
 */
function supportsThinkingLevel(id: string) {
  const major = /^gemini-(\d+)/.exec(id)?.[1];
  return major !== undefined && Number(major) >= 3;
}

function languageModelFor(id: string): LanguageModel {
  return providerOf(id) === "openai" ? openai(id) : google(id);
}

/** `ai` paketi ProviderOptions tipini dışa vermiyor; şekli bu. */
type ProviderOptions = Record<string, Record<string, JSONValue>>;

function providerOptionsFor(id: string): ProviderOptions | undefined {
  if (providerOf(id) === "openai") {
    if (!isOpenAiReasoningModel(id)) return undefined;
    return {
      openai: { reasoningEffort: env("OPENAI_REASONING_EFFORT") || "low" },
    };
  }
  if (!supportsThinkingLevel(id)) return undefined;
  return {
    google: {
      thinkingConfig: {
        thinkingLevel: env("GEMINI_THINKING_LEVEL") || "medium",
      },
    },
  };
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI anahtarı ayarlanmamış (OPENAI_API_KEY veya GOOGLE_GENERATIVE_AI_API_KEY).",
    );
    this.name = "AiNotConfiguredError";
  }
}

export function isQuotaError(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : undefined;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /quota|RESOURCE_EXHAUSTED|429|rate ?limit|insufficient_quota/i.test(
    message,
  );
}

/**
 * Yapılandırılmış üretim için tek giriş noktası. Zinciri sırayla dener ve
 * cevabı hangi modelin ürettiğini geri bildirir (arayüzde gösterilir).
 */
export async function generateAiObject<S extends z.ZodType>({
  schema,
  prompt,
  temperature,
}: {
  schema: S;
  prompt: string;
  /** Yalnızca destekleyen modellere iletilir (akıl yürütme modelleri hariç). */
  temperature?: number;
}): Promise<{ object: z.infer<S>; model: string; provider: AiProviderId }> {
  const chain = modelChain();
  if (!chain.length) throw new AiNotConfiguredError();

  let lastError: unknown;

  for (const [index, id] of chain.entries()) {
    const isLast = index === chain.length - 1;
    const skipTemperature =
      providerOf(id) === "openai" && isOpenAiReasoningModel(id);
    const providerOptions = providerOptionsFor(id);

    try {
      const { object } = await generateObject({
        model: languageModelFor(id),
        schema,
        prompt,
        // Arkasında yedek varken tek denemede bırak; asıl yedekleme zincirde.
        maxRetries: isLast ? 2 : 0,
        ...(temperature !== undefined && !skipTemperature
          ? { temperature }
          : {}),
        ...(providerOptions ? { providerOptions } : {}),
      });
      return { object: object as z.infer<S>, model: id, provider: providerOf(id) };
    } catch (error) {
      lastError = error;
      if (isLast) throw error;
      console.warn(
        `[ai] ${id} cevap veremedi, ${chain[index + 1]} deneniyor:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw lastError;
}
