import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured, isQuotaError } from "@/lib/ai/provider";
import { gradeSchema } from "@/lib/ai/schemas";
import { gradePrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";
import { cefrToNumber, smoothLevel } from "@/lib/cefr";
import type { Essay } from "@/lib/db/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAiConfigured())
    return NextResponse.json(
      { error: "AI anahtarı ayarlanmamış." },
      { status: 503 },
    );

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const essayId: string | undefined = body.essayId;
  if (!essayId)
    return NextResponse.json({ error: "essayId gerekli." }, { status: 400 });

  const supabase = await createClient();
  const { data: essay } = await supabase
    .from("essays")
    .select("*")
    .eq("id", essayId)
    .maybeSingle();

  if (!essay)
    return NextResponse.json({ error: "Essay bulunamadı." }, { status: 404 });
  const e = essay as Essay;

  if (e.plain_text.trim().length < 40)
    return NextResponse.json(
      { error: "Değerlendirme için essay çok kısa." },
      { status: 400 },
    );

  try {
    const { object, model } = await generateAiObject({
      schema: gradeSchema,
      prompt: gradePrompt(
        e.plain_text,
        e.prompt,
        ctx.profile.current_level,
        ctx.profile.feedback_lang_override,
      ),
    });

    // Notu kaydet
    const { data: grade } = await supabase
      .from("essay_grades")
      .insert({
        essay_id: e.id,
        user_id: ctx.userId,
        rubric: object.rubric,
        overall_score: object.overall_score,
        cefr_estimate: object.cefr_estimate,
        summary_feedback: object.summary_feedback,
        corrected_text: object.corrected_text,
        strengths: object.strengths,
        improvements: object.improvements,
        ai_model: model,
      })
      .select("*")
      .single();

    // Essay'i tamamlandı olarak işaretle
    await supabase
      .from("essays")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        level_at_writing: ctx.profile.current_level,
      })
      .eq("id", e.id);

    // Seviye geçmişi + profil güncelle (yumuşatılmış)
    const newLevel = smoothLevel(
      ctx.profile.current_level,
      object.cefr_estimate,
    );
    await supabase.from("level_history").insert({
      user_id: ctx.userId,
      cefr: object.cefr_estimate,
      numeric_estimate: cefrToNumber(object.cefr_estimate),
      source: "essay",
      essay_id: e.id,
    });
    await supabase
      .from("profiles")
      .update({ current_level: newLevel })
      .eq("user_id", ctx.userId);

    return NextResponse.json({ grade, new_level: newLevel, model });
  } catch (err) {
    console.error("grade error", err);
    const quota = isQuotaError(err);
    return NextResponse.json(
      {
        error: quota
          ? "AI kotası doldu. Birkaç dakika sonra tekrar dene."
          : "Değerlendirme yapılamadı.",
      },
      { status: quota ? 429 : 500 },
    );
  }
}
