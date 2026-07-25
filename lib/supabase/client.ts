import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcı (client component) tarafında kullanılan Supabase istemcisi.
 * Anonim oturum çerezleri middleware tarafından ayarlanır; burada okunur.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
