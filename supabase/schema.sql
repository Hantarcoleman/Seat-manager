-- ── נתוני משתמש (כל הכיתות + תלמידים + סידורים שמורים) ────────────────────
create table if not exists user_app_data (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  classrooms_data   jsonb not null default '{}',
  students_data     jsonb not null default '{}',
  arrangements_data jsonb not null default '{}',
  updated_at  timestamptz default now()
);

alter table user_app_data enable row level security;

create policy "user owns their data"
  on user_app_data for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── היסטוריית סידורי ישיבה (snapshot ממוין לפי תאריך) ───────────────────
create table if not exists arrangement_history (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  classroom_id   text not null,
  classroom_name text,
  name           text,
  data           jsonb not null,
  created_at     timestamptz default now()
);

create index if not exists arrangement_history_user_classroom
  on arrangement_history(user_id, classroom_id, created_at desc);

alter table arrangement_history enable row level security;

create policy "user owns their history"
  on arrangement_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
