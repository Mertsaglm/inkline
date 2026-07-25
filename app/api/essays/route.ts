import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

/** Yeni bir taslak essay oluşturur, id döner. */
export async function POST(req: Request) {
  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("essays")
    .insert({
      user_id: ctx.userId,
      title: (b.title ?? "Untitled").toString().slice(0, 200),
      prompt: b.prompt ? b.prompt.toString().slice(0, 1000) : null,
      level_at_writing: ctx.profile.current_level,
    })
    .select("id")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
