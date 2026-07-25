import type { CefrLevel } from "@/lib/cefr";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type EssayStatus = "draft" | "completed";
export type FeedbackKind =
  | "grammar"
  | "vocab"
  | "structure"
  | "spelling"
  | "style";
export type FeedbackSeverity = "critical" | "suggestion";
export type FeedbackSource = "proactive" | "on_demand";

export interface Profile {
  user_id: string;
  current_level: CefrLevel;
  target_level: CefrLevel;
  ai_warnings_enabled: boolean;
  feedback_lang_override: "auto" | "tr" | "mixed" | "en";
  interests: string | null;
  streak: number;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Essay {
  id: string;
  user_id: string;
  title: string;
  prompt: string | null;
  content: Json; // TipTap JSON
  plain_text: string;
  status: EssayStatus;
  word_count: number;
  level_at_writing: CefrLevel | null;
  created_at: string;
  completed_at: string | null;
}

export interface RubricScores {
  task_achievement: number; // 0..9
  coherence_cohesion: number;
  lexical_resource: number;
  grammatical_range: number;
}

export interface EssayGrade {
  id: string;
  essay_id: string;
  user_id: string;
  rubric: RubricScores;
  overall_score: number; // 0..9 (IELTS benzeri band)
  cefr_estimate: CefrLevel;
  summary_feedback: string;
  corrected_text: string;
  strengths: string[];
  improvements: string[];
  /** Notu üreten model; 0002 migration'ından önceki kayıtlarda null. */
  ai_model: string | null;
  created_at: string;
}

export interface FeedbackEvent {
  id: string;
  essay_id: string | null;
  user_id: string;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  source: FeedbackSource;
  span_text: string | null;
  message: string;
  suggestion: string | null;
  status: "shown" | "accepted" | "dismissed";
  created_at: string;
}

export interface LevelHistory {
  id: string;
  user_id: string;
  cefr: CefrLevel;
  numeric_estimate: number;
  source: "diagnostic" | "essay";
  essay_id: string | null;
  assessed_at: string;
}

export interface Topic {
  id: string;
  user_id: string | null;
  cefr: CefrLevel;
  title: string;
  prompt: string;
  category: string | null;
  created_at: string;
}
