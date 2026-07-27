import type { Essay, EssayGrade, Profile } from "@/lib/db/types";
import type { CefrLevel } from "@/lib/cefr";
import type { CheckResult, GradeResult } from "@/lib/ai/schemas";

/** DB satırlarının varsayılan hâli; testler sadece ilgilendikleri alanı ezer. */

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: "test-user",
    current_level: "B1",
    target_level: "B2",
    ai_warnings_enabled: true,
    feedback_lang_override: "auto",
    interests: null,
    streak: 0,
    onboarded: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeEssay(overrides: Partial<Essay> = {}): Essay {
  return {
    id: "essay-1",
    user_id: "test-user",
    title: "My weekend",
    prompt: "Describe your weekend.",
    content: { type: "doc", content: [] },
    plain_text:
      "Last weekend I go to the cinema with my friends and we watched a very interesting film about space.",
    status: "draft",
    word_count: 18,
    level_at_writing: "B1",
    created_at: "2026-01-02T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

export function makeGrade(overrides: Partial<EssayGrade> = {}): EssayGrade {
  return {
    id: "grade-1",
    essay_id: "essay-1",
    user_id: "test-user",
    rubric: {
      task_achievement: 6,
      coherence_cohesion: 5.5,
      lexical_resource: 6,
      grammatical_range: 5,
    },
    overall_score: 5.5,
    cefr_estimate: "B1",
    summary_feedback: "İyi bir başlangıç.",
    corrected_text: "Last weekend I went to the cinema.",
    strengths: ["Açık cümleler"],
    improvements: ["Geçmiş zaman"],
    ai_model: "gemini-3.5-flash",
    created_at: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

/** Şemaya uyan geçerli bir AI not çıktısı. */
export function makeGradeResult(
  overrides: Partial<GradeResult> = {},
): GradeResult {
  return {
    rubric: {
      task_achievement: 6,
      coherence_cohesion: 5.5,
      lexical_resource: 6,
      grammatical_range: 5,
    },
    overall_score: 5.5,
    cefr_estimate: "B1",
    summary_feedback: "İyi bir başlangıç, zaman kullanımına dikkat et.",
    corrected_text: "Last weekend I went to the cinema with my friends.",
    strengths: ["Konuya uygun"],
    improvements: ["Geçmiş zaman çekimleri"],
    ...overrides,
  };
}

/** Tek hatalı span içeren geçerli bir kontrol çıktısı. */
export function makeCheckResult(
  issues: CheckResult["issues"] = [],
): CheckResult {
  return { issues };
}

export function makeIssue(
  overrides: Partial<CheckResult["issues"][number]> = {},
): CheckResult["issues"][number] {
  return {
    span_text: "I go",
    kind: "grammar",
    severity: "critical",
    message: "Geçmişten bahsederken geçmiş zaman kullanılır.",
    replacement: "I went",
    ...overrides,
  };
}

export const ALL_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
