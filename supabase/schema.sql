-- Run this whole file once in Supabase Studio: Project -> SQL Editor -> New query -> paste -> Run.

create extension if not exists "pgcrypto";

-- One row per user with their current calorie/macro goals and phase.
create table if not exists public.goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phase text not null default 'bulk' check (phase in ('bulk', 'maintain', 'cut')),
  calorie_target int not null default 3200,
  protein_target_g int not null default 150,
  carb_target_g int not null default 400,
  fat_target_g int not null default 90,
  current_weight_lb numeric,
  target_weight_lb numeric,
  weekly_rate_lb numeric not null default 0.75,
  height_in numeric,
  sex text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  photo_url text,
  food_name text not null,
  description text,
  calories int not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  score int not null default 50 check (score between 0 and 100),
  score_reason text not null default '',
  serving_note text,
  source text not null default 'scan' check (source in ('scan', 'recipe', 'manual'))
);
create index if not exists food_logs_user_time_idx on public.food_logs (user_id, logged_at desc);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  ingredients text not null,
  instructions text,
  servings int not null default 1,
  calories int not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  weight_lb numeric,
  waist_in numeric,
  chest_in numeric,
  arm_in numeric,
  notes text,
  unique (user_id, logged_at)
);
create index if not exists measurements_user_time_idx on public.measurements (user_id, logged_at desc);

create table if not exists public.lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  lift_name text not null,
  weight_lb numeric not null,
  reps int not null,
  sets int not null default 1
);
create index if not exists lifts_user_time_idx on public.lifts (user_id, logged_at desc);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at date not null default current_date,
  photo_url text not null,
  angle text not null default 'front' check (angle in ('front', 'side', 'back')),
  notes text
);
create index if not exists progress_photos_user_time_idx on public.progress_photos (user_id, taken_at desc);

-- Simple daily "I trained today" check-in, separate from detailed lift logging,
-- used to compute the gym-frequency side of the streak.
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at date not null default current_date,
  note text,
  unique (user_id, logged_at)
);
create index if not exists workouts_user_time_idx on public.workouts (user_id, logged_at desc);

-- One row per user tracking the Duolingo-style streak/flame/XP state.
-- Reconciled lazily (see /api/streak) rather than by a cron job.
create table if not exists public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  xp int not null default 0,
  flame_tier text not null default 'spark',
  freezes_available int not null default 0,
  frozen_dates date[] not null default '{}',
  last_checked_date date,
  widget_token text unique,
  updated_at timestamptz not null default now()
);
create index if not exists streaks_widget_token_idx on public.streaks (widget_token);

-- Row Level Security: every table is private to its own user.
alter table public.goals enable row level security;
alter table public.food_logs enable row level security;
alter table public.recipes enable row level security;
alter table public.measurements enable row level security;
alter table public.lifts enable row level security;
alter table public.progress_photos enable row level security;
alter table public.workouts enable row level security;
alter table public.streaks enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['goals','food_logs','recipes','measurements','lifts','progress_photos','workouts','streaks'])
  loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- Storage buckets for food photos and progress photos.
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- Storage RLS: users may only read/write files under a path that starts with their own user id,
-- e.g. food-photos/<user_id>/<filename>.jpg
drop policy if exists "food photos owner rw" on storage.objects;
create policy "food photos owner rw" on storage.objects
  for all using (
    bucket_id = 'food-photos' and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'food-photos' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "progress photos owner rw" on storage.objects;
create policy "progress photos owner rw" on storage.objects
  for all using (
    bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'progress-photos' and auth.uid()::text = (storage.foldername(name))[1]
  );
