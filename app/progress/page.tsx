import { supabaseConfigured, aiConfigured } from "@/lib/config";
import SetupNotice from "@/components/SetupNotice";
import { createClient } from "@/lib/supabase/server";
import ProgressClient from "./ProgressClient";

export const dynamic = "force-dynamic";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default async function ProgressPage() {
  if (!supabaseConfigured()) return <SetupNotice />;
  if (!aiConfigured()) return <SetupNotice needAi />;

  const supabase = await createClient();

  const { data: levels } = await supabase
    .from("level_history")
    .select("numeric_estimate, assessed_at")
    .order("assessed_at", { ascending: true });

  const { data: grades } = await supabase
    .from("essay_grades")
    .select("overall_score, created_at")
    .order("created_at", { ascending: true });

  const { data: feedback } = await supabase
    .from("feedback_events")
    .select("kind");

  const levelSeries = (levels ?? []).map((l) => ({
    date: shortDate(l.assessed_at),
    value: Number(l.numeric_estimate),
  }));

  const scoreSeries = (grades ?? []).map((g) => ({
    date: shortDate(g.created_at),
    score: Number(g.overall_score),
  }));

  const counts: Record<string, number> = {};
  for (const f of feedback ?? []) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  const kindCounts = Object.entries(counts).map(([kind, count]) => ({
    kind,
    count,
  }));

  return (
    <ProgressClient
      levelSeries={levelSeries}
      kindCounts={kindCounts}
      scoreSeries={scoreSeries}
      hasData={(grades?.length ?? 0) > 0}
    />
  );
}
