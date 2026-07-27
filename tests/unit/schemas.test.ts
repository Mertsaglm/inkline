import { describe, it, expect } from "vitest";
import {
  assistSchema,
  cefrEnum,
  checkSchema,
  coachSchema,
  diagnosticSchema,
  gradeSchema,
  issueKind,
  issueSeverity,
  topicsSchema,
} from "@/lib/ai/schemas";
import { CEFR_LEVELS } from "@/lib/cefr";
import { makeGradeResult, makeIssue } from "../helpers/fixtures";

/**
 * Şemalar modelin çıktısıyla uygulamanın arasındaki tek sözleşme.
 * `generateObject` şemaya uymayan cevabı reddedip zincirdeki sıradaki modele
 * geçiyor — yani şema gevşetilirse bozuk çıktı doğrudan arayüze/DB'ye akar.
 */

function repeat<T>(item: T, n: number): T[] {
  return Array.from({ length: n }, () => item);
}

describe("cefrEnum", () => {
  it("lib/cefr.ts'deki band listesiyle aynıdır", () => {
    expect(cefrEnum.options).toEqual([...CEFR_LEVELS]);
  });

  it("geçersiz bandı reddeder", () => {
    expect(cefrEnum.safeParse("B3").success).toBe(false);
    expect(cefrEnum.safeParse("b1").success).toBe(false);
  });
});

describe("issueKind / issueSeverity", () => {
  it("beş hata türünü tanır", () => {
    expect(issueKind.options).toEqual([
      "grammar",
      "vocab",
      "structure",
      "spelling",
      "style",
    ]);
  });

  it("iki önem derecesi vardır", () => {
    expect(issueSeverity.options).toEqual(["critical", "suggestion"]);
  });

  it("uydurma tür/derece reddedilir", () => {
    expect(issueKind.safeParse("punctuation").success).toBe(false);
    expect(issueSeverity.safeParse("warning").success).toBe(false);
  });
});

describe("checkSchema", () => {
  it("geçerli bir hata listesini kabul eder", () => {
    const parsed = checkSchema.safeParse({ issues: [makeIssue()] });
    expect(parsed.success).toBe(true);
  });

  it("boş liste geçerlidir (hata bulunmaması normal)", () => {
    expect(checkSchema.safeParse({ issues: [] }).success).toBe(true);
  });

  /** Canlı kontrol paneli 12'den fazla işareti taşımıyor. */
  it("en fazla 12 hata alır", () => {
    expect(
      checkSchema.safeParse({ issues: repeat(makeIssue(), 12) }).success,
    ).toBe(true);
    expect(
      checkSchema.safeParse({ issues: repeat(makeIssue(), 13) }).success,
    ).toBe(false);
  });

  /**
   * `replacement` NULLABLE ama ZORUNLU. Alan tamamen atlanabilir olursa
   * `safeReplacement(undefined, span)` yolu tanımsız davranışa düşer ve
   * arayüz "Uygula" düğmesini yanlış gösterir.
   */
  it("replacement açıkça null olabilir ama alan atlanamaz", () => {
    expect(
      checkSchema.safeParse({
        issues: [makeIssue({ replacement: null })],
      }).success,
    ).toBe(true);

    const withoutField = { ...makeIssue() } as Record<string, unknown>;
    delete withoutField.replacement;
    expect(checkSchema.safeParse({ issues: [withoutField] }).success).toBe(false);
  });

  it("span_text, kind, severity ve message zorunludur", () => {
    for (const field of ["span_text", "kind", "severity", "message"]) {
      const issue = { ...makeIssue() } as Record<string, unknown>;
      delete issue[field];
      expect(
        checkSchema.safeParse({ issues: [issue] }).success,
        `${field} eksikken kabul edildi`,
      ).toBe(false);
    }
  });

  it("issues alanı zorunludur", () => {
    expect(checkSchema.safeParse({}).success).toBe(false);
  });

  it("tanımsız ek alanları ayıklar (arayüze sızmaz)", () => {
    const parsed = checkSchema.parse({
      issues: [{ ...makeIssue(), confidence: 0.9 }],
    });
    expect(parsed.issues[0]).not.toHaveProperty("confidence");
  });

  it("message ve replacement string olmalı (nesne/dizi kabul edilmez)", () => {
    expect(
      checkSchema.safeParse({
        issues: [makeIssue({ message: { text: "x" } as never })],
      }).success,
    ).toBe(false);
    expect(
      checkSchema.safeParse({
        issues: [makeIssue({ replacement: ["a", "b"] as never })],
      }).success,
    ).toBe(false);
  });
});

