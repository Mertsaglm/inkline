export const supabaseConfigured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

/**
 * OpenAI ya da Gemini anahtarından biri yeterli. Öncelik ve yedekleme
 * mantığı lib/ai/provider.ts içinde.
 */
export const aiConfigured = () =>
  Boolean(
    process.env.OPENAI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  );
