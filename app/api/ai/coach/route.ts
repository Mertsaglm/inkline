import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured, isQuotaError } from "@/lib/ai/provider";
import { coachSchema } from "@/lib/ai/schemas";
import { coachPrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST() {
  if (!isAiConfigured())
    return NextResponse.json(
      { error: "AI anahtarı ayarlanmamış." },
      { status: 503 },
    );

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const supabase = await createClient();

  // Hata desenleri (tür bazında sayım)
  const { data: feedback } = await supabase
    .from("feedback_events")
    .select("kind, message, span_text")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(120);

  const kindCounts: Record<string, number> = {};
  const examples: string[] = [];
  for (const f of feedback ?? []) {
    kindCounts[f.kind] = (kindCounts[f.kind] ?? 0) + 1;
    if (examples.length < 15 && f.span_text)
      examples.push(`- [${f.kind}] "${f.span_text}" → ${f.message}`);
  }

  // Not geçmişi
  const { data: grades } = await supabase
    .from("essay_grades")
    .select("overall_score, rubric, created_at, summary_feedback")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(10);

  // Seviye geçmişi
  const { data: levels } = await supabase
    .from("level_history")
    .select("cefr, numeric_estimate, assessed_at")
    .eq("user_id", ctx.userId)
    .order("assessed_at", { ascending: true });

  const stats = [
    `Current level: ${ctx.profile.current_level} · Target: ${ctx.profile.target_level}`,
    `Essays graded: ${grades?.length ?? 0}`,
    grades && grades.length
      ? `Recent overall bands: ${grades.map((g) => g.overall_score).join(", ")}`
      : "No grades yet.",
    `Mistake counts by type: ${JSON.stringify(kindCounts)}`,
    levels && levels.length
      ? `Level trajectory: ${levels
          .map((l) => l.cefr)
          .join(" → ")}`
      : "",
    examples.length ? `Recent mistake examples:\n${examples.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { object, model } = await generateAiObject({
      schema: coachSchema,
      prompt: coachPrompt(
        stats,
        ctx.profile.current_level,
        ctx.profile.target_level,
        ctx.profile.feedback_lang_override,
      ),
    });
    return NextResponse.json({ ...object, model });
  } catch (e) {
    console.error("coach error", e);
    const quota = isQuotaError(e);
    return NextResponse.json(
      {
        error: quota
          ? "AI kotası doldu. Birkaç dakika sonra tekrar dene."
          : "Gelişim planı üretilemedi.",
      },
      { status: quota ? 429 : 500 },
    );
  }
}