describe("assistSchema", () => {
  const suggestion = {
    type: "grammar" as const,
    title: "Zaman uyumu",
    explanation: "Geçmiş olay anlatılıyor.",
    span_text: "I go",
    replacement: "I went",
  };

  it("1-5 öneri arası kabul eder", () => {
    expect(assistSchema.safeParse({ suggestions: [] }).success).toBe(false);
    expect(assistSchema.safeParse({ suggestions: [suggestion] }).success).toBe(
      true,
    );
    expect(
      assistSchema.safeParse({ suggestions: repeat(suggestion, 5) }).success,
    ).toBe(true);
    expect(
      assistSchema.safeParse({ suggestions: repeat(suggestion, 6) }).success,
    ).toBe(false);
  });

  it("sadece tavsiye olan öneride iki alan da null olabilir", () => {
    expect(
      assistSchema.safeParse({
        suggestions: [{ ...suggestion, span_text: null, replacement: null }],
      }).success,
    ).toBe(true);
  });

  it("title ve explanation zorunludur", () => {
    for (const field of ["title", "explanation", "type"]) {
      const s = { ...suggestion } as Record<string, unknown>;
      delete s[field];
      expect(
        assistSchema.safeParse({ suggestions: [s] }).success,
        `${field} eksikken kabul edildi`,
      ).toBe(false);
    }
  });

  it("type alanı issueKind ile aynı kümeyi kullanır", () => {
    for (const kind of issueKind.options) {
      expect(
        assistSchema.safeParse({ suggestions: [{ ...suggestion, type: kind }] })
          .success,
        kind,
      ).toBe(true);
    }
    expect(
      assistSchema.safeParse({
        suggestions: [{ ...suggestion, type: "tone" }],
      }).success,
    ).toBe(false);
  });
});

describe("topicsSchema", () => {
  const topic = {
    title: "A city I want to visit",
    prompt: "Describe a city you would like to visit and why.",
    category: "Travel",
  };

  it("3-5 konu arası kabul eder", () => {
    expect(topicsSchema.safeParse({ topics: repeat(topic, 2) }).success).toBe(
      false,
    );
    expect(topicsSchema.safeParse({ topics: repeat(topic, 3) }).success).toBe(
      true,
    );
    expect(topicsSchema.safeParse({ topics: repeat(topic, 5) }).success).toBe(
      true,
    );
    expect(topicsSchema.safeParse({ topics: repeat(topic, 6) }).success).toBe(
      false,
    );
  });

  /** Prompt 4 konu istiyor; şemanın alt sınırı bunu kapsamalı. */
  it("prompt'un istediği 4 konu şemaya sığar", () => {
    expect(topicsSchema.safeParse({ topics: repeat(topic, 4) }).success).toBe(
      true,
    );
  });

  it("her konu için title, prompt ve category zorunludur", () => {
    for (const field of ["title", "prompt", "category"]) {
      const t = { ...topic } as Record<string, unknown>;
      delete t[field];
      expect(
        topicsSchema.safeParse({ topics: repeat(t, 4) }).success,
        `${field} eksikken kabul edildi`,
      ).toBe(false);
    }
  });
});

