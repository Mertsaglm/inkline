-- ============================================================
--  İngilizce Writing App — başlangıç şeması
--  Çok-kullanıcılı altyapı (anonim auth dahil) + RLS
-- ============================================================

-- CEFR seviye kontrolü için ortak ifade
create domain cefr_level as text
  check (value in ('A1','A2','B1','B2','C1','C2'));

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_level cefr_level not null default 'A2',
  target_level  cefr_level not null default 'B2',
  ai_warnings_enabled boolean not null default true,
  feedback_lang_override text not null default 'auto'
    check (feedback_lang_override in ('auto','tr','mixed','en')),
  interests text,
  streak int not null default 0,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- essays ----------
create table if not exists public.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  prompt text,
  content jsonb not null default '{}'::jsonb,   -- TipTap JSON
  plain_text text not null default '',
  status text not null default 'draft' check (status in ('draft','completed')),
  word_count int not null default 0,
  level_at_writing cefr_level,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists essays_user_idx on public.essays(user_id, created_at desc);

-- ---------- essay_grades ----------
create table if not exists public.essay_grades (
  id uuid primary key default gen_random_uuid(),
  essay_id uuid not null references public.essays(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rubric jsonb not null,             -- {task_achievement, coherence_cohesion, lexical_resource, grammatical_range}
  overall_score numeric(3,1) not null,
  cefr_estimate cefr_level not null,
  summary_feedback text not null default '',
  corrected_text text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists grades_user_idx on public.essay_grades(user_id, created_at desc);
create index if not exists grades_essay_idx on public.essay_grades(essay_id);

-- ---------- feedback_events (öğrenme analitiği) ----------
create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  essay_id uuid references public.essays(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('grammar','vocab','structure','spelling','style')),
  severity text not null check (severity in ('critical','suggestion')),
  source text not null check (source in ('proactive','on_demand')),
  span_text text,
  message text not null,
  suggestion text,
  status text not null default 'shown' check (status in ('shown','accepted','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback_events(user_id, created_at desc);
create index if not exists feedback_kind_idx on public.feedback_events(user_id, kind);

-- ---------- level_history ----------
create table if not exists public.level_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cefr cefr_level not null,
  numeric_estimate numeric(3,1) not null,
  source text not null check (source in ('diagnostic','essay')),
  essay_id uuid references public.essays(id) on delete set null,
  assessed_at timestamptz not null default now()
);
create index if not exists level_history_user_idx on public.level_history(user_id, assessed_at);

-- ---------- topics (öneri cache) ----------
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  cefr cefr_level not null,
  title text not null,
  prompt text not null,
  category text,
  created_at timestamptz not null default now()
);
create index if not exists topics_user_idx on public.topics(user_id, created_at desc);

-- ============================================================
--  updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
--  Yeni kullanıcı (anonim dahil) için otomatik profil
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.essays         enable row level security;
alter table public.essay_grades   enable row level security;
alter table public.feedback_events enable row level security;
alter table public.level_history  enable row level security;
alter table public.topics         enable row level security;

-- profiles
create policy "own profile - select" on public.profiles for select using (auth.uid() = user_id);
create policy "own profile - insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "own profile - update" on public.profiles for update using (auth.uid() = user_id);

-- essays
create policy "own essays - select" on public.essays for select using (auth.uid() = user_id);
create policy "own essays - insert" on public.essays for insert with check (auth.uid() = user_id);
create policy "own essays - update" on public.essays for update using (auth.uid() = user_id);
create policy "own essays - delete" on public.essays for delete using (auth.uid() = user_id);

-- essay_grades
create policy "own grades - select" on public.essay_grades for select using (auth.uid() = user_id);
create policy "own grades - insert" on public.essay_grades for insert with check (auth.uid() = user_id);

-- feedback_events
create policy "own feedback - select" on public.feedback_events for select using (auth.uid() = user_id);
create policy "own feedback - insert" on public.feedback_events for insert with check (auth.uid() = user_id);
create policy "own feedback - update" on public.feedback_events for update using (auth.uid() = user_id);

-- level_history
create policy "own level - select" on public.level_history for select using (auth.uid() = user_id);
create policy "own level - insert" on public.level_history for insert with check (auth.uid() = user_id);

-- topics (global topics = user_id null herkese açık okunur)
create policy "topics - select" on public.topics for select using (user_id is null or auth.uid() = user_id);
create policy "topics - insert" on public.topics for insert with check (auth.uid() = user_id);
create policy "topics - delete" on public.topics for delete using (auth.uid() = user_id);
