# Smash ELO: setup (about 30 to 45 minutes)

Three rating tracks per player: Overall (every match), 1v1 (2-player matches), FFA (3+ players).
New players get a faster rating swing for their first 10 games in each track.

## 1. Database (Supabase, free)
1. Create an account at supabase.com and make a new project (any name, save the database password).
2. Open **SQL Editor > New query**, paste the contents of `schema.sql`, click **Run**.
3. Open **Project Settings > API**. Copy the **Project URL** and the **service_role** key (keep it secret).

## 2. Code (GitHub, free)
1. Create an account at github.com, then **New repository** (private is fine).
2. Click **uploading an existing file** and drag in everything from this folder (api, public, package.json, schema.sql, README.md). Commit.

## 3. Hosting (Vercel, free)
1. Create an account at vercel.com with "Continue with GitHub".
2. **Add New > Project**, import your repo, leave all build settings as default.
3. Before deploying, open **Environment Variables** and add:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_KEY` = your service_role key
   - `GROUP_PASSCODE` = a passcode you give your friends
   - `ADMIN_PASSCODE` = a different passcode only you know
   - `ANTHROPIC_API_KEY` = from console.anthropic.com (add a few dollars of credit). Leave it out to turn scanning off.
4. Click **Deploy**. Your site is at the `.vercel.app` address it shows.

## 4. Use it
On iPhone, open the site in Safari > Share > **Add to Home Screen**.
Everyone can view. To add matches, enter the group passcode when asked. To delete matches, enter the admin passcode in Settings.

## Notes
- The leaderboard refreshes every 8 seconds, not instantly.
- The scan limit (30 per hour) is best-effort. Set a monthly spend limit in the Anthropic console too.
- Ratings are recalculated from all matches each time, so deleting a wrong match fixes everyone's numbers.
- If you change `GROUP_PASSCODE`, redeploy in Vercel and have friends re-enter it.
