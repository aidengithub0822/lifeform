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

-- Lets a user explicitly log food against a past day (e.g. "forgot to log
-- yesterday's dinner") without that entry silently earning streak/XP credit
-- it didn't happen to have "for real" — the scan page sets this false
-- whenever the chosen log date isn't today, and streakService excludes
-- false rows from the day-activity set it uses for streak continuity.
alter table public.food_logs add column if not exists counts_for_streak boolean not null default true;

-- Diary slot (Breakfast / Lunch / Dinner / Snacks), like MyFitnessPal. Null on
-- older rows; the app then guesses from the time of day they were logged.
alter table public.food_logs add column if not exists meal text;
alter table public.food_logs drop constraint if exists food_logs_meal_check;
alter table public.food_logs add constraint food_logs_meal_check
  check (meal is null or meal in ('breakfast', 'lunch', 'dinner', 'snack'));

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

-- Tags a logged lift to the muscle groups it trained (many-to-many: a row
-- per muscle a given lift worked, e.g. bench press -> chest + shoulders +
-- triceps). Populated from the exercise's fixed catalog mapping at log time
-- so the muscle-rank engine never has to guess from free-text names.
create table if not exists public.lift_muscles (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  muscle_group text not null
);
create index if not exists lift_muscles_lift_idx on public.lift_muscles (lift_id);
create index if not exists lift_muscles_user_muscle_idx on public.lift_muscles (user_id, muscle_group);

-- One row per user: the result of the Train split-setup quiz (goal, ideal
-- body weight, gender, and the chosen split). `day_index` advances through
-- the split's day list each time "Start workout" is tapped on /fitness so
-- "today's workout" rotates Upper A -> Lower A -> Upper B -> ... instead of
-- always showing day 1.
create table if not exists public.training_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  training_goal text not null check (training_goal in ('build_muscle', 'get_stronger', 'lose_fat', 'general_fitness')),
  split_type text not null check (split_type in ('upper_lower', 'ppl', 'bro_split')),
  ideal_weight_lb numeric,
  sex text,
  day_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at date not null default current_date,
  photo_url text not null,
  angle text not null default 'front' check (angle in ('front', 'side', 'back')),
  notes text
);
create index if not exists progress_photos_user_time_idx on public.progress_photos (user_id, taken_at desc);

-- AI vision analysis, run once right after upload (see
-- /api/progress-photos/analyze) so Coach and the rank engine can both read
-- a stable, already-computed assessment instead of re-analyzing the image
-- every time. ai_leanness_score is 0-100 (higher = leaner/more defined),
-- directly comparable across a user's own photos of the same angle over
-- time — NOT a body-fat-percentage estimate, since vision models can't
-- reliably produce one; it's an ordinal signal, not a lab measurement.
alter table public.progress_photos add column if not exists ai_leanness_score int check (ai_leanness_score between 0 and 100);
alter table public.progress_photos add column if not exists ai_summary text;
alter table public.progress_photos add column if not exists ai_analyzed_at timestamptz;

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

-- Developer-mode-only cosmetics: a custom name color and a verified
-- checkmark. Neither is ever settable by the user themselves — see the
-- trigger below, which pins both columns to their previous value on any
-- update that doesn't come from the service-role client (i.e. anything
-- other than /api/admin/users/[userId]).
alter table public.profiles add column if not exists name_color text;
alter table public.profiles add column if not exists verified boolean not null default false;

-- Strength/consistency rank tag (newbie/bronze/.../grand_champion) — see
-- src/lib/rank.ts for the tier table and anti-cheat logic. Computed
-- server-side from lifts/measurements/streak XP/account age and written
-- only by /api/rank using the service-role client, so — like name_color
-- and verified above — a regular authenticated update can never set this
-- column directly (see the trigger below).
alter table public.profiles add column if not exists rank text not null default 'newbie';
-- created_at is needed to gate ranks on "how long they've been on the app".
-- Backfill existing rows from their actual signup date (auth.users) rather
-- than defaulting everyone to "today", which would unfairly zero out
-- longtime users' account age the moment this column is added.
alter table public.profiles add column if not exists created_at timestamptz not null default now();
update public.profiles p set created_at = u.created_at
  from auth.users u where p.user_id = u.id and p.created_at > u.created_at;