describe("diagnosticSchema", () => {
  const base = { cefr: "B1", numeric_estimate: 3.2, rationale: "Gerekçe." };

  it("geçerli sonucu kabul eder", () => {
    expect(diagnosticSchema.safeParse(base).success).toBe(true);
  });

  /**
   * numeric_estimate DB'de `numeric(3,1)` kolonuna yazılıyor ve grafiklerde
   * 1..6 ekseninde çiziliyor. Sınırlar gevşetilirse grafik bozulur.
   */
  it("numeric_estimate 1..6 aralığında olmalı", () => {
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: 1 }).success).toBe(true);
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: 6 }).success).toBe(true);
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: 0.9 }).success).toBe(false);
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: 6.1 }).success).toBe(false);
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: -1 }).success).toBe(false);
  });

  it("ondalıklı tahmin kabul edilir", () => {
    expect(diagnosticSchema.safeParse({ ...base, numeric_estimate: 2.7 }).success).toBe(true);
  });

  it("cefr geçerli bir band olmalı", () => {
    expect(diagnosticSchema.safeParse({ ...base, cefr: "B3" }).success).toBe(false);
  });

  it("rationale zorunludur", () => {
    const withoutRationale = { ...base } as Record<string, unknown>;
    delete withoutRationale.rationale;
    expect(diagnosticSchema.safeParse(withoutRationale).success).toBe(false);
  });
});

describe("gradeSchema", () => {
  it("geçerli notu kabul eder", () => {
    expect(gradeSchema.safeParse(makeGradeResult()).success).toBe(true);
  });

  it("rubrik dört kriterin hepsini ister", () => {
    const criteria = [
      "task_achievement",
      "coherence_cohesion",
      "lexical_resource",
      "grammatical_range",
    ] as const;
    for (const criterion of criteria) {
      const grade = makeGradeResult();
      const rubric = { ...grade.rubric } as Record<string, number>;
      delete rubric[criterion];
      expect(
        gradeSchema.safeParse({ ...grade, rubric }).success,
        `${criterion} eksikken kabul edildi`,
      ).toBe(false);
    }
  });

  /** IELTS bandı 0-9; DB kolonu `numeric(3,1)`. */
  it("her rubrik puanı 0..9 arasında olmalı", () => {
    const grade = makeGradeResult();
    for (const value of [0, 4.5, 9]) {
      expect(
        gradeSchema.safeParse({
          ...grade,
          rubric: { ...grade.rubric, task_achievement: value },
        }).success,
        `${value} reddedildi`,
      ).toBe(true);
    }
    for (const value of [-0.5, 9.5, 10, 100]) {
      expect(
        gradeSchema.safeParse({
          ...grade,
          rubric: { ...grade.rubric, task_achievement: value },
        }).success,
        `${value} kabul edildi`,
      ).toBe(false);
    }
  });

  it("overall_score 0..9 arasında olmalı", () => {
    expect(gradeSchema.safeParse(makeGradeResult({ overall_score: 0 })).success).toBe(true);
    expect(gradeSchema.safeParse(makeGradeResult({ overall_score: 9 })).success).toBe(true);
    expect(gradeSchema.safeParse(makeGradeResult({ overall_score: 9.1 })).success).toBe(false);
    expect(gradeSchema.safeParse(makeGradeResult({ overall_score: -1 })).success).toBe(false);
  });

  it("strengths ve improvements 1..5 madde arası olmalı", () => {
    for (const field of ["strengths", "improvements"] as const) {
      expect(
        gradeSchema.safeParse(makeGradeResult({ [field]: [] })).success,
        `${field} boş kabul edildi`,
      ).toBe(false);
      expect(
        gradeSchema.safeParse(makeGradeResult({ [field]: repeat("x", 5) }))
          .success,
      ).toBe(true);
      expect(
        gradeSchema.safeParse(makeGradeResult({ [field]: repeat("x", 6) }))
          .success,
      ).toBe(false);
    }
  });

  it("corrected_text ve summary_feedback zorunludur", () => {
    for (const field of ["corrected_text", "summary_feedback"] as const) {
      const grade = { ...makeGradeResult() } as Record<string, unknown>;
      delete grade[field];
      expect(
        gradeSchema.safeParse(grade).success,
        `${field} eksikken kabul edildi`,
      ).toBe(false);
    }
  });

  it("cefr_estimate geçerli bir band olmalı", () => {
    expect(
      gradeSchema.safeParse(makeGradeResult({ cefr_estimate: "B9" as never }))
        .success,
    ).toBe(false);
    for (const level of CEFR_LEVELS) {
      expect(
        gradeSchema.safeParse(makeGradeResult({ cefr_estimate: level })).success,
        level,
      ).toBe(true);
    }
  });
});

