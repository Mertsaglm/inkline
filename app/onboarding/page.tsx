import { supabaseConfigured, aiConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  if (!supabaseConfigured()) return <SetupNotice />;
  if (!aiConfigured()) return <SetupNotice needAi />;
  return <OnboardingClient />;
}