-- The user's IANA timezone (e.g. "America/Chicago"), kept in sync
-- automatically by TimezoneSync.tsx on every app open. Every "what day is
-- it" decision that runs server-side (streak reconciliation, the home
-- page's "today", Coach's date context) reads this instead of assuming
-- UTC — see src/lib/timezone.ts for why that assumption used to push food
-- logs and the streak onto the wrong day for hours around midnight in any
-- timezone west of UTC. Freely settable by the user's own client (not
-- locked like rank/name_color/verified above) since it's just a device
-- fact, not a privileged field.
alter table public.profiles add column if not exists timezone text not null default 'UTC';

create or replace function public.lock_profile_admin_fields()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.name_color := old.name_color;
    new.verified := old.verified;
    new.rank := old.rank;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists lock_profile_admin_fields on public.profiles;
create trigger lock_profile_admin_fields
  before update on public.profiles
  for each row execute function public.lock_profile_admin_fields();

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
-- Existing installs: a message can now be a photo instead of (or with) text.
alter table public.messages alter column body drop not null;
alter table public.messages add column if not exists photo_url text;

-- Group chats. Kept as its own separate model from the 1:1 `messages` table
-- above rather than retrofitting it — the existing DM system is pairwise by
-- design (sender_id/recipient_id, no thread id) and works fine as-is; adding
-- an N-participant concept to it would mean migrating every existing row.
-- A `conversations` row with is_group = false isn't used today (every DM
-- still goes through `messages`) but the shape allows for it later.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default true,
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_participants_user_idx on public.conversation_participants (user_id);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_username text,
  body text,
  photo_url text,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv_time_idx on public.conversation_messages (conversation_id, created_at asc);

