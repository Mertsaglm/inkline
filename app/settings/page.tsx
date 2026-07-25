import { supabaseConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import { ensureProfile } from "@/lib/db/profile";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!supabaseConfigured()) return <SetupNotice />;
  const ctx = await ensureProfile();
  if (!ctx) return <SetupNotice />;
  return <SettingsClient profile={ctx.profile} />;
}
