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

-- Feedback/comments — lets anyone signed in (e.g. family you invite to use
-- the app) leave you a note. Unlike the other tables this is intentionally
-- readable by every signed-in user (not just its own author), so you can
-- actually see what people say; you can only post as yourself, though.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_email text,
  author_username text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists feedback_time_idx on public.feedback (created_at desc);
-- Existing installs: add the column if the table already existed pre-username.
alter table public.feedback add column if not exists author_username text;

-- One row per user: a chosen display name shown instead of their email
-- anywhere other users can see it (comments, community). Username itself
-- is NOT used for login — auth stays email+password.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  updated_at timestamptz not null default now()
);
-- Existing installs: profile page adds a bio and an avatar on top of username.
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;

-- Images a user posts to their own profile gallery — separate from progress
-- photos (body-check tracking) and community posts (the shared feed).
-- Visible to anyone who visits that profile, postable/deletable only by
-- its owner.
create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists profile_photos_user_time_idx on public.profile_photos (user_id, created_at desc);

-- Direct messages between two users. A "conversation" isn't its own row —
-- it's just every message where you're the sender or the recipient, grouped
-- client-side by the other person's id. Realtime is enabled on this table
-- (see the publication block below) so a thread updates live.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_sender_time_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_time_idx on public.messages (recipient_id, created_at desc);

-- Free-form dated journal entries, shown on the Progress tab. Multiple
-- entries per day are allowed (unlike measurements, which are one-per-day).
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists journal_entries_user_time_idx on public.journal_entries (user_id, created_at desc);

-- Who follows whom. Not a "friendship" (one-directional, no approval needed) —
-- shown as a Follow/Unfollow button on someone's profile plus follower/
-- following counts.
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);

-- Web Push subscriptions (one row per browser/device that opted in). Sending
-- is done server-side with the service-role client (src/lib/push.ts), which
-- bypasses RLS entirely — the policies below only govern what a signed-in
-- user can do to their OWN subscription rows via the regular client
-- (subscribe/unsubscribe from Settings).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- A single shared, AI-moderated community discussion feed — separate from
-- the per-user "Comments" feedback wall. Every post is checked by the AI
-- moderator BEFORE it's inserted, so nothing that fails moderation is ever
-- stored (nothing to "hide" later, it just never lands here).
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_username text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_time_idx on public.community_posts (created_at desc);

-- Replies on a community post — what makes a post open into its own thread
-- page instead of being a flat, un-discussable list. Moderated the same way
-- as top-level posts (checked by AI before insert).
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_username text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_time_idx on public.community_comments (post_id, created_at asc);

-- Likes and comments on a profile gallery photo.
create table if not exists public.photo_likes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.profile_photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (photo_id, user_id)
);
create index if not exists photo_likes_photo_idx on public.photo_likes (photo_id);

create table if not exists public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.profile_photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_username text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists photo_comments_photo_time_idx on public.photo_comments (photo_id, created_at asc);

-- Row Level Security: every table is private to its own user.
alter table public.goals enable row level security;
alter table public.food_logs enable row level security;
alter table public.recipes enable row level security;
alter table public.measurements enable row level security;
alter table public.lifts enable row level security;
alter table public.progress_photos enable row level security;
alter table public.workouts enable row level security;
alter table public.streaks enable row level security;
alter table public.feedback enable row level security;
alter table public.profiles enable row level security;
alter table public.journal_entries enable row level security;
alter table public.community_posts enable row level security;
alter table public.profile_photos enable row level security;
alter table public.messages enable row level security;
alter table public.community_comments enable row level security;
alter table public.photo_likes enable row level security;
alter table public.photo_comments enable row level security;
alter table public.follows enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['goals','food_logs','recipes','measurements','lifts','progress_photos','workouts','streaks','journal_entries','push_subscriptions'])
  loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- feedback is the one table that isn't strictly owner-only: everyone signed
-- in can read every row (so you see comments from anyone using the app),
-- but you can only ever insert a row as yourself.
drop policy if exists "feedback_select_all" on public.feedback;
create policy "feedback_select_all" on public.feedback
  for select using (auth.uid() is not null);

drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own" on public.feedback
  for insert with check (auth.uid() = user_id);

