import { createClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

/**
 * Mevcut kullanıcıyı ve profilini döner; profil yoksa oluşturur
 * (auth trigger'ı devre dışıysa güvenlik ağı).
 */
export async function ensureProfile(): Promise<{
  userId: string;
  profile: Profile;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) return { userId: user.id, profile: existing as Profile };

  const { data: created } = await supabase
    .from("profiles")
    .insert({ user_id: user.id })
    .select("*")
    .single();

  return { userId: user.id, profile: created as Profile };
}
