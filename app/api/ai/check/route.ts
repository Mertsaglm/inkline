import { NextResponse } from "next/server";
import { generateAiObject, isAiConfigured } from "@/lib/ai/provider";
import { checkSchema } from "@/lib/ai/schemas";
import { checkPrompt } from "@/lib/ai/prompts";
import { ensureProfile } from "@/lib/db/profile";

export const maxDuration = 30;

/**
 * `replacement` doğrudan kullanıcının metnine yazılıyor — bu yüzden gerçekten
 * "yerine geçebilir" bir metin olduğundan emin ol. Model kural gereği sadece
 * düzeltmeyi yazmalı, ama bazen açıklama/alternatif döküyor
 * (ör. `"you are really enjoying" veya daha uygun: "you really enjoy"`).
 * Böyle bir şey metne girerse cümleyi bozar; onun yerine null'a düşürüp
 * öneriyi "sadece açıklama" hâline getiriyoruz.
 */
function safeReplacement(replacement: string | null, span: string) {
  if (!replacement) return null;
  const r = replacement.trim();
  if (!r || r === span) return null;
  // Çift tırnak = alternatif sayma / alıntı → düzeltme değil, anlatım.
  // (Tek tırnağa dokunma: "don't" gibi meşru kesme işaretleri var.)
  if (/["“”]/.test(r)) return null;
  if (/[\r\n]/.test(r)) return null;
  // Düzeltme, düzeltilen parçaya yakın uzunlukta olmalı.
  if (r.length > span.length * 3 + 30) return null;
  return r;
}

/**
 * Canlı kritik-hata kontrolü. İstemci, yazım durduğunda (debounce) değişen
 * paragrafı gönderir. Sonuçları döndürür; DB'ye kalıcı yazma, kullanıcı
 * bir öneriyi kabul/yoksay ettiğinde /api/feedback üzerinden yapılır.
 */
export async function POST(req: Request) {
  if (!isAiConfigured())
    return NextResponse.json({ issues: [] });

  const ctx = await ensureProfile();
  if (!ctx) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  // Kullanıcı uyarıları kapattıysa hiç AI çağrısı yapma.
  if (!ctx.profile.ai_warnings_enabled) return NextResponse.json({ issues: [] });

  const body = await req.json().catch(() => ({}));
  // İstemci `text` gönderiyor; `paragraph` eski adı — ikisini de kabul et.
  const paragraph: string = (body.text ?? body.paragraph ?? "").toString();
  if (paragraph.trim().length < 12) return NextResponse.json({ issues: [] });

  try {
    const { object, model } = await generateAiObject({
      schema: checkSchema,
      prompt: checkPrompt(
        paragraph,
        ctx.profile.current_level,
        ctx.profile.feedback_lang_override,
      ),
    });

    // Sadece span_text metinde gerçekten bulunanları döndür (konumlandırma güvenliği),
    // ve metne yazılacak düzeltmeyi ayrıca doğrula.
    const issues = object.issues
      .filter((i) => i.span_text && paragraph.includes(i.span_text))
      .map((i) => ({
        ...i,
        replacement: safeReplacement(i.replacement, i.span_text),
      }));

    return NextResponse.json({ issues, model });
  } catch (e) {
    console.error("check error", e);
    return NextResponse.json({ issues: [] });
  }
}
