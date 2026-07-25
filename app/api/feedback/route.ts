import { NextResponse } from "next/server";
import { ensureProfile } from "@/lib/db/profile";
import { createClient } from "@/lib/supabase/server";

/**
 * Kullanıcı bir öneriyi kabul/yoksay ettiğinde ya da isteğe bağlı yardım
 * uyguladığında öğrenme analitiği için kayıt tutar.
 */
export async function POST(req: Request) {
  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const kinds = ["grammar", "vocab", "structure", "spelling", "style"];
  if (!kinds.includes(b.kind))
    return NextResponse.json({ error: "Geçersiz kind." }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("feedback_events").insert({
    user_id: ctx.userId,
    essay_id: b.essay_id ?? null,
    kind: b.kind,
    severity: b.severity === "critical" ? "critical" : "suggestion",
    source: b.source === "proactive" ? "proactive" : "on_demand",
    span_text: b.span_text ?? null,
    message: (b.message ?? "").toString().slice(0, 500),
    suggestion: b.suggestion ?? null,
    status: ["shown", "accepted", "dismissed"].includes(b.status)
      ? b.status
      : "shown",
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
