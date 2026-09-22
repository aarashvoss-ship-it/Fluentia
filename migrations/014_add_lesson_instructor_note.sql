alter table public.lessons
  add column if not exists instructor_note text not null default '';