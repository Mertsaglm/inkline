import { notFound } from "next/navigation";
import { supabaseConfigured, aiConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/db/profile";
import EssayEditor from "@/components/editor/EssayEditor";
import type { Essay } from "@/lib/db/types";
import type { JSONContent } from "@tiptap/core";

export default async function EditEssayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!supabaseConfigured()) return <SetupNotice />;
  if (!aiConfigured()) return <SetupNotice needAi />;

  const { id } = await params;
  const ctx = await ensureProfile();
  if (!ctx) return <SetupNotice />;

  const supabase = await createClient();
  const { data } = await supabase
    .from("essays")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const essay = data as Essay;

  const content =
    essay.content &&
    typeof essay.content === "object" &&
    (essay.content as JSONContent).type
      ? (essay.content as JSONContent)
      : null;

  return (
    <EssayEditor
      essayId={essay.id}
      initialTitle={essay.title}
      initialPrompt={essay.prompt}
      initialContent={content}
      aiWarningsEnabled={ctx.profile.ai_warnings_enabled}
      level={ctx.profile.current_level}
    />
  );
}
