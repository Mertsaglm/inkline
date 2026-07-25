export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const CEFR_LABELS: Record<CefrLevel, string> = {
  A1: "A1 · Başlangıç",
  A2: "A2 · Temel",
  B1: "B1 · Orta",
  B2: "B2 · Orta-üstü",
  C1: "C1 · İleri",
  C2: "C2 · Ustalık",
};

export function isCefrLevel(v: unknown): v is CefrLevel {
  return typeof v === "string" && (CEFR_LEVELS as readonly string[]).includes(v);
}

export function cefrToNumber(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level) + 1; // 1..6
}

export function numberToCefr(n: number): CefrLevel {
  const idx = Math.max(0, Math.min(CEFR_LEVELS.length - 1, Math.round(n) - 1));
  return CEFR_LEVELS[idx];
}

export function nextLevel(level: CefrLevel): CefrLevel {
  const idx = Math.min(CEFR_LEVELS.length - 1, CEFR_LEVELS.indexOf(level) + 1);
  return CEFR_LEVELS[idx];
}

/**
 * Yeni bir seviye tahminini mevcut seviyeyle yumuşatarak birleştirir
 * (tek bir essay ile seviyenin sıçramasını önler).
 */
export function smoothLevel(
  current: CefrLevel,
  estimate: CefrLevel,
  weight = 0.34,
): CefrLevel {
  const blended =
    cefrToNumber(current) * (1 - weight) + cefrToNumber(estimate) * weight;
  return numberToCefr(blended);
}

export type FeedbackLang = "tr" | "mixed" | "en";

/**
 * Seviyeye göre AI açıklamalarının dili.
 * A1-A2: Türkçe · B1-B2: karışık · C1-C2: İngilizce
 */
export function feedbackLangForLevel(level: CefrLevel): FeedbackLang {
  const n = cefrToNumber(level);
  if (n <= 2) return "tr";
  if (n <= 4) return "mixed";
  return "en";
}

/**
 * Prompt'a eklenecek dil talimatı.
 */
export function feedbackLangInstruction(lang: FeedbackLang): string {
  switch (lang) {
    case "tr":
      return "Write ALL explanations, messages and advice in TURKISH (the learner is a beginner). Keep English only for the example words/sentences being taught. Be warm, simple and encouraging.";
    case "mixed":
      return "Write explanations mostly in TURKISH but you may use English for key terms and examples. The learner is intermediate. Be clear and encouraging.";
    case "en":
      return "Write ALL explanations in clear, simple ENGLISH. The learner is advanced. You may add a short Turkish note only for tricky nuances.";
  }
}
