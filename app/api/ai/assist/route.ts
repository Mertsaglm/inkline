import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { assistSchema } from "@/lib/ai/schemas";
import { assistPrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";

export const maxDuration = 30;

/**
 * İsteğe bağlı yardım: kullanıcı bir metni seçip destek ister.
 */
export async function POST(req: Request) {
  if (!isAiConfigured())
    return NextResponse.json(
      { error: "AI anahtarı ayarlanmamış." },
      { status: 503 },
    );

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const selection: string = (body.selection ?? "").toString().trim();
  const context: string = (body.context ?? "").toString();
  if (!selection)
    return NextResponse.json(
      { error: "Önce yardım almak istediğin metni seç." },
      { status: 400 },
    );

  try {
    const { object, model } = await generateAiObject({
      schema: assistSchema,
      prompt: assistPrompt(
        selection,
        context,
        ctx.profile.current_level,
        ctx.profile.feedback_lang_override,
      ),
    });
    return NextResponse.json({ ...object, model });
  } catch (e) {
    console.error("assist error", e);
    return NextResponse.json({ error: "Yardım üretilemedi." }, { status: 500 });
  }
}
