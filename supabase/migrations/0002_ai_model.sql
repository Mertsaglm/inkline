-- Notu hangi AI modelinin ürettiğini sakla (essay detay sayfasında gösterilir).
-- Eski kayıtlar null kalır; arayüz bu durumda rozeti çizmez.
alter table public.essay_grades
  add column if not exists ai_model text;
