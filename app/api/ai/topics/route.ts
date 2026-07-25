import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { topicsSchema } from "@/lib/ai/schemas";
import { topicsPrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isAiConfigured())
    return NextResponse.json(
      {
        error:
          "AI anahtarı ayarlanmamış (OPENAI_API_KEY veya GOOGLE_GENERATIVE_AI_API_KEY).",
      },
      { status: 503 },
    );

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const interests: string | null = body.interests ?? ctx.profile.interests;
  const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : [];

  try {
    const { object, model } = await generateAiObject({
      schema: topicsSchema,
      temperature: 1.1,
      prompt: topicsPrompt(
        ctx.profile.current_level,
        interests,
        ctx.profile.feedback_lang_override,
        exclude,
      ),
    });
    return NextResponse.json({ ...object, model });
  } catch (e) {
    console.error("topics error", e);
    return NextResponse.json(
      { error: "Konu önerileri üretilemedi." },
      { status: 500 },
    );
  }
}
