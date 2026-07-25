import {
  type CefrLevel,
  feedbackLangForLevel,
  feedbackLangInstruction,
  type FeedbackLang,
} from "@/lib/cefr";

function langInstruction(level: CefrLevel, override?: FeedbackLang | "auto") {
  const lang =
    !override || override === "auto" ? feedbackLangForLevel(level) : override;
  return feedbackLangInstruction(lang);
}

const TOPIC_DOMAINS = [
  "daily life",
  "personal opinion",
  "society & culture",
  "technology",
  "environment & nature",
  "education & work",
  "travel & places",
  "health & lifestyle",
  "hypothetical / imagination",
  "past experience & memory",
  "arts & entertainment",
  "future & goals",
];

export function topicsPrompt(
  level: CefrLevel,
  interests: string | null,
  override?: FeedbackLang | "auto",
  exclude?: string[],
) {
  // Farklı çağrılarda farklı alanlara odaklanması için alanları karıştırıp seç.
  const shuffled = [...TOPIC_DOMAINS].sort(() => Math.random() - 0.5).slice(0, 6);
  return `You are a friendly English writing tutor.
The learner's CEFR level is ${level}.
${interests ? `Their interests: ${interests}.` : ""}
Suggest 4 short, motivating essay topics appropriate for CEFR ${level}
(not too hard, not too easy).

DIVERSITY IS IMPORTANT:
- Make the 4 topics clearly DIFFERENT from each other in theme and angle.
- Draw from a VARIETY of domains, e.g.: ${shuffled.join(", ")}.
- Avoid generic clichés (e.g. "my best friend", "my daily routine") unless given a fresh angle.
${
  exclude && exclude.length
    ? `- Do NOT repeat or closely resemble any of these already-shown topics:\n${exclude
        .slice(0, 20)
        .map((t) => `  · ${t}`)
        .join("\n")}`
    : ""
}

For each topic give a catchy English title, a 1-2 sentence English writing
prompt at ${level} difficulty, and a short category tag.
${langInstruction(level, override)}
The titles and prompts themselves MUST be in English (that is what the learner will write in).`;
}

export function diagnosticPrompt(
  sample: string,
  override?: FeedbackLang | "auto",
) {
  return `You are an English placement examiner.
Assess the following writing sample and estimate the learner's CEFR level.
Return the CEFR band, a numeric estimate (1=A1 ... 6=C2, decimals allowed),
and a short rationale.
${langInstruction("B1", override)}

--- SAMPLE ---
${sample}
--- END ---`;
}

export function checkPrompt(
  text: string,
  level: CefrLevel,
  override?: FeedbackLang | "auto",
) {
  return `You are a real-time writing assistant (like Grammarly) helping a CEFR ${level} learner.
Analyze the text below and find writing issues.

Rules:
- For each issue, copy the EXACT problematic substring into "span_text", VERBATIM
  from the text (same casing/spacing). Never paraphrase span_text.
- Prefer SHORT spans (a few words) so they can be located precisely.
- Use severity="critical" ONLY for errors that clearly break grammar or seriously
  harm meaning. Use severity="suggestion" for style/word-choice improvements.
- "message": a SHORT teaching explanation of the RULE. It is displayed on its own,
  so never put the corrected text here.
- "replacement": ONLY the corrected English that will LITERALLY replace span_text.
  * It is inserted verbatim into the learner's essay, so it must be a drop-in
    substitute: swapping span_text for it must produce grammatical English.
  * NO quotation marks, NO explanation, NO alternatives, NO "or"/"veya", NO Turkish.
    Just the replacement words themselves.
  * Keep it close in length to span_text.
  * If there is no single clean fix (e.g. the advice is purely stylistic), set
    replacement to null instead of writing prose.
  Good: span_text="you really enjoying" → replacement="you really enjoy"
  Bad:  replacement="\\"you are really enjoying\\" veya daha uygun: \\"you really enjoy\\""
- If there are no issues, return an empty array.
- Do NOT flag the same span twice.
${langInstruction(level, override)}

--- TEXT ---
${text}
--- END ---`;
}

export function assistPrompt(
  selection: string,
  context: string,
  level: CefrLevel,
  override?: FeedbackLang | "auto",
) {
  return `A CEFR ${level} learner is writing an English essay and asked for help on a piece of text.

SELECTED TEXT (help focuses on this):
"""${selection}"""

SURROUNDING CONTEXT (for reference only):
"""${context}"""

Give 2-5 INDEPENDENT suggestions. Each suggestion should target its OWN specific
part of the selected text so the learner can accept or reject them one by one:
- "span_text": the EXACT substring of the SELECTED TEXT to change, copied VERBATIM
  (same casing/spacing). Prefer short, precise spans (a few words). Different
  suggestions should target DIFFERENT spans (avoid overlap).
- "replacement": the improved ENGLISH that replaces ONLY that span_text (similar length).
- Cover a mix where relevant: grammar fixes, stronger/more natural vocabulary,
  and better sentence structure.
- For a purely advisory tip with no concrete edit, set span_text AND replacement to null.
NEVER put the whole essay or the surrounding context into replacement.
${langInstruction(level, override)}`;
}

export function gradePrompt(
  essay: string,
  topicPrompt: string | null,
  level: CefrLevel,
  override?: FeedbackLang | "auto",
) {
  return `You are an experienced IELTS-style writing examiner.
Grade the learner's essay on four criteria (0-9 each):
task_achievement, coherence_cohesion, lexical_resource, grammatical_range.
Also give an overall band (0-9), a CEFR estimate, 2-4 sentences of summary
feedback, a FULL corrected version of the essay in natural English
(corrected_text), plus concrete strengths and improvements.

Be fair but encouraging. The learner's self-reported level is ${level}.
${langInstruction(level, override)}
The corrected_text MUST stay in English.

${topicPrompt ? `TOPIC PROMPT:\n${topicPrompt}\n` : ""}
--- ESSAY ---
${essay}
--- END ---`;
}

export function coachPrompt(
  stats: string,
  level: CefrLevel,
  target: CefrLevel,
  override?: FeedbackLang | "auto",
) {
  return `You are a personal English writing coach.
Based on the learner's real performance data below, produce an actionable
development plan to move them from CEFR ${level} toward ${target}.

Include: a motivating headline, 2-4 focus areas (title/why/how), the learner's
recurring mistakes with an example and fix, 2-4 recommended next essay topics,
and concrete next-level tips.
${langInstruction(level, override)}
Recommended topic titles/prompts stay in English.

--- LEARNER DATA ---
${stats}
--- END ---`;
}