-- One row per (conversation, member) tracking how far that member has read —
-- lets every message show "seen by so-and-so" rather than a single
-- sender/recipient read_at like the 1:1 messages table has.
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Membership-check helpers, SECURITY DEFINER so they bypass RLS on
-- conversation_participants themselves — needed because several policies
-- below (including conversation_participants' own SELECT policy) would
-- otherwise have to subquery the very table they're guarding, which is the
-- classic self-referential-RLS footgun.
create or replace function public.is_conversation_participant(conv_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = uid
  );
$$;

create or replace function public.is_conversation_admin(conv_id uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv_id and user_id = uid and is_admin = true
  );
$$;
-- Read receipts: set by the recipient (via an update they're allowed to make
-- under the existing "owner_all"-style policy below, restricted to rows
-- addressed to them) the moment they open the thread.
alter table public.messages add column if not exists read_at timestamptz;

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
-- Existing installs: posts can now carry a photo (Discover-style feed).
alter table public.community_posts add column if not exists photo_url text;

-- Mirror every profile gallery photo into the community feed as its own
-- post — "post to your profile" and "show up in Community" are meant to be
-- the same action, and the community feed already shows everyone (no
-- follow filter), so mirroring alone makes new photos visible regardless
-- of who follows whom. Plain-text community posts are NOT mirrored back
-- onto a profile — that link only ever runs profile_photos -> community,
-- never the other way.
alter table public.profile_photos add column if not exists community_post_id uuid references public.community_posts(id) on delete set null;

create or replace function public.mirror_profile_photo_to_community()
returns trigger as $$
declare
  uname text;
  new_post_id uuid;
begin
  select username into uname from public.profiles where user_id = new.user_id;
  insert into public.community_posts (user_id, author_username, message, photo_url, created_at)
  values (new.user_id, uname, coalesce(new.caption, ''), new.photo_url, new.created_at)
  returning id into new_post_id;
  new.community_post_id := new_post_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists mirror_profile_photo_to_community on public.profile_photos;
create trigger mirror_profile_photo_to_community
  before insert on public.profile_photos
  for each row execute function public.mirror_profile_photo_to_community();

-- Deleting a gallery photo removes its mirrored community post too, so a
-- removed photo doesn't linger in the feed as an orphaned post.
create or replace function public.unmirror_profile_photo_from_community()
returns trigger as $$
begin
  if old.community_post_id is not null then
    delete from public.community_posts where id = old.community_post_id;
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists unmirror_profile_photo_from_community on public.profile_photos;
create trigger unmirror_profile_photo_from_community
  before delete on public.profile_photos
  for each row execute function public.unmirror_profile_photo_from_community();

-- Existing installs: backfill a mirrored community post for every profile
-- photo uploaded before this trigger existed, preserving its original
-- timestamp so the combined feed still sorts correctly.
do $$
declare
  r record;
  new_post_id uuid;
begin
  for r in select * from public.profile_photos where community_post_id is null loop
    insert into public.community_posts (user_id, author_username, message, photo_url, created_at)
    values (r.user_id, (select username from public.profiles where user_id = r.user_id), coalesce(r.caption, ''), r.photo_url, r.created_at)
    returning id into new_post_id;
    update public.profile_photos set community_post_id = new_post_id where id = r.id;
  end loop;
end $$;

-- Replies on a community post — what makes a post open into its own thread
-- page instead of being a flat, un-discussable list. Moderated the same way
-- as top-level posts (checked by AI before insert). parent_id is null for a
-- top-level reply to the post itself, or another comment's id for a reply
-- to that reply — lets the thread nest instead of staying flat.
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_username text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_time_idx on public.community_comments (post_id, created_at asc);
-- Existing installs: nested replies.
alter table public.community_comments add column if not exists parent_id uuid references public.community_comments(id) on delete cascade;
create index if not exists community_comments_parent_idx on public.community_comments (parent_id);

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

-- Likes on a community post/comment — same shape as photo_likes.
create table if not exists public.community_post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists community_post_likes_post_idx on public.community_post_likes (post_id);

create table if not exists public.community_comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists community_comment_likes_comment_idx on public.community_comment_likes (comment_id);

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
alter table public.community_post_likes enable row level security;
alter table public.community_comment_likes enable row level security;
alter table public.photo_comments enable row level security;
alter table public.follows enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.lift_muscles enable row level security;
alter table public.training_plans enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_reads enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['goals','food_logs','recipes','measurements','lifts','progress_photos','workouts','streaks','journal_entries','push_subscriptions','lift_muscles','training_plans'])
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

-- community_post_likes / community_comment_likes: same shape as
-- photo_likes — anyone signed in can see who liked what (for counts),
-- but you can only like/unlike as yourself.
drop policy if exists "community_post_likes_select_all" on public.community_post_likes;
create policy "community_post_likes_select_all" on public.community_post_likes
  for select using (auth.uid() is not null);

drop policy if exists "community_post_likes_insert_own" on public.community_post_likes;
create policy "community_post_likes_insert_own" on public.community_post_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "community_post_likes_delete_own" on public.community_post_likes;
create policy "community_post_likes_delete_own" on public.community_post_likes
  for delete using (auth.uid() = user_id);

drop policy if exists "community_comment_likes_select_all" on public.community_comment_likes;
create policy "community_comment_likes_select_all" on public.community_comment_likes
  for select using (auth.uid() is not null);

drop policy if exists "community_comment_likes_insert_own" on public.community_comment_likes;
create policy "community_comment_likes_insert_own" on public.community_comment_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "community_comment_likes_delete_own" on public.community_comment_likes;
create policy "community_comment_likes_delete_own" on public.community_comment_likes
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