describe("coachSchema", () => {
  const valid = {
    headline: "Güzel gidiyorsun!",
    focus_areas: repeat({ title: "t", why: "w", how: "h" }, 2),
    recurring_mistakes: [{ pattern: "p", example: "e", fix: "f" }],
    recommended_topics: repeat({ title: "t", prompt: "p" }, 2),
    next_level_tips: repeat("tip", 2),
  };

  it("geçerli planı kabul eder", () => {
    expect(coachSchema.safeParse(valid).success).toBe(true);
  });

  it("focus_areas 2..4 arası olmalı", () => {
    const area = { title: "t", why: "w", how: "h" };
    expect(coachSchema.safeParse({ ...valid, focus_areas: repeat(area, 1) }).success).toBe(false);
    expect(coachSchema.safeParse({ ...valid, focus_areas: repeat(area, 4) }).success).toBe(true);
    expect(coachSchema.safeParse({ ...valid, focus_areas: repeat(area, 5) }).success).toBe(false);
  });

  it("focus_areas maddeleri title/why/how üçlüsünü ister", () => {
    for (const field of ["title", "why", "how"]) {
      const area = { title: "t", why: "w", how: "h" } as Record<string, unknown>;
      delete area[field];
      expect(
        coachSchema.safeParse({ ...valid, focus_areas: repeat(area, 2) }).success,
        `${field} eksikken kabul edildi`,
      ).toBe(false);
    }
  });

  /** Yeni öğrencide tekrar eden hata olmayabilir → boş liste geçerli. */
  it("recurring_mistakes boş olabilir, en fazla 4 olur", () => {
    const mistake = { pattern: "p", example: "e", fix: "f" };
    expect(coachSchema.safeParse({ ...valid, recurring_mistakes: [] }).success).toBe(true);
    expect(coachSchema.safeParse({ ...valid, recurring_mistakes: repeat(mistake, 4) }).success).toBe(true);
    expect(coachSchema.safeParse({ ...valid, recurring_mistakes: repeat(mistake, 5) }).success).toBe(false);
  });

  it("recommended_topics 2..4 arası olmalı", () => {
    const topic = { title: "t", prompt: "p" };
    expect(coachSchema.safeParse({ ...valid, recommended_topics: repeat(topic, 1) }).success).toBe(false);
    expect(coachSchema.safeParse({ ...valid, recommended_topics: repeat(topic, 4) }).success).toBe(true);
    expect(coachSchema.safeParse({ ...valid, recommended_topics: repeat(topic, 5) }).success).toBe(false);
  });

  it("next_level_tips 2..5 arası olmalı", () => {
    expect(coachSchema.safeParse({ ...valid, next_level_tips: ["a"] }).success).toBe(false);
    expect(coachSchema.safeParse({ ...valid, next_level_tips: repeat("a", 5) }).success).toBe(true);
    expect(coachSchema.safeParse({ ...valid, next_level_tips: repeat("a", 6) }).success).toBe(false);
  });

  it("headline zorunludur", () => {
    const withoutHeadline = { ...valid } as Record<string, unknown>;
    delete withoutHeadline.headline;
    expect(coachSchema.safeParse(withoutHeadline).success).toBe(false);
  });
});

describe("şema açıklamaları (describe) korunur", () => {
  /**
   * `.describe()` metinleri prompt'un bir parçası gibi çalışıyor — model
   * alanın ne olduğunu buradan okuyor. Silinirse `replacement` tekrar
   * açıklama içermeye başlar.
   */
  it("checkSchema.replacement açıklaması 'BİREBİR' ve 'null' kurallarını taşır", () => {
    const shape = checkSchema.shape.issues.element.shape;
    const description = shape.replacement.description ?? "";
    expect(description).toMatch(/BİREBİR/);
    expect(description).toMatch(/null/);
    expect(description).toMatch(/tırnak/i);
  });

  it("checkSchema.span_text açıklaması verbatim şartını taşır", () => {
    const shape = checkSchema.shape.issues.element.shape;
    expect(shape.span_text.description ?? "").toMatch(/verbatim/i);
  });

  it("checkSchema.message açıklaması 'düzeltme metni buraya yazılmaz' der", () => {
    const shape = checkSchema.shape.issues.element.shape;
    expect(shape.message.description ?? "").toMatch(
      /Düzeltme metni BURAYA yazılmaz/i,
    );
  });
});
