import { supabaseConfigured, aiConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import WriteClient from "./WriteClient";

export const dynamic = "force-dynamic";

export default function WritePage() {
  if (!supabaseConfigured()) return <SetupNotice />;
  if (!aiConfigured()) return <SetupNotice needAi />;
  return <WriteClient />;
}