-- Read receipts: the RECIPIENT (never the sender) can mark a message read —
-- this is the only field a recipient is allowed to touch on someone else's
-- row, enforced by the trigger below rather than a column-level grant.
drop policy if exists "messages_mark_read" on public.messages;
create policy "messages_mark_read" on public.messages
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create or replace function public.lock_message_read_receipt()
returns trigger as $$
begin
  -- Only read_at may change via a regular (non-service-role) update; every
  -- other field snaps back to its previous value so a recipient can't
  -- rewrite a message's content while marking it read.
  if auth.role() <> 'service_role' then
    new.sender_id := old.sender_id;
    new.recipient_id := old.recipient_id;
    new.body := old.body;
    new.photo_url := old.photo_url;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists lock_message_read_receipt on public.messages;
create trigger lock_message_read_receipt
  before update on public.messages
  for each row execute function public.lock_message_read_receipt();

-- conversations: only participants can see a group; creating one is open to
-- any signed-in user (they're always the first participant added in the
-- same request); renaming/deleting is admin-only.
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant" on public.conversations
  for select using (
    created_by = auth.uid() or public.is_conversation_participant(id, auth.uid())
  );

drop policy if exists "conversations_insert_own" on public.conversations;
create policy "conversations_insert_own" on public.conversations
  for insert with check (auth.uid() = created_by);

drop policy if exists "conversations_update_admin" on public.conversations;
create policy "conversations_update_admin" on public.conversations
  for update using (public.is_conversation_admin(id, auth.uid()))
  with check (public.is_conversation_admin(id, auth.uid()));

drop policy if exists "conversations_delete_admin" on public.conversations;
create policy "conversations_delete_admin" on public.conversations
  for delete using (public.is_conversation_admin(id, auth.uid()));

-- conversation_participants: a member can see every other member of a group
-- they're in (needed to render the member list). Adding a member is allowed
-- for the group's creator (covers the very first insert, when no admin row
-- exists yet) or an existing admin; removing a member is allowed for that
-- member themselves (leaving) or an admin (kicking); only an admin can flip
-- is_admin on someone.
drop policy if exists "conversation_participants_select_member" on public.conversation_participants;
create policy "conversation_participants_select_member" on public.conversation_participants
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "conversation_participants_insert_admin" on public.conversation_participants;
create policy "conversation_participants_insert_admin" on public.conversation_participants
  for insert with check (
    public.is_conversation_admin(conversation_id, auth.uid())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

drop policy if exists "conversation_participants_delete_self_or_admin" on public.conversation_participants;
create policy "conversation_participants_delete_self_or_admin" on public.conversation_participants
  for delete using (
    auth.uid() = user_id or public.is_conversation_admin(conversation_id, auth.uid())
  );

drop policy if exists "conversation_participants_update_admin" on public.conversation_participants;
create policy "conversation_participants_update_admin" on public.conversation_participants
  for update using (public.is_conversation_admin(conversation_id, auth.uid()))
  with check (public.is_conversation_admin(conversation_id, auth.uid()));

-- conversation_messages: only participants can read/send; you can only ever
-- delete your own message.
drop policy if exists "conversation_messages_select_member" on public.conversation_messages;
create policy "conversation_messages_select_member" on public.conversation_messages
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "conversation_messages_insert_member" on public.conversation_messages;
create policy "conversation_messages_insert_member" on public.conversation_messages
  for insert with check (
    auth.uid() = sender_id and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "conversation_messages_delete_own" on public.conversation_messages;
create policy "conversation_messages_delete_own" on public.conversation_messages
  for delete using (auth.uid() = sender_id);

-- conversation_reads: every member can see everyone's read marker (needed
-- for "seen by ..." under a message), but you can only ever write your own.
drop policy if exists "conversation_reads_select_member" on public.conversation_reads;
create policy "conversation_reads_select_member" on public.conversation_reads
  for select using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "conversation_reads_upsert_own" on public.conversation_reads;
create policy "conversation_reads_upsert_own" on public.conversation_reads
  for insert with check (
    auth.uid() = user_id and public.is_conversation_participant(conversation_id, auth.uid())
  );

drop policy if exists "conversation_reads_update_own" on public.conversation_reads;
create policy "conversation_reads_update_own" on public.conversation_reads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

do $$
begin
  execute 'alter publication supabase_realtime add table public.conversation_messages';
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

-- ============================================================================
-- In-app notifications (tags/@mentions, replies), edit + unsend permissions.
-- Safe to re-run. Rows are written by the server with the service-role key, so
-- there is deliberately no insert policy: nobody can forge a notification.
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_username text,
  type text not null default 'mention',
  title text not null default '',
  body text not null default '',
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);

