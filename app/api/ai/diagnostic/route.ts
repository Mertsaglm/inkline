import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { diagnosticSchema } from "@/lib/ai/schemas";
import { diagnosticPrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isAiConfigured())
    return NextResponse.json(
      { error: "AI anahtarı ayarlanmamış." },
      { status: 503 },
    );

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sample: string = (body.sample ?? "").toString().trim();
  if (sample.length < 20)
    return NextResponse.json(
      { error: "Değerlendirme için biraz daha uzun bir metin yaz." },
      { status: 400 },
    );

  try {
    const { object, model } = await generateAiObject({
      schema: diagnosticSchema,
      prompt: diagnosticPrompt(sample, ctx.profile.feedback_lang_override),
    });

    const supabase = await createClient();
    await supabase.from("level_history").insert({
      user_id: ctx.userId,
      cefr: object.cefr,
      numeric_estimate: object.numeric_estimate,
      source: "diagnostic",
    });
    await supabase
      .from("profiles")
      .update({ current_level: object.cefr, onboarded: true })
      .eq("user_id", ctx.userId);

    return NextResponse.json({ ...object, model });
  } catch (e) {
    console.error("diagnostic error", e);
    return NextResponse.json(
      { error: "Seviye değerlendirmesi yapılamadı." },
      { status: 500 },
    );
  }
}
