<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!--
  Everything below is project-specific and safe from Next.js updates: the
  markers above delimit the Next.js-managed block, and anything outside them is
  never overwritten (see node_modules/next/dist/docs/01-app/02-guides/ai-agents.md).
-->

# Inkline — project rules

A live, AI-powered English **writing** coach for Turkish speakers. Full
description, setup and deploy notes: [README.md](README.md).

## Conventions that are easy to get wrong

**Tailwind v4, CSS-first — there is no `tailwind.config.js`.** Tokens live in
`app/globals.css` under `@theme inline`. Hand-written `@layer base/components/
utilities` blocks are **silently dropped** from the compiled CSS — no error, the
styles simply never exist. Write custom classes **unlayered**. If a style isn't
applying, check whether it's trapped in an `@layer` before debugging specificity.

**Every AI call goes through `lib/ai/provider.ts`.** Use
`generateAiObject({ schema, prompt })` — never import `@ai-sdk/*` directly in a
route. That module owns the ordered model chain, the failover, the per-provider
reasoning budget, and it returns which model actually answered. New AI route =
add a Zod schema in `lib/ai/schemas.ts`, a prompt in `lib/ai/prompts.ts`, then
call the one entry point.

**Structured output: one field, one job.** Splitting `message` (explanation) from
`replacement` (verbatim text, or `null`) in `checkSchema` exists because a single
ambiguous field made the model write prose that got pasted into the learner's
essay. Keep prompt rules and the server-side guard in `app/api/ai/check/route.ts`
in sync with the schema — don't trust the model, make it verifiable.

**Light theme is the default, deliberately.** `prefers-color-scheme` is not
consulted anywhere in the app; dark lives entirely in the `.dark` class on
`<html>`. Do not reintroduce a system-preference media query. (`app/icon.svg` is
the one intended exception — it sits in browser chrome, not on our page.)

**UI copy is Turkish.** Only the learner's practice content and AI-facing prompts
are English. Dates render `tr-TR`. Explanations adapt to CEFR level via
`lib/cefr.ts`: A1–A2 Turkish, B1–B2 mixed, C1–C2 English.

**Auth is anonymous and automatic.** `proxy.ts` (Next 16's renamed middleware)
signs every visitor in via Supabase anonymous auth on each request. There is no
login screen and none should be added; RLS depends on a real `auth.uid()`.

**Supabase query builders are lazy thenables.** `from(...).update(...).eq(...)`
sends nothing until it is awaited. An un-awaited write is not a race — it simply
never happens, silently. Always `await` the whole chain. (This shipped as a real
bug once; see the `toggleAi` test in `tests/editor/EssayEditor.test.tsx`.)

## The test suite is part of the contract

`tests/` encodes the rules on this page as executable checks — the section above
is not just documentation, `tests/contracts/conventions.test.ts` enforces it.
Read [tests/README.md](tests/README.md) before changing anything there.

- A red test means the **code** is suspect first. Most of these tests guard
  failures that are invisible on screen (the wrong word gets underlined, a level
  is miscalculated, AI failover quietly stops working).
- To genuinely change a rule, update this file **and** its test together.
  Deleting the test alone erases the reason the rule existed.
- New AI route? `tests/contracts/conventions.test.ts` will go red until you add
  it to `AI_ROUTES`/`ALL_ROUTES`. That is deliberate.
- New value in a `kind` / `severity` / `status` / CEFR union? It lives in four
  places (SQL CHECK, TS union, Zod enum, route allowlist).
  `tests/contracts/schema-drift.test.ts` keeps them from drifting apart —
  TypeScript cannot.

## Boundaries

- **Never write API keys anywhere, and don't read `.env.local`.** The owner
  enters secrets himself. Use targeted edits if `.env.local` must change.
- `gereksiz/` and `Proje Yardımcısı - inkline/` (matched by the `/Proje
  Yardımcısı*/` ignore rule) are gitignored, local-only, and not part of the app.
  Never add build-time dependencies on them. The second one holds personal notes
  — if you ever see it in `git status`, the ignore rule is broken; fix that
  before committing anything.
- Schema changes need a numbered migration in `supabase/migrations/`, and the
  owner runs it manually in the Supabase SQL Editor.

## Before you claim it works

`npm run verify` (= `tsc --noEmit && vitest run && next build`) must pass — all
three, every time. The tests need no env vars and no API keys.

A green build does not prove the app is configured: it succeeds without any env
vars, falling back to the setup screen. So check the browser too, and say plainly
what you actually ran.
