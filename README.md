# lifeform

A food-photo calorie/macro tracker with a Yuka-style 0-100 food score, a recipe saver, a body-transformation log, and a Duolingo-style daily streak — built as an installable iPhone web app (no App Store needed).

It's a real Next.js app with real accounts and a real database (Supabase), so it works like a proper personal app, not a demo. Total setup time is about 15-20 minutes, almost all of it clicking through free signups.

## What you're setting up

1. **Supabase** — free hosted database + auth + file storage
2. **Anthropic API key** — powers the food photo scanning/scoring
3. **Vercel** — free hosting that gives your app a real HTTPS URL
4. Then you "Add to Home Screen" on your iPhone and it behaves like a native app

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign up, and create a new project (any name/region/password — save the DB password somewhere).
2. Once it's ready, open **SQL Editor** in the left sidebar → **New query**.
3. Open `supabase/schema.sql` from this project, copy the whole file, paste it in, and click **Run**. This creates every table, security policy, and the two photo storage buckets.
4. Go to **Project Settings → API**. You'll need two values from here in a minute: the **Project URL** and the **anon public** key.
5. Go to **Authentication → Sign In / Providers → Email** and turn **off** "Confirm email" if you want to skip email verification while testing (you can turn it back on later). If you leave it on, Supabase needs a "Site URL" set under **Authentication → URL Configuration** — set it to your Vercel URL once you have it (step 3).

## 2. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign up.
2. Add a small amount of credit (a few dollars covers a lot of food scans — each scan is a single short API call).
3. Go to **API Keys → Create Key** and copy it.

## 3. Deploy to Vercel

1. Push this project to a GitHub repo (or ask Claude to do it for you if you're working in Cowork with a connected GitHub).
2. Go to [vercel.com](https://vercel.com), sign up, **Add New Project**, import that repo.
3. Before deploying, add these **Environment Variables** in the Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key (also on the API settings page — only used server-side, powers the home-screen widget below)
   - `ANTHROPIC_API_KEY` = your Anthropic key
4. Click **Deploy**. In ~1 minute you'll get a URL like `https://lifeform-yourname.vercel.app`.
5. If you turned email confirmation on in step 1, go back to Supabase → **Authentication → URL Configuration** and set Site URL + a redirect URL of `https://your-vercel-url.vercel.app/auth/callback`.

## 4. Install it on your iPhone

1. Open your Vercel URL in **Safari** on your iPhone (has to be Safari, not Chrome).
2. Tap the **Share** button → **Add to Home Screen**.
3. Open it from your home screen — it now runs full-screen, no browser bar, with its own icon, and can use your camera directly.

## 5. First run

1. Sign up with an email/password.
2. You'll land on the goals screen pre-filled with a lean-bulk starting point (~140 lb, 6'0", 0.75 lb/week). Adjust and save.
3. Tap **Scan**, take a photo of food, review the AI's estimate and score, and log it.
4. Log a training day and keep your food streak going — the flame only *grows* on a day where you log food AND hit your rolling 4-day/week gym target; otherwise it holds (or breaks without a freeze).

## Home Screen widget (see your streak without opening the app)

True native iOS home-screen widgets require a Swift app built in Xcode — not something a web app can register, PWA or not. Instead, this ships with a script for **Scriptable** (free on the App Store), which is the standard way to get a real, custom home-screen widget without native development:

1. Install **Scriptable** from the App Store.
2. Open it, tap **+**, paste in the contents of `scriptable/lifeform-widget.js` from this project, name the script "lifeform".
3. In the app, tap the flame (top right) → **Home Screen widget** → **Copy** to grab your personal widget URL.
4. On your home screen: long-press → **+** → search **Scriptable** → add a small widget.
5. Long-press that new widget → **Edit Widget** → set **Script** to "lifeform" → paste the URL into **Parameter**.

Now your home screen shows the flame, streak count, tier, and this week's gym progress — no need to open the app. The URL acts like a password (it's how the widget proves which account it's showing), so don't post it publicly; you can always get a fresh one later if needed by regenerating it in Supabase.

You'll also get a small number badge on the app icon itself (iOS 16.4+) showing your current streak, automatically, whenever you've opened the app recently.

## How the food score works

Every scan sends your photo to Claude along with your current goal phase (bulk/cut/maintain) and targets. The scoring logic is written into `src/app/api/scan-food/route.ts` — during a bulk, calorie-dense, protein-adequate foods (a burger, pizza, chicken tenders with rice) score well; something is scored down mainly for being protein-poor for its calories or a portion too small to help a bulk, not just for being "unclean." You can edit that prompt anytime to change how it judges food.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your real keys
npm run dev
```

Visit `http://localhost:3000`. Note: iPhone camera capture and installing to home screen only work over HTTPS, so use the deployed Vercel URL for real on-phone testing, not localhost.

## Project structure

- `src/app/` — pages and API routes (Next.js App Router)
- `src/app/api/scan-food/` — the Claude vision call that scores your food
- `src/app/api/streak/` — the streak/flame/XP reconciliation logic
- `src/lib/streak.ts` — pure streak math (tiers, XP, freezes), easy to tune
- `src/lib/nutrition.ts` — calorie/protein/macro target formulas used in onboarding
- `supabase/schema.sql` — the entire database schema, run once

## Extending it later

- **Native App Store app**: this can be wrapped later (e.g. with Capacitor) into a real iOS binary if you eventually want App Store distribution — that requires an Apple Developer account ($99/year) and Xcode, which is a separate project.
- **Multi-user**: the schema is already per-user via Supabase Row Level Security, so your mom or family can sign up with their own accounts on the same deployed app whenever you're ready.
- **Barcode scanning / restaurant database**: could be added later using a nutrition API (e.g. USDA FoodData Central, which is free) alongside the photo scoring.
