import { z } from "zod";

export const cefrEnum = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

// --- Konu önerisi ---
export const topicsSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().describe("Kısa, ilgi çekici başlık (İngilizce)"),
        prompt: z
          .string()
          .describe("1-2 cümlelik yazma yönergesi (İngilizce, seviyeye uygun)"),
        category: z
          .string()
          .describe("Kısa tema etiketi, örn: Daily life, Opinion, Technology"),
      }),
    )
    .min(3)
    .max(5),
});
export type TopicsResult = z.infer<typeof topicsSchema>;

// --- Diagnostik / seviye tahmini ---
export const diagnosticSchema = z.object({
  cefr: cefrEnum,
  numeric_estimate: z
    .number()
    .min(1)
    .max(6)
    .describe("1=A1 ... 6=C2, ondalıklı olabilir"),
  rationale: z.string().describe("Kısa gerekçe (seviyeye uygun dilde)"),
});
export type DiagnosticResult = z.infer<typeof diagnosticSchema>;

// --- Canlı hata kontrolü ---
export const issueKind = z.enum([
  "grammar",
  "vocab",
  "structure",
  "spelling",
  "style",
]);
export const issueSeverity = z.enum(["critical", "suggestion"]);

export const checkSchema = z.object({
  issues: z
    .array(
      z.object({
        span_text: z
          .string()
          .describe(
            "Metinden BİREBİR kopyalanmış, hatanın geçtiği tam alt dize (verbatim).",
          ),
        kind: issueKind,
        severity: issueSeverity,
        message: z
          .string()
          .describe(
            "Kısa, öğretici açıklama — kuralı anlatır (seviyeye uygun dilde). Düzeltme metni BURAYA yazılmaz.",
          ),
        replacement: z
          .string()
          .nullable()
          .describe(
            "span_text'in yerine BİREBİR geçecek düzeltilmiş İngilizce metin. " +
              "SADECE metnin kendisi: tırnak, açıklama, alternatif ('veya', 'or') YOK. " +
              "Tek bir net düzeltme yoksa null.",
          ),
      }),
    )
    .max(12),
});
export type CheckResult = z.infer<typeof checkSchema>;

// --- İsteğe bağlı yardım ---
export const assistSchema = z.object({
  suggestions: z
    .array(
      z.object({
        type: issueKind,
        title: z.string().describe("Öneri başlığı (seviyeye uygun dilde)"),
        explanation: z.string().describe("Neden / nasıl (seviyeye uygun dilde)"),
        span_text: z
          .string()
          .nullable()
          .describe(
            "Değiştirilecek tam alt dize — SEÇİLİ METİNDEN BİREBİR kopyalanmış (verbatim). Sadece tavsiyeyse null.",
          ),
        replacement: z
          .string()
          .nullable()
          .describe(
            "span_text yerine geçecek düzeltilmiş İngilizce metin. Sadece tavsiyeyse null.",
          ),
      }),
    )
    .min(1)
    .max(5),
});
export type AssistResult = z.infer<typeof assistSchema>;

// --- Sonda notlama ---
export const gradeSchema = z.object({
  rubric: z.object({
    task_achievement: z.number().min(0).max(9),
    coherence_cohesion: z.number().min(0).max(9),
    lexical_resource: z.number().min(0).max(9),
    grammatical_range: z.number().min(0).max(9),
  }),
  overall_score: z.number().min(0).max(9).describe("IELTS benzeri genel band"),
  cefr_estimate: cefrEnum,
  summary_feedback: z
    .string()
    .describe("2-4 cümlelik genel değerlendirme (seviyeye uygun dilde)"),
  corrected_text: z
    .string()
    .describe("Essay'in tam düzeltilmiş İngilizce hâli"),
  strengths: z.array(z.string()).min(1).max(5),
  improvements: z.array(z.string()).min(1).max(5),
});
export type GradeResult = z.infer<typeof gradeSchema>;

// --- Gelişim koçu ---
export const coachSchema = z.object({
  headline: z.string().describe("Motive edici tek cümlelik özet"),
  focus_areas: z
    .array(
      z.object({
        title: z.string(),
        why: z.string(),
        how: z.string().describe("Somut, uygulanabilir adım"),
      }),
    )
    .min(2)
    .max(4),
  recurring_mistakes: z
    .array(
      z.object({
        pattern: z.string(),
        example: z.string(),
        fix: z.string(),
      }),
    )
    .max(4),
  recommended_topics: z
    .array(z.object({ title: z.string(), prompt: z.string() }))
    .min(2)
    .max(4),
  next_level_tips: z.array(z.string()).min(2).max(5),
});
export type CoachResult = z.infer<typeof coachSchema>;
