import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Sunucu (server component / route handler) tarafında kullanılan Supabase istemcisi.
 * Next 16'da cookies() async'tir.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component içinden çağrıldığında set edilemez; middleware yeniler.
          }
        },
      },
    },
  );
}

/**
 * Mevcut (anonim veya kayıtlı) kullanıcıyı döner. Oturum yoksa null.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