-- Owners can edit their own community posts and replies.
drop policy if exists "community_update_own" on public.community_posts;
create policy "community_update_own" on public.community_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "community_comments_update_own" on public.community_comments;
create policy "community_comments_update_own" on public.community_comments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Senders can unsend (delete) their own direct messages.
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete using (auth.uid() = sender_id);

-- ============================================================================
-- Coach chat history: every Coach conversation is saved so you can come back
-- to it, continue it, or delete it. Safe to re-run.
-- ============================================================================
create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coach_conversations_user_idx on public.coach_conversations (user_id, updated_at desc);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.coach_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists coach_messages_convo_idx on public.coach_messages (conversation_id, created_at);

alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;

drop policy if exists "owner_all" on public.coach_conversations;
create policy "owner_all" on public.coach_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "owner_all" on public.coach_messages;
create policy "owner_all" on public.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- Dev tools: pinned posts, video posts, moderation bypass. Safe to re-run.
-- ============================================================================

-- Pinned posts float to the top of the feed. Only the developer (service-role
-- API route) can change these — a trigger snaps them back for everyone else,
-- including on insert, so a user can't pin their own post through the API.
alter table public.community_posts add column if not exists pinned boolean not null default false;
alter table public.community_posts add column if not exists pinned_at timestamptz;
alter table public.community_posts add column if not exists video_url text;
-- Timed pin: when set, the pin lasts until this moment (the developer's
-- "pin for 5 minutes"), and the post can't be deleted by its author until then.
alter table public.community_posts add column if not exists pinned_until timestamptz;
create index if not exists community_posts_pinned_idx on public.community_posts (pinned, pinned_at desc);

create or replace function public.lock_community_pin_fields()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.pinned := false;
      new.pinned_at := null;
      new.pinned_until := null;
    else
      new.pinned := old.pinned;
      new.pinned_at := old.pinned_at;
      new.pinned_until := old.pinned_until;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists lock_community_pin_fields on public.community_posts;
create trigger lock_community_pin_fields
  before insert or update on public.community_posts
  for each row execute function public.lock_community_pin_fields();

-- While a post is under a timed pin, only the developer (service role) can delete it.
create or replace function public.protect_pinned_post_delete()
returns trigger as $$
begin
  if old.pinned_until is not null and old.pinned_until > now() and auth.role() <> 'service_role' then
    raise exception 'This post is locked for a few minutes because it was pinned.';
  end if;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_pinned_post_delete on public.community_posts;
create trigger protect_pinned_post_delete
  before delete on public.community_posts
  for each row execute function public.protect_pinned_post_delete();

-- Accounts the developer has approved to skip the AI post filter and to post
-- videos. Locked like name_color/verified/rank: only the service role can set it.
alter table public.profiles add column if not exists bypass_moderation boolean not null default false;

create or replace function public.lock_profile_admin_fields()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    new.name_color := old.name_color;
    new.verified := old.verified;
    new.rank := old.rank;
    new.bypass_moderation := old.bypass_moderation;
  end if;
  return new;
end;
$$ language plpgsql security definer;