-- Added so users can delete their own comments (previously missing entirely,
-- so nobody — not even the author — could delete one via the normal client).
-- The "developer code" delete-any-comment path in Settings goes through the
-- service-role admin client server-side instead, which bypasses RLS.
drop policy if exists "feedback_delete_own" on public.feedback;
create policy "feedback_delete_own" on public.feedback
  for delete using (auth.uid() = user_id);

-- profiles: any signed-in user can look up usernames (needed to render
-- other people's names on comments/community posts), but you can only
-- create/update your own.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- community_posts: same shape as feedback — readable by anyone signed in,
-- postable/deletable only as yourself (plus the admin/service-role path).
drop policy if exists "community_select_all" on public.community_posts;
create policy "community_select_all" on public.community_posts
  for select using (auth.uid() is not null);

drop policy if exists "community_insert_own" on public.community_posts;
create policy "community_insert_own" on public.community_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "community_delete_own" on public.community_posts;
create policy "community_delete_own" on public.community_posts
  for delete using (auth.uid() = user_id);

-- community_comments: same shape as community_posts — readable by anyone
-- signed in, postable/deletable only as yourself.
drop policy if exists "community_comments_select_all" on public.community_comments;
create policy "community_comments_select_all" on public.community_comments
  for select using (auth.uid() is not null);

drop policy if exists "community_comments_insert_own" on public.community_comments;
create policy "community_comments_insert_own" on public.community_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "community_comments_delete_own" on public.community_comments;
create policy "community_comments_delete_own" on public.community_comments
  for delete using (auth.uid() = user_id);

-- photo_likes / photo_comments: anyone signed in can see who liked/commented
-- on a photo (needed to render counts on someone else's profile), but you
-- can only ever like/comment/unlike as yourself.
drop policy if exists "photo_likes_select_all" on public.photo_likes;
create policy "photo_likes_select_all" on public.photo_likes
  for select using (auth.uid() is not null);

drop policy if exists "photo_likes_insert_own" on public.photo_likes;
create policy "photo_likes_insert_own" on public.photo_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "photo_likes_delete_own" on public.photo_likes;
create policy "photo_likes_delete_own" on public.photo_likes
  for delete using (auth.uid() = user_id);

drop policy if exists "photo_comments_select_all" on public.photo_comments;
create policy "photo_comments_select_all" on public.photo_comments
  for select using (auth.uid() is not null);

drop policy if exists "photo_comments_insert_own" on public.photo_comments;
create policy "photo_comments_insert_own" on public.photo_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "photo_comments_delete_own" on public.photo_comments;
create policy "photo_comments_delete_own" on public.photo_comments
  for delete using (auth.uid() = user_id);

-- follows: anyone signed in can see who follows whom (needed for follower/
-- following counts on a profile), but you can only follow/unfollow as
-- yourself.
drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all" on public.follows
  for select using (auth.uid() is not null);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows
  for delete using (auth.uid() = follower_id);

-- profile_photos: anyone signed in can view anyone's gallery (profile pages
-- are public within the app), but you can only post/delete your own images.
drop policy if exists "profile_photos_select_all" on public.profile_photos;
create policy "profile_photos_select_all" on public.profile_photos
  for select using (auth.uid() is not null);

drop policy if exists "profile_photos_insert_own" on public.profile_photos;
create policy "profile_photos_insert_own" on public.profile_photos
  for insert with check (auth.uid() = user_id);

drop policy if exists "profile_photos_delete_own" on public.profile_photos;
create policy "profile_photos_delete_own" on public.profile_photos
  for delete using (auth.uid() = user_id);

-- messages: you can only read a message if you sent or received it, and you
-- can only ever insert a message as its sender.
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert with check (auth.uid() = sender_id);

-- Enable Realtime (live updates without refreshing) for the messages table.
-- Safe to re-run: adding a table that's already in the publication just
-- raises a notice, which this block swallows.
do $$
begin
  execute 'alter publication supabase_realtime add table public.messages';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Storage buckets for food photos and progress photos.
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

-- Profile avatars and gallery images, e.g. profile-media/<user_id>/avatar.jpg
-- and profile-media/<user_id>/gallery/<filename>.jpg.
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
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

drop policy if exists "profile media owner rw" on storage.objects;
create policy "profile media owner rw" on storage.objects
  for all using (
    bucket_id = 'profile-media' and auth.uid()::text = (storage.foldername(name))[1]
  ) with check (
    bucket_id = 'profile-media' and auth.uid()::text = (storage.foldername(name))[1]
  );
